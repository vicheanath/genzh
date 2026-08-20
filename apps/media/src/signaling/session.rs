//! The steady-state loop, and the socket it owns.
//!
//! [`Session`] is what the rest of this module is written against. It exists
//! because the loop needs seven things at once — the socket, the room, the
//! participant, the peer connections, the server config, the message budget,
//! the idle clock — and threading those through free functions produced a
//! nine-argument signature that every new feature made longer.
//!
//! It is also the *only* thing that writes to the socket. Every reply goes
//! through [`Session::send`], so the send timeout, the serialisation failure
//! path, and the rule that a stuck client is disconnected rather than waited
//! on are decided once instead of at each call site.

use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use axum::extract::ws::{CloseFrame, Message, WebSocket};
use futures::stream::{SplitSink, SplitStream};
use futures::{SinkExt, StreamExt};
use genzh_media_core::events::RoomEvent;
use genzh_media_core::track::ParticipantId;
use genzh_media_room::participant::Participant;
use genzh_media_room::{MediaRoom, MediaRoomError, ParticipantTransport, PeerEvents};
use genzh_media_signaling::limits::{IDLE_TIMEOUT_SECONDS, PING_INTERVAL_SECONDS};
use genzh_media_signaling::protocol::{decode_client_message, validate_sdp_direction};
use genzh_media_signaling::{
    ClientMessage, MessageBudget, ProtocolError, ServerMessage, SignalCloseCode,
};
use tokio::sync::broadcast;
use tokio::time::{MissedTickBehavior, interval, timeout};

use crate::error::MediaError;
use crate::state::MediaState;

/// How long a single outbound frame may block before the client is considered
/// stuck. Without this, one client that stops reading would park this task
/// forever holding its peer connections open.
pub(super) const SEND_TIMEOUT: Duration = Duration::from_secs(5);

pub(super) type Sender = SplitSink<WebSocket, Message>;
pub(super) type Receiver = SplitStream<WebSocket>;

/// Where a connection's outbound frames go.
///
/// A trait rather than the socket itself, for the same reason
/// [`genzh_media_room::ParticipantTransport`] is one: the rules this module
/// enforces — a stuck client is disconnected rather than waited on, an event
/// about your own arrival is not echoed back, a muted participant never lights
/// up — are worth testing, and none of them are about WebSockets.
///
/// The production implementation is [`Sender`]; tests record instead.
#[async_trait]
pub(super) trait ClientSink: Send {
    /// Write one already-serialised message.
    async fn send_text(&mut self, json: String) -> Result<(), MediaError>;

    /// Write a keepalive ping.
    async fn send_ping(&mut self) -> Result<(), MediaError>;

    /// Write a close frame. Best effort: the socket may already be gone.
    async fn send_close(&mut self, code: SignalCloseCode);
}

#[async_trait]
impl ClientSink for Sender {
    async fn send_text(&mut self, json: String) -> Result<(), MediaError> {
        // A send that blocks for `SEND_TIMEOUT` means the client has stopped
        // reading; the connection is ended rather than parked.
        match timeout(SEND_TIMEOUT, self.send(Message::Text(json.into()))).await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(_)) | Err(_) => Err(MediaError::ConnectionClosed),
        }
    }

    async fn send_ping(&mut self) -> Result<(), MediaError> {
        match timeout(SEND_TIMEOUT, self.send(Message::Ping(Default::default()))).await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(_)) | Err(_) => Err(MediaError::ConnectionClosed),
        }
    }

    async fn send_close(&mut self, code: SignalCloseCode) {
        let frame = CloseFrame {
            code: code.code(),
            reason: code.reason().into(),
        };
        let _ = timeout(SEND_TIMEOUT, self.send(Message::Close(Some(frame)))).await;
    }
}

/// One admitted client, for as long as it is connected.
pub(super) struct Session {
    tx: Box<dyn ClientSink>,
    state: MediaState,
    room: Arc<MediaRoom>,
    participant: Arc<Participant>,
    peers: Arc<dyn ParticipantTransport>,
    participant_id: ParticipantId,
    budget: MessageBudget,
    last_activity: Instant,
}

impl Session {
    /// Take ownership of an admitted connection.
    pub(super) fn new(
        tx: Box<dyn ClientSink>,
        state: MediaState,
        room: Arc<MediaRoom>,
        participant: Arc<Participant>,
        peers: Arc<dyn ParticipantTransport>,
        participant_id: ParticipantId,
    ) -> Self {
        Self {
            tx,
            state,
            room,
            participant,
            peers,
            participant_id,
            budget: MessageBudget::new(),
            last_activity: Instant::now(),
        }
    }

