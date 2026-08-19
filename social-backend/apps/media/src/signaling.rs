//! The signalling connection loop.
//!
//! One task per client, owning that client's socket, its two peer connections
//! and its participant record. Everything a connection needs is reachable from
//! this task, so there are no locks on the hot path and cleanup is a single
//! code path at the bottom of one function.
//!
//! ## Lifecycle
//!
//! ```text
//!   upgrade
//!     │
//!     ├─ wait for `join` (10 s, then close)
//!     ├─ verify the media token — the only authentication that exists here
//!     ├─ build publisher + subscriber peer connections
//!     ├─ add the participant to the room, auto-subscribing to live audio
//!     ├─ send `joined`
//!     │
//!     ├─◀────────────── select loop ──────────────▶
//!     │   client frames · peer events · renegotiation · room events · pings
//!     │
//!     └─ on any exit: leave the room, detach every subscriber, close both
//!        peer connections, abort every forwarding task
//! ```
//!
//! The cleanup runs whether the client says goodbye, the socket drops, ICE
//! fails, or the process is shutting down — which is the point of putting it
//! after the loop rather than in each exit branch.

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use futures::stream::{SplitSink, SplitStream};
use futures::{SinkExt, StreamExt};
use social_media_core::events::RoomEvent;
use social_media_core::track::{ParticipantId, TrackKind};
use social_media_core::vad::{SpeakingTransition, VadMode};
use social_media_room::participant::Participant;
use social_media_room::{MediaRoom, MediaRoomError, ParticipantPeers, PeerEvent, PeerEvents};
use social_media_signaling::limits::{
    HANDSHAKE_TIMEOUT_SECONDS, IDLE_TIMEOUT_SECONDS, MAX_FRAME_BYTES, MAX_MESSAGE_BYTES,
    MAX_MESSAGES_PER_SECOND, PING_INTERVAL_SECONDS,
};
use social_media_signaling::protocol::{decode_client_message, validate_sdp_direction};
use social_media_signaling::{
    ClientMessage, PeerTarget, ProtocolError, ServerMessage, SignalCloseCode, PROTOCOL_VERSION,
};
use tokio::sync::broadcast;
use tokio::time::{MissedTickBehavior, interval, timeout};
use tracing::Instrument;
use uuid::Uuid;

use crate::error::MediaError;
use crate::state::MediaState;

/// How long a single outbound frame may block before the client is considered
/// stuck. Without this, one client that stops reading would park this task
/// forever holding its peer connections open.
const SEND_TIMEOUT: Duration = Duration::from_secs(5);

type Sender = SplitSink<WebSocket, Message>;
type Receiver = SplitStream<WebSocket>;

/// `GET /ws/media` — upgrade to the signalling protocol.
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<MediaState>) -> Response {
    let connection_id = Uuid::new_v4();

    ws
        // Frame limits are applied before a byte reaches our code, so an
        // oversized message costs the process nothing.
        .max_frame_size(MAX_FRAME_BYTES)
        .max_message_size(MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| {
            let span = tracing::info_span!("media_connection", %connection_id);
            async move {
                if let Err(error) = run(socket, state, connection_id).await {
                    tracing::debug!(%error, "connection ended");
                }
            }
            .instrument(span)
        })
}

/// Drive one client connection from upgrade to teardown.
async fn run(socket: WebSocket, state: MediaState, connection_id: Uuid) -> Result<(), MediaError> {
    let (mut tx, mut rx) = socket.split();

    // ---- 1. handshake ----------------------------------------------------
    let joined = match handshake(&mut tx, &mut rx, &state).await {
        Ok(joined) => joined,
        Err(error) => {
            // Tell the client *why* before closing: a close code alone cannot
            // distinguish "your token expired, fetch a new one" from "you may
            // not enter this room", and those need different client
            // behaviour.
            report(&mut tx, &error).await;
            close(&mut tx, error.close_code()).await;
            return Err(error);
        }
    };

    let Joined { room, participant, peers, mut events, participant_id, room_id } = joined;

    tracing::info!(
        %room_id,
        %participant_id,
        user_id = %participant.user_id(),
        "participant joined"
    );

    // ---- 2. steady state -------------------------------------------------
    let mut room_events = room.subscribe_events();
    let outcome = pump(
        &mut tx,
        &mut rx,
        &state,
        &room,
        &participant,
        &peers,
        &mut events,
        &mut room_events,
        participant_id,
    )
    .await;

    // ---- 3. teardown -----------------------------------------------------
    // Reached from every exit: a clean `leave`, a dropped socket, an ICE
    // failure, or an error above.
    if let Err(error) = state.rooms.leave(room_id, participant_id).await {
        tracing::debug!(%error, %room_id, %participant_id, "leave failed");
    }
    peers.close().await;

    let code = match outcome.as_ref() {
        Ok(()) => SignalCloseCode::Normal,
        Err(error) => {
            report(&mut tx, error).await;
            error.close_code()
        }
    };
    close(&mut tx, code).await;

    tracing::info!(%room_id, %participant_id, %connection_id, "participant left");
    outcome
}

