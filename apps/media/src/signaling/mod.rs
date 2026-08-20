//! The signalling connection.
//!
//! One task per client, owning that client's socket, its two peer connections
//! and its participant record. Everything a connection needs is reachable from
//! that task, so there are no locks on the hot path and cleanup is a single
//! code path.
//!
//! ## Lifecycle
//!
//! ```text
//!   upgrade
//!     │
//!     ├─ wait for `join` (10 s, then close)          — handshake.rs
//!     ├─ verify the media token — the only authentication that exists here
//!     ├─ build publisher + subscriber peer connections
//!     ├─ add the participant to the room, auto-subscribing to live audio
//!     ├─ send `joined`
//!     │
//!     ├─◀────────────── select loop ──────────────▶  — session.rs
//!     │   client frames · peer events · renegotiation · room events · pings
//!     │
//!     └─ on any exit: leave the room, detach every subscriber, close both
//!        peer connections, abort every forwarding task
//! ```
//!
//! The cleanup runs whether the client says goodbye, the socket drops, ICE
//! fails, or the process is shutting down — which is the point of putting it
//! at the end of one function rather than in each exit branch.
//!
//! ## How this module is laid out
//!
//! | Module | Owns |
//! |--------|------|
//! | [`handshake`] | Everything before the connection has an identity |
//! | [`session`] | The steady-state loop, the socket, and dispatch |
//! | [`negotiation`] | SDP and ICE: offer, answer, candidate, renegotiate |
//! | [`device`] | Mute, camera, screen share, speaking |
//!
//! The split follows what changes together. A new codec or a renegotiation fix
//! touches `negotiation`; a new device toggle touches `device`; neither has any
//! reason to open the other's file. What they share is [`Session`], which owns
//! the socket and is the only thing that writes to it.

mod device;
mod handshake;
mod negotiation;
mod session;

use axum::extract::State;
use axum::extract::ws::WebSocketUpgrade;
use axum::response::Response;
use futures::StreamExt;
use genzh_media_signaling::limits::{MAX_FRAME_BYTES, MAX_MESSAGE_BYTES};
use tracing::Instrument;
use uuid::Uuid;

use crate::error::MediaError;
use crate::state::MediaState;

use handshake::Joined;
use session::Session;

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
///
/// Deliberately the only function that reads top to bottom as a lifecycle:
/// admit, serve, clean up. Each phase is one call, so the guarantee that
/// matters — teardown runs on every exit path — is visible in one screen.
async fn run(
    socket: axum::extract::ws::WebSocket,
    state: MediaState,
    connection_id: Uuid,
) -> Result<(), MediaError> {
    let (mut tx, mut rx) = socket.split();

    // ---- 1. handshake ----------------------------------------------------
    let joined = match handshake::handshake(&mut tx, &mut rx, &state).await {
        Ok(joined) => joined,
        Err(error) => {
            // Tell the client *why* before closing: a close code alone cannot
            // distinguish "your token expired, fetch a new one" from "you may
            // not enter this room", and those need different client behaviour.
            session::report(&mut tx, &error).await;
            session::close(&mut tx, error.close_code()).await;
            return Err(error);
        }
    };

    let Joined {
        room,
        participant,
        peers,
        events,
        participant_id,
        room_id,
    } = joined;

    tracing::info!(
        %room_id,
        %participant_id,
        user_id = %participant.user_id(),
        "participant joined"
    );

    // ---- 2. steady state -------------------------------------------------
    let mut session = Session::new(
        Box::new(tx),
        state.clone(),
        room,
        participant,
        peers,
        participant_id,
    );
    let outcome = session.serve(&mut rx, events).await;

    // ---- 3. teardown -----------------------------------------------------
    // Reached from every exit: a clean `leave`, a dropped socket, an ICE
    // failure, or an error above. Leaving the room first detaches this
    // participant's tracks from everyone else while the transport is still
    // alive to carry the events.
    let (mut tx, peers) = session.into_parts();

    if let Err(error) = state.rooms.leave(room_id, participant_id).await {
        tracing::debug!(%error, %room_id, %participant_id, "leave failed");
    }
    peers.close().await;

    let code = match outcome.as_ref() {
        Ok(()) => genzh_media_signaling::SignalCloseCode::Normal,
        Err(error) => {
            session::report(tx.as_mut(), error).await;
            error.close_code()
        }
    };
    session::close(tx.as_mut(), code).await;

    tracing::info!(%room_id, %participant_id, %connection_id, "participant left");
    outcome
}