    /// Give the socket and transport back for teardown.
    ///
    /// Consuming rather than borrowing, because a session that has stopped
    /// serving must not be usable again — the caller is about to close both.
    pub(super) fn into_parts(self) -> (Box<dyn ClientSink>, Arc<dyn ParticipantTransport>) {
        (self.tx, self.peers)
    }

    // ── accessors, so the sibling modules do not reach into fields ────────

    pub(super) fn room(&self) -> &Arc<MediaRoom> {
        &self.room
    }

    pub(super) fn participant(&self) -> &Arc<Participant> {
        &self.participant
    }

    pub(super) fn peers(&self) -> &Arc<dyn ParticipantTransport> {
        &self.peers
    }

    pub(super) fn participant_id(&self) -> ParticipantId {
        self.participant_id
    }

    pub(super) fn server(&self) -> &MediaState {
        &self.state
    }

    // ── the loop ──────────────────────────────────────────────────────────

    /// Serve this connection until it ends.
    ///
    /// Returns `Ok` for every ending the client is entitled to — a `leave`, a
    /// close frame, a dropped socket — and `Err` only for a failure the client
    /// should be told about before the socket closes.
    pub(super) async fn serve(
        &mut self,
        rx: &mut Receiver,
        mut events: PeerEvents,
    ) -> Result<(), MediaError> {
        let mut room_events = self.room.subscribe_events();

        let mut ping = interval(Duration::from_secs(PING_INTERVAL_SECONDS));
        // A stalled task must not produce a burst of catch-up ticks.
        ping.set_missed_tick_behavior(MissedTickBehavior::Delay);

        loop {
            tokio::select! {
                // Client frames.
                frame = rx.next() => {
                    let Some(frame) = frame else { return Ok(()) };
                    let frame = frame.map_err(|_| MediaError::ConnectionClosed)?;
                    self.last_activity = Instant::now();

                    if self.handle_frame(frame).await?.is_break() {
                        return Ok(());
                    }
                }

                // Events from this participant's own peer connections.
                Some(event) = events.events.recv() => {
                    self.handle_peer_event(event).await?;
                }

                // The subscriber connection gained or lost a track.
                Some(()) = events.renegotiate.recv() => {
                    self.renegotiate().await?;
                }

                // Events from everyone else in the room.
                event = room_events.recv() => {
                    if self.handle_room_event(event).await?.is_break() {
                        return Ok(());
                    }
                }

                _ = ping.tick() => {
                    if self.last_activity.elapsed() > Duration::from_secs(IDLE_TIMEOUT_SECONDS) {
                        return Err(MediaError::IdleTimeout);
                    }
                    self.tx.send_ping().await?;
                }
            }
        }
    }

    /// Act on one WebSocket frame from the client.
    async fn handle_frame(&mut self, frame: Message) -> Result<Flow, MediaError> {
        match frame {
            Message::Text(text) => {
                if !self.budget.allow() {
                    return Err(MediaError::Protocol(ProtocolError::TooLarge {
                        limit: self.budget.limit() as usize,
                    }));
                }
                let message = decode_client_message(&text)?;
                if matches!(message, ClientMessage::Leave) {
                    return Ok(Flow::Break);
                }
                self.dispatch(message).await?;
                Ok(Flow::Continue)
            }
            Message::Close(_) => Ok(Flow::Break),
            Message::Ping(_) | Message::Pong(_) => Ok(Flow::Continue),
            Message::Binary(_) => Err(MediaError::Protocol(ProtocolError::BeforeJoin {
                message: "binary frame",
            })),
        }
    }