/// Everything produced by a successful handshake.
struct Joined {
    room: Arc<MediaRoom>,
    participant: Arc<Participant>,
    peers: Arc<ParticipantPeers>,
    events: PeerEvents,
    participant_id: ParticipantId,
    room_id: Uuid,
}

/// Wait for `join`, verify the token, and admit the participant.
async fn handshake(
    tx: &mut Sender,
    rx: &mut Receiver,
    state: &MediaState,
) -> Result<Joined, MediaError> {
    let deadline = Duration::from_secs(HANDSHAKE_TIMEOUT_SECONDS);

    // A socket that connects and says nothing is the cheapest possible way to
    // consume server resources, so it gets a short leash.
    let (claimed_room, token) = timeout(deadline, await_join(rx))
        .await
        .map_err(|_| MediaError::HandshakeTimeout)??;

    let claims = state.verifier.verify(&token, &claimed_room)?;
    let room_id = claims.room;
    let participant_id = claims.pid;

    let (peers, events) = state.peers.create(participant_id).await?;

    let participant = Participant::new(
        participant_id,
        claims.sub,
        claims.name.clone(),
        claims.perms,
        peers.sink(),
    );

    let (room, _attached) = state.rooms.join(room_id, participant.clone()).await?;

    // Sent before anything else, so a client always knows who it is and who
    // was already there before the first event arrives.
    send(
        tx,
        &ServerMessage::Joined {
            protocol_version: PROTOCOL_VERSION,
            participant_id,
            room_id: room_id.to_string(),
            participants: room
                .participant_infos()
                .await
                .into_iter()
                .filter(|info| info.participant_id != participant_id)
                .collect(),
            ice_servers: state.config.ice.ice_servers.clone(),
        },
    )
    .await?;

    Ok(Joined { room, participant, peers, events, participant_id, room_id })
}

/// Read frames until a `join` arrives, rejecting anything else.
async fn await_join(rx: &mut Receiver) -> Result<(String, String), MediaError> {
    while let Some(frame) = rx.next().await {
        let frame = frame.map_err(|_| MediaError::ConnectionClosed)?;

        match frame {
            Message::Text(text) => match decode_client_message(&text)? {
                ClientMessage::Join { room_id, token } => return Ok((room_id, token)),
                other if other.allowed_before_join() => continue,
                other => {
                    return Err(MediaError::Protocol(ProtocolError::BeforeJoin {
                        message: other.kind(),
                    }));
                }
            },
            Message::Close(_) => return Err(MediaError::ConnectionClosed),
            // Ping/Pong are answered by the transport; binary frames are not
            // part of this protocol version.
            Message::Ping(_) | Message::Pong(_) => continue,
            Message::Binary(_) => {
                return Err(MediaError::Protocol(ProtocolError::BeforeJoin {
                    message: "binary frame",
                }));
            }
        }
    }

    Err(MediaError::ConnectionClosed)
}

