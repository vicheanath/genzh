//! Everything before the connection has an identity.
//!
//! A socket arrives anonymous. Until it presents a token it may consume no
//! room, no peer connection and no memory beyond its own frame buffer, and it
//! gets [`HANDSHAKE_TIMEOUT_SECONDS`] to do so — a socket that connects and
//! says nothing is the cheapest possible resource-exhaustion attack.
//!
//! The token is the *only* authentication in the media plane. It was minted by
//! the API, which did all the database work: is the room real, is this user a
//! member, may they speak. The media server verifies a signature and reads
//! claims; it never asks PostgreSQL anything.

use std::sync::Arc;

use axum::extract::ws::Message;
use futures::StreamExt;
use genzh_media_core::track::ParticipantId;
use genzh_media_room::participant::Participant;
use genzh_media_room::{MediaRoom, ParticipantTransport, PeerEvents};
use genzh_media_signaling::limits::HANDSHAKE_TIMEOUT_SECONDS;
use genzh_media_signaling::protocol::decode_client_message;
use genzh_media_signaling::{ClientMessage, PROTOCOL_VERSION, ProtocolError, ServerMessage};
use tokio::time::{Duration, timeout};
use uuid::Uuid;

use crate::error::MediaError;
use crate::state::MediaState;

use super::session::{Receiver, Sender, send};

/// Everything produced by a successful handshake.
pub(super) struct Joined {
    pub(super) room: Arc<MediaRoom>,
    pub(super) participant: Arc<Participant>,
    pub(super) peers: Arc<dyn ParticipantTransport>,
    pub(super) events: PeerEvents,
    pub(super) participant_id: ParticipantId,
    pub(super) room_id: Uuid,
}

/// Wait for `join`, verify the token, and admit the participant.
pub(super) async fn handshake(
    tx: &mut Sender,
    rx: &mut Receiver,
    state: &MediaState,
) -> Result<Joined, MediaError> {
    let deadline = Duration::from_secs(HANDSHAKE_TIMEOUT_SECONDS);

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

    Ok(Joined {
        room,
        participant,
        peers,
        events,
        participant_id,
        room_id,
    })
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