    /// Route one client message to the module that owns it.
    ///
    /// A flat table on purpose: which concern handles which message is the one
    /// thing you should be able to see without reading any of them.
    async fn dispatch(&mut self, message: ClientMessage) -> Result<(), MediaError> {
        validate_sdp_direction(&message)?;

        match message {
            // ── negotiation ──────────────────────────────────────────────
            ClientMessage::Offer { sdp, .. } => self.accept_offer(sdp).await,
            ClientMessage::Answer { sdp, .. } => self.accept_answer(sdp).await,
            ClientMessage::IceCandidate {
                target,
                candidate,
                sdp_mid,
                sdp_mline_index,
            } => {
                self.add_ice_candidate(target, candidate, sdp_mid, sdp_mline_index)
                    .await
            }
            ClientMessage::PublishIntent {
                kind,
                client_track_id,
            } => self.declare_intent(client_track_id, kind).await,

            // ── subscriptions ────────────────────────────────────────────
            ClientMessage::Subscribe { track_id, .. } => self.subscribe(&track_id).await,
            ClientMessage::Unsubscribe { track_id, .. } => self.unsubscribe(&track_id).await,

            // ── device state ─────────────────────────────────────────────
            ClientMessage::Mute { muted } => self.set_muted(muted).await,
            ClientMessage::Camera { enabled } => self.set_camera(enabled).await,
            ClientMessage::ScreenShare { enabled } => self.set_screen_share(enabled).await,
            ClientMessage::Speaking { speaking } => self.report_speaking(speaking).await,

            // ── protocol housekeeping ────────────────────────────────────
            ClientMessage::Ping => self.send(&ServerMessage::Pong).await,

            // A second join on the same socket would mean two identities on
            // one connection; there is no sane interpretation.
            ClientMessage::Join { .. } => Err(MediaError::Protocol(ProtocolError::BeforeJoin {
                message: "join",
            })),

            // Handled by the caller so it can return cleanly.
            ClientMessage::Leave => Ok(()),
        }
    }

    /// Forward one room event to this client, unless it is about their own
    /// arrival — the `joined` payload already said so.
    async fn handle_room_event(
        &mut self,
        event: Result<RoomEvent, broadcast::error::RecvError>,
    ) -> Result<Flow, MediaError> {
        match event {
            Ok(event) => {
                let is_own_join = matches!(event, RoomEvent::ParticipantJoined { .. })
                    && event.subject() == self.participant_id;
                if !is_own_join {
                    self.send(&ServerMessage::event(event)).await?;
                }
                Ok(Flow::Continue)
            }
            Err(broadcast::error::RecvError::Lagged(missed)) => {
                // Only speaking indicators are frequent enough to lag, and they
                // are self-correcting.
                tracing::debug!(missed, "room event stream lagged");
                Ok(Flow::Continue)
            }
            Err(broadcast::error::RecvError::Closed) => Ok(Flow::Break),
        }
    }

    // ── the socket ────────────────────────────────────────────────────────

    /// Serialise and write one message.
    pub(super) async fn send(&mut self, message: &ServerMessage) -> Result<(), MediaError> {
        send(self.tx.as_mut(), message).await
    }

    /// Report a non-fatal failure without ending the connection.
    pub(super) async fn reply_error(&mut self, error: &MediaRoomError) -> Result<(), MediaError> {
        self.send(&ServerMessage::error(error.code(), error.client_message()))
            .await
    }
}

/// Whether the loop keeps going.
///
/// Named rather than a bare `bool`, because `Ok(true)` at a call site tells you
/// nothing about which way true goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Flow {
    /// Keep serving.
    Continue,
    /// End the connection cleanly.
    Break,
}

impl Flow {
    fn is_break(self) -> bool {
        matches!(self, Flow::Break)
    }
}

// ── socket helpers usable before a session exists ────────────────────────
//
// The handshake writes to the socket before there is a `Session` to own it, so
// these take the sink directly. `Session::send` is the same function with the
// sink already in hand.

/// Serialise and write one message.
///
/// A serialisation failure is logged and swallowed: it is a bug in this server,
/// not a fault of the connection, and dropping the socket would turn a missing
/// event into a dropped call.
pub(super) async fn send(
    tx: &mut dyn ClientSink,
    message: &ServerMessage,
) -> Result<(), MediaError> {
    let json = match serde_json::to_string(message) {
        Ok(json) => json,
        Err(error) => {
            tracing::error!(%error, "failed to serialise a server message");
            return Ok(());
        }
    };
    tx.send_text(json).await
}

/// Tell the client what went wrong, best effort.
///
/// Skipped when the socket is already gone — there is nobody to tell — and the
/// message is the sanitised one, never an internal error string.
pub(super) async fn report(tx: &mut dyn ClientSink, error: &MediaError) {
    if matches!(error, MediaError::ConnectionClosed) {
        return;
    }
    let message = ServerMessage::error(error.code(), error.client_message());
    let _ = send(tx, &message).await;
}

/// Send a close frame, best effort.
pub(super) async fn close(tx: &mut dyn ClientSink, code: SignalCloseCode) {
    tx.send_close(code).await;
}