/// The steady-state loop.
#[allow(clippy::too_many_arguments)]
async fn pump(
    tx: &mut Sender,
    rx: &mut Receiver,
    state: &MediaState,
    room: &Arc<MediaRoom>,
    participant: &Arc<Participant>,
    peers: &Arc<ParticipantPeers>,
    events: &mut PeerEvents,
    room_events: &mut broadcast::Receiver<RoomEvent>,
    participant_id: ParticipantId,
) -> Result<(), MediaError> {
    let mut ping = interval(Duration::from_secs(PING_INTERVAL_SECONDS));
    // A stalled task must not produce a burst of catch-up ticks.
    ping.set_missed_tick_behavior(MissedTickBehavior::Delay);

    let mut last_activity = Instant::now();
    let mut budget = MessageBudget::new();

    loop {
        tokio::select! {
            // Client frames.
            frame = rx.next() => {
                let Some(frame) = frame else { return Ok(()) };
                let frame = frame.map_err(|_| MediaError::ConnectionClosed)?;
                last_activity = Instant::now();

                match frame {
                    Message::Text(text) => {
                        if !budget.allow() {
                            return Err(MediaError::Protocol(ProtocolError::TooLarge {
                                limit: MAX_MESSAGES_PER_SECOND as usize,
                            }));
                        }
                        let message = decode_client_message(&text)?;
                        if matches!(message, ClientMessage::Leave) {
                            return Ok(());
                        }
                        handle_client(tx, state, room, participant, peers, participant_id, message)
                            .await?;
                    }
                    Message::Close(_) => return Ok(()),
                    Message::Ping(_) | Message::Pong(_) => {}
                    Message::Binary(_) => {
                        return Err(MediaError::Protocol(ProtocolError::BeforeJoin {
                            message: "binary frame",
                        }));
                    }
                }
            }

            // Events from this participant's own peer connections.
            Some(event) = events.events.recv() => {
                handle_peer_event(tx, room, participant, participant_id, event).await?;
            }

            // The subscriber connection gained or lost a track.
            Some(()) = events.renegotiate.recv() => {
                renegotiate(tx, peers).await?;
            }

            // Events from everyone else in the room.
            event = room_events.recv() => {
                match event {
                    Ok(event) => {
                        // A participant does not need to be told they joined;
                        // the `joined` payload already said so.
                        let is_own_join = matches!(event, RoomEvent::ParticipantJoined { .. })
                            && event.subject() == participant_id;
                        if !is_own_join {
                            send(tx, &ServerMessage::event(event)).await?;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(missed)) => {
                        // Only speaking indicators are frequent enough to lag,
                        // and they are self-correcting.
                        tracing::debug!(missed, "room event stream lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => return Ok(()),
                }
            }

            _ = ping.tick() => {
                if last_activity.elapsed() > Duration::from_secs(IDLE_TIMEOUT_SECONDS) {
                    return Err(MediaError::IdleTimeout);
                }
                if tx.send(Message::Ping(Default::default())).await.is_err() {
                    return Err(MediaError::ConnectionClosed);
                }
            }
        }
    }
}

/// Act on one client message.
async fn handle_client(
    tx: &mut Sender,
    state: &MediaState,
    room: &Arc<MediaRoom>,
    participant: &Arc<Participant>,
    peers: &Arc<ParticipantPeers>,
    participant_id: ParticipantId,
    message: ClientMessage,
) -> Result<(), MediaError> {
    validate_sdp_direction(&message)?;

    match message {
        // A second join on the same socket would mean two identities on one
        // connection; there is no sane interpretation.
        ClientMessage::Join { .. } => {
            Err(MediaError::Protocol(ProtocolError::BeforeJoin { message: "join" }))
        }

        ClientMessage::Offer { sdp, .. } => {
            let answer = peers.accept_publisher_offer(sdp).await?;
            send(tx, &ServerMessage::Answer { target: PeerTarget::Publisher, sdp: answer }).await
        }

        ClientMessage::Answer { sdp, .. } => {
            // Tracks may have been added while the offer was in flight.
            if peers.accept_subscriber_answer(sdp).await? {
                renegotiate(tx, peers).await?;
            }
            Ok(())
        }

        ClientMessage::IceCandidate { target, candidate, sdp_mid, sdp_mline_index } => {
            if let Err(error) =
                peers.add_ice_candidate(target, candidate, sdp_mid, sdp_mline_index).await
            {
                // A candidate can legitimately arrive before the description
                // it belongs to; that is a warning, not a fatal error.
                tracing::debug!(%error, target = target.as_str(), "ice candidate rejected");
            }
            Ok(())
        }

        ClientMessage::PublishIntent { kind, client_track_id } => {
            peers.declare_intent(client_track_id, kind).await;
            Ok(())
        }

        ClientMessage::Subscribe { track_id, .. } => {
            match room.subscribe(participant_id, &track_id).await {
                Ok(_) => Ok(()),
                Err(error) => reply_error(tx, &error).await,
            }
        }

        ClientMessage::Unsubscribe { track_id, .. } => {
            match room.unsubscribe(participant_id, &track_id).await {
                Ok(_) => Ok(()),
                Err(error) => reply_error(tx, &error).await,
            }
        }

        ClientMessage::Mute { muted } => {
            participant.update_state(|s| {
                s.audio_muted = muted;
                s.muted_by_moderator = false;
                if muted {
                    // A muted participant is not speaking, whatever the last
                    // VAD sample said.
                    s.speaking = false;
                }
            })
            .await;

            room.emit(if muted {
                RoomEvent::MicrophoneMuted { participant_id, by_moderator: false }
            } else {
                RoomEvent::MicrophoneUnmuted { participant_id }
            });
            Ok(())
        }

        ClientMessage::Camera { enabled } => {
            participant.update_state(|s| s.camera_enabled = enabled).await;
            room.emit(if enabled {
                RoomEvent::CameraEnabled { participant_id }
            } else {
                RoomEvent::CameraDisabled { participant_id }
            });
            Ok(())
        }

        ClientMessage::ScreenShare { enabled } => {
            participant.update_state(|s| s.screen_sharing = enabled).await;
            room.emit(if enabled {
                RoomEvent::ScreenShareStarted { participant_id }
            } else {
                RoomEvent::ScreenShareStopped { participant_id }
            });

            // Stopping a share ends the track even if the client never gets
            // around to renegotiating.
            if !enabled {
                let _ = room.unpublish_track(participant_id, TrackKind::ScreenShare).await;
            }
            Ok(())
        }

        ClientMessage::Speaking { speaking } => {
            // Honoured only when the server is not deriving this itself.
            // Otherwise a client could claim the speaking ring at will.
            if state.config.vad_mode == VadMode::ClientReported {
                apply_speaking(room, participant, participant_id, speaking).await;
            }
            Ok(())
        }

        ClientMessage::Ping => send(tx, &ServerMessage::Pong).await,

        // Handled by the caller so it can return cleanly.
        ClientMessage::Leave => Ok(()),
    }
}

/// Act on one peer-connection event.
async fn handle_peer_event(
    tx: &mut Sender,
    room: &Arc<MediaRoom>,
    participant: &Arc<Participant>,
    participant_id: ParticipantId,
    event: PeerEvent,
) -> Result<(), MediaError> {
    match event {
        PeerEvent::IceCandidate { target, candidate, sdp_mid, sdp_mline_index } => {
            send(
                tx,
                &ServerMessage::IceCandidate { target, candidate, sdp_mid, sdp_mline_index },
            )
            .await
        }

        PeerEvent::ConnectionState { target, state } => {
            use social_media_room::sfu::connection_state_is_terminal;
            tracing::debug!(target = target.as_str(), ?state, "peer connection state");

            participant
                .update_state(|s| s.connection = social_media_room::sfu::map_connection_state(state))
                .await;

            if connection_state_is_terminal(state) {
                // ICE gave up: the participant is gone whether or not the
                // WebSocket noticed.
                return Err(MediaError::ConnectionClosed);
            }
            Ok(())
        }

        PeerEvent::TrackReady { track } => {
            let kind = track.kind();
            match room.publish_track(participant_id, track).await {
                Ok(_) => {
                    tracing::debug!(%participant_id, %kind, "track registered with room");
                    Ok(())
                }
                Err(MediaRoomError::AlreadyPublishing(_)) => {
                    // A renegotiation can re-announce a track we already have.
                    Ok(())
                }
                Err(error) => reply_error(tx, &error).await,
            }
        }

        PeerEvent::TrackEnded { kind } => {
            let _ = room.unpublish_track(participant_id, kind).await;
            Ok(())
        }

        PeerEvent::Speaking { transition } => {
            apply_speaking(
                room,
                participant,
                participant_id,
                transition == SpeakingTransition::Started,
            )
            .await;
            Ok(())
        }
    }
}

/// Offer the subscriber connection's current track set to the client.
async fn renegotiate(tx: &mut Sender, peers: &Arc<ParticipantPeers>) -> Result<(), MediaError> {
    // `None` means an exchange is already in flight; the need is remembered
    // and a fresh offer goes out when the answer lands.
    if let Some(sdp) = peers.create_subscriber_offer().await? {
        send(tx, &ServerMessage::Offer { target: PeerTarget::Subscriber, sdp }).await?;
    }
    Ok(())
}

/// Update and broadcast speaking state, but only on a change.
async fn apply_speaking(
    room: &Arc<MediaRoom>,
    participant: &Arc<Participant>,
    participant_id: ParticipantId,
    speaking: bool,
) {
    let before = participant.state().await;
    if before.speaking == speaking {
        return;
    }
    // A muted participant never lights up, whatever the source claims.
    if speaking && before.audio_muted {
        return;
    }

    participant.update_state(|s| s.speaking = speaking).await;
    room.emit(if speaking {
        RoomEvent::SpeakingStarted { participant_id }
    } else {
        RoomEvent::SpeakingStopped { participant_id }
    });
}

/// Report a non-fatal failure without ending the connection.
async fn reply_error(tx: &mut Sender, error: &MediaRoomError) -> Result<(), MediaError> {
    send(tx, &ServerMessage::error(error.code(), error.client_message())).await
}

/// Serialise and write one message.
///
/// A send that blocks for [`SEND_TIMEOUT`] means the client has stopped
/// reading; the connection is ended rather than parked.
async fn send(tx: &mut Sender, message: &ServerMessage) -> Result<(), MediaError> {
    let json = match serde_json::to_string(message) {
        Ok(json) => json,
        Err(error) => {
            tracing::error!(%error, "failed to serialise a server message");
            return Ok(());
        }
    };

    match timeout(SEND_TIMEOUT, tx.send(Message::Text(json.into()))).await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(_)) | Err(_) => Err(MediaError::ConnectionClosed),
    }
}

/// Tell the client what went wrong, best effort.
///
/// Skipped when the socket is already gone — there is nobody to tell — and the
/// message is the sanitised one, never an internal error string.
async fn report(tx: &mut Sender, error: &MediaError) {
    if matches!(error, MediaError::ConnectionClosed) {
        return;
    }
    let message = ServerMessage::error(error.code(), error.client_message());
    let _ = send(tx, &message).await;
}

/// Send a close frame, best effort.
async fn close(tx: &mut Sender, code: SignalCloseCode) {
    let frame = CloseFrame { code: code.code(), reason: code.reason().into() };
    let _ = timeout(SEND_TIMEOUT, tx.send(Message::Close(Some(frame)))).await;
}

/// A fixed-window message budget for one socket.
///
/// Signalling is inherently bursty — an offer plus a dozen trickled candidates
/// arrive together — so the window is generous. It exists to stop a client
/// spinning on `subscribe`, not to shape normal traffic.
struct MessageBudget {
    window_started: Instant,
    count: u32,
}

impl MessageBudget {
    fn new() -> Self {
        Self { window_started: Instant::now(), count: 0 }
    }

    fn allow(&mut self) -> bool {
        if self.window_started.elapsed() >= Duration::from_secs(1) {
            self.window_started = Instant::now();
            self.count = 0;
        }
        self.count += 1;
        self.count <= MAX_MESSAGES_PER_SECOND
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_message_budget_allows_a_normal_signalling_burst() {
        let mut budget = MessageBudget::new();
        // An offer plus twenty trickled candidates.
        for _ in 0..21 {
            assert!(budget.allow());
        }
    }

    #[test]
    fn the_message_budget_stops_a_spinning_client() {
        let mut budget = MessageBudget::new();
        for _ in 0..MAX_MESSAGES_PER_SECOND {
            assert!(budget.allow());
        }
        assert!(!budget.allow());
    }

    #[test]
    fn the_message_budget_window_resets() {
        let mut budget = MessageBudget::new();
        for _ in 0..MAX_MESSAGES_PER_SECOND {
            budget.allow();
        }
        assert!(!budget.allow());

        budget.window_started = Instant::now() - Duration::from_secs(2);
        assert!(budget.allow(), "a new second is a new budget");
    }
}