#[cfg(test)]
impl Session {
    /// Build a session over fakes, for testing the rules rather than the wire.
    ///
    /// Everything a rule touches — the room, the participant, the socket, the
    /// transport — is real or a double; only the parts no rule reads (the
    /// token verifier, the bind address) are filler.
    pub(super) fn for_test(
        tx: Box<dyn ClientSink>,
        room: Arc<MediaRoom>,
        participant: Arc<Participant>,
        peers: Arc<dyn genzh_media_room::ParticipantTransport>,
    ) -> Self {
        Self::for_test_on(crate::state::MediaState::for_test(), tx, room, participant, peers)
    }

    /// The same, over a server configured a particular way.
    pub(super) fn for_test_on(
        state: crate::state::MediaState,
        tx: Box<dyn ClientSink>,
        room: Arc<MediaRoom>,
        participant: Arc<Participant>,
        peers: Arc<dyn genzh_media_room::ParticipantTransport>,
    ) -> Self {
        let participant_id = participant.id();
        Self::new(tx, state, room, participant, peers, participant_id)
    }
}

#[cfg(test)]
pub(super) mod test_support {
    use super::*;

    /// A [`ClientSink`] that records what the server tried to send.
    #[derive(Default)]
    pub(in crate::signaling) struct RecordingSink {
        /// Every message written, already deserialised.
        pub sent: Vec<ServerMessage>,
        /// How many pings went out.
        pub pings: usize,
        /// The close code, once one has been sent.
        pub closed_with: Option<SignalCloseCode>,
    }

    impl RecordingSink {
        /// The events among what was sent, in order.
        pub(in crate::signaling) fn events(&self) -> Vec<&RoomEvent> {
            self.sent
                .iter()
                .filter_map(|message| match message {
                    ServerMessage::Event { event } => Some(event),
                    _ => None,
                })
                .collect()
        }
    }

    /// A handle both the test and the session can hold.
    #[derive(Clone, Default)]
    pub(in crate::signaling) struct SharedSink(pub std::sync::Arc<std::sync::Mutex<RecordingSink>>);

    impl SharedSink {
        pub(in crate::signaling) fn read<T>(&self, f: impl FnOnce(&RecordingSink) -> T) -> T {
            f(&self.0.lock().expect("sink lock"))
        }
    }

    #[async_trait]
    impl ClientSink for SharedSink {
        async fn send_text(&mut self, json: String) -> Result<(), MediaError> {
            let message = serde_json::from_str(&json).expect("the server sends valid protocol");
            self.0.lock().expect("sink lock").sent.push(message);
            Ok(())
        }

        async fn send_ping(&mut self) -> Result<(), MediaError> {
            self.0.lock().expect("sink lock").pings += 1;
            Ok(())
        }

        async fn send_close(&mut self, code: SignalCloseCode) {
            self.0.lock().expect("sink lock").closed_with = Some(code);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::SharedSink;
    use super::*;
    use genzh_media_core::events::RoomEvent;
    use genzh_media_core::permissions::MediaPermissions;
    use genzh_media_core::track::ParticipantId;
    use genzh_media_room::room::RoomConfig;
    use genzh_media_room::transport::test_support::FakeTransport;
    use genzh_media_room::ParticipantTransport;

    fn session() -> (Session, SharedSink, ParticipantId) {
        let room = MediaRoom::new(uuid::Uuid::new_v4(), RoomConfig::default());
        let transport = FakeTransport::new();
        let participant_id = ParticipantId::new();
        let participant = Participant::new(
            participant_id,
            uuid::Uuid::new_v4(),
            "Tester",
            MediaPermissions::all(),
            transport.sink(),
        );
        let sink = SharedSink::default();
        let session =
            Session::for_test(Box::new(sink.clone()), room, participant, transport);
        (session, sink, participant_id)
    }

    #[tokio::test]
    async fn a_room_event_reaches_the_client() {
        let (mut session, sink, _id) = session();
        let somebody_else = ParticipantId::new();

        let flow = session
            .handle_room_event(Ok(RoomEvent::SpeakingStarted {
                participant_id: somebody_else,
            }))
            .await
            .expect("forwarded");

        assert_eq!(flow, Flow::Continue);
        sink.read(|recorded| {
            assert!(matches!(
                recorded.events().as_slice(),
                [RoomEvent::SpeakingStarted { .. }]
            ));
        });
    }

    #[tokio::test]
    async fn you_are_not_told_about_your_own_arrival() {
        let (mut session, sink, participant_id) = session();

        session
            .handle_room_event(Ok(RoomEvent::ParticipantJoined {
                participant: genzh_media_core::events::ParticipantInfo {
                    participant_id,
                    user_id: uuid::Uuid::new_v4(),
                    display_name: "Tester".to_owned(),
                    tracks: Vec::new(),
                    audio_muted: true,
                    camera_enabled: false,
                    screen_sharing: false,
                },
            }))
            .await
            .expect("handled");

        // The `joined` payload already said so; echoing it makes a client
        // render itself twice.
        sink.read(|recorded| assert!(recorded.events().is_empty()));
    }

    #[tokio::test]
    async fn somebody_elses_arrival_is_forwarded() {
        let (mut session, sink, _id) = session();

        session
            .handle_room_event(Ok(RoomEvent::ParticipantJoined {
                participant: genzh_media_core::events::ParticipantInfo {
                    participant_id: ParticipantId::new(),
                    user_id: uuid::Uuid::new_v4(),
                    display_name: "Someone".to_owned(),
                    tracks: Vec::new(),
                    audio_muted: true,
                    camera_enabled: false,
                    screen_sharing: false,
                },
            }))
            .await
            .expect("handled");

        sink.read(|recorded| assert_eq!(recorded.events().len(), 1));
    }

    #[tokio::test]
    async fn a_lagging_subscriber_keeps_its_connection() {
        let (mut session, _sink, _id) = session();

        let flow = session
            .handle_room_event(Err(broadcast::error::RecvError::Lagged(12)))
            .await
            .expect("handled");

        // Only speaking indicators are frequent enough to lag, and they are
        // self-correcting — dropping the call over one would be worse.
        assert_eq!(flow, Flow::Continue);
    }

    #[tokio::test]
    async fn a_closed_room_ends_the_session_cleanly() {
        let (mut session, _sink, _id) = session();

        let flow = session
            .handle_room_event(Err(broadcast::error::RecvError::Closed))
            .await
            .expect("handled");

        assert_eq!(flow, Flow::Break, "otherwise the loop spins on a dead bus");
    }

    #[tokio::test]
    async fn a_close_frame_ends_the_loop() {
        let (mut session, _sink, _id) = session();
        let flow = session.handle_frame(Message::Close(None)).await.expect("handled");
        assert_eq!(flow, Flow::Break);
    }

    #[tokio::test]
    async fn a_leave_ends_the_loop_without_being_dispatched() {
        let (mut session, sink, _id) = session();

        let flow = session
            .handle_frame(Message::Text(r#"{"type":"leave"}"#.into()))
            .await
            .expect("handled");

        assert_eq!(flow, Flow::Break);
        sink.read(|recorded| assert!(recorded.sent.is_empty()));
    }

    #[tokio::test]
    async fn a_binary_frame_is_a_protocol_violation() {
        let (mut session, _sink, _id) = session();
        let error = session
            .handle_frame(Message::Binary(vec![1, 2, 3].into()))
            .await
            .expect_err("binary is not part of this protocol");
        assert!(matches!(error, MediaError::Protocol(_)));
    }

    #[tokio::test]
    async fn a_spinning_client_exhausts_its_budget_and_is_disconnected() {
        let (mut session, _sink, _id) = session();
        let ping = || Message::Text(r#"{"type":"ping"}"#.into());

        for _ in 0..genzh_media_signaling::limits::MAX_MESSAGES_PER_SECOND {
            session.handle_frame(ping()).await.expect("within budget");
        }

        let error = session.handle_frame(ping()).await.expect_err("over budget");
        assert!(matches!(error, MediaError::Protocol(_)));
    }

    #[tokio::test]
    async fn a_second_join_on_one_socket_is_refused() {
        let (mut session, _sink, _id) = session();

        let error = session
            .handle_frame(Message::Text(
                r#"{"type":"join","room_id":"r","token":"t"}"#.into(),
            ))
            .await
            .expect_err("two identities on one connection has no meaning");

        assert!(matches!(error, MediaError::Protocol(_)));
    }

    #[tokio::test]
    async fn a_ping_is_answered() {
        let (mut session, sink, _id) = session();

        session
            .handle_frame(Message::Text(r#"{"type":"ping"}"#.into()))
            .await
            .expect("handled");

        sink.read(|recorded| {
            assert!(matches!(recorded.sent.as_slice(), [ServerMessage::Pong]));
        });
    }
}
