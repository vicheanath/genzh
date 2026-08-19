//! The typed signalling protocol.

use serde::{Deserialize, Serialize};
use social_media_core::events::{ParticipantInfo, RoomEvent};
use social_media_core::ice::IceServer;
use social_media_core::track::{ParticipantId, TrackId, TrackKind};
use thiserror::Error;

/// Wire-protocol version.
///
/// The server sends it in [`ServerMessage::Joined`]; clients that do not
/// recognise it should refuse to proceed rather than guess. Bump on any
/// breaking change to the message set.
pub const PROTOCOL_VERSION: u16 = 1;

/// Which of a participant's two peer connections a message concerns.
///
/// See the crate docs for why there are two.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PeerTarget {
    /// Client → server media. The **client** offers.
    Publisher,
    /// Server → client media. The **server** offers.
    Subscriber,
}

impl PeerTarget {
    /// Human-readable name for logs.
    pub const fn as_str(self) -> &'static str {
        match self {
            PeerTarget::Publisher => "publisher",
            PeerTarget::Subscriber => "subscriber",
        }
    }
}

/// Messages a client may send.
///
/// Nothing here is trusted. A `user_id` is conspicuously absent: identity comes
/// from the token presented in [`ClientMessage::Join`] and from nowhere else,
/// so there is no field for a client to lie in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    /// First message on every connection. Any other message before this one is
    /// a protocol violation and closes the socket.
    Join {
        /// Room the client believes it is joining. Checked against the token —
        /// it is a cross-check, not the source of truth.
        room_id: String,
        /// The short-lived media token minted by the API.
        token: String,
    },

    /// SDP offer. Only valid for [`PeerTarget::Publisher`].
    Offer {
        /// Which connection.
        target: PeerTarget,
        /// The SDP.
        sdp: String,
    },

    /// SDP answer. Only valid for [`PeerTarget::Subscriber`].
    Answer {
        /// Which connection.
        target: PeerTarget,
        /// The SDP.
        sdp: String,
    },

    /// A trickled ICE candidate.
    IceCandidate {
        /// Which connection.
        target: PeerTarget,
        /// The `candidate:` attribute value.
        candidate: String,
        /// Media-section id, if the client sent one.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sdp_mid: Option<String>,
        /// Media-section index, if the client sent one.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sdp_mline_index: Option<u16>,
    },

    /// Announce what a publisher track is *for*.
    ///
    /// SDP alone cannot distinguish a camera from a screen share — both are
    /// just video. The client declares intent here, and the server matches it
    /// against the `msid` when the track arrives.
    PublishIntent {
        /// What the next published video/audio track carries.
        kind: TrackKind,
        /// The client's `MediaStreamTrack.id`, used to correlate.
        client_track_id: String,
    },

    /// Start receiving a specific track.
    Subscribe {
        /// Publisher.
        participant_id: ParticipantId,
        /// Track to receive.
        track_id: TrackId,
    },

    /// Stop receiving a specific track.
    Unsubscribe {
        /// Publisher.
        participant_id: ParticipantId,
        /// Track to stop receiving.
        track_id: TrackId,
    },

    /// Microphone mute state changed.
    Mute {
        /// True when muted.
        muted: bool,
    },

    /// Camera on/off.
    Camera {
        /// True when the camera is on.
        enabled: bool,
    },

    /// Screen share on/off.
    ScreenShare {
        /// True when sharing.
        enabled: bool,
    },

    /// Client-side voice activity detection result.
    ///
    /// Only honoured when the server is configured for client-reported VAD;
    /// otherwise it is ignored, because a client must not be able to claim the
    /// speaking ring at will.
    Speaking {
        /// True when the client believes its user is talking.
        speaking: bool,
    },

    /// Keepalive. The server also pings at the WebSocket level; this exists for
    /// clients that cannot observe pongs.
    Ping,

    /// Graceful departure.
    Leave,
}

impl ClientMessage {
    /// May this message arrive before the connection has joined a room?
    pub fn allowed_before_join(&self) -> bool {
        matches!(self, ClientMessage::Join { .. } | ClientMessage::Ping | ClientMessage::Leave)
    }

    /// Short name for log lines and metrics, without leaking SDP or tokens.
    pub const fn kind(&self) -> &'static str {
        match self {
            ClientMessage::Join { .. } => "join",
            ClientMessage::Offer { .. } => "offer",
            ClientMessage::Answer { .. } => "answer",
            ClientMessage::IceCandidate { .. } => "ice_candidate",
            ClientMessage::PublishIntent { .. } => "publish_intent",
            ClientMessage::Subscribe { .. } => "subscribe",
            ClientMessage::Unsubscribe { .. } => "unsubscribe",
            ClientMessage::Mute { .. } => "mute",
            ClientMessage::Camera { .. } => "camera",
            ClientMessage::ScreenShare { .. } => "screen_share",
            ClientMessage::Speaking { .. } => "speaking",
            ClientMessage::Ping => "ping",
            ClientMessage::Leave => "leave",
        }
    }
}

/// Messages the server sends.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    /// The join was accepted. Sent exactly once, before anything else.
    Joined {
        /// Negotiated protocol version.
        protocol_version: u16,
        /// The participant id assigned by the API and carried in the token.
        participant_id: ParticipantId,
        /// Room actually joined.
        room_id: String,
        /// Everyone already present, with their current tracks.
        participants: Vec<ParticipantInfo>,
        /// ICE servers to configure both peer connections with.
        ice_servers: Vec<IceServer>,
    },

    /// SDP offer from the server. Only for [`PeerTarget::Subscriber`].
    Offer {
        /// Which connection.
        target: PeerTarget,
        /// The SDP.
        sdp: String,
    },

    /// SDP answer from the server. Only for [`PeerTarget::Publisher`].
    Answer {
        /// Which connection.
        target: PeerTarget,
        /// The SDP.
        sdp: String,
    },

    /// A trickled ICE candidate from the server.
    IceCandidate {
        /// Which connection.
        target: PeerTarget,
        /// The `candidate:` attribute value.
        candidate: String,
        /// Media-section id.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sdp_mid: Option<String>,
        /// Media-section index.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sdp_mline_index: Option<u16>,
    },

    /// Something happened in the room.
    ///
    /// Flattened so the payload reads `{"type":"event","event":"participant_joined",…}`
    /// rather than nesting, which keeps client switch statements flat.
    Event {
        /// The event.
        #[serde(flatten)]
        event: RoomEvent,
    },

    /// A request failed. Non-fatal: the connection stays open.
    Error {
        /// Stable machine-readable code.
        code: String,
        /// Human-readable explanation. Never contains internal detail.
        message: String,
    },

    /// Reply to [`ClientMessage::Ping`].
    Pong,
}

impl ServerMessage {
    /// Build an error message from a code and description.
    pub fn error(code: impl Into<String>, message: impl Into<String>) -> Self {
        ServerMessage::Error { code: code.into(), message: message.into() }
    }

    /// Wrap a room event.
    pub fn event(event: RoomEvent) -> Self {
        ServerMessage::Event { event }
    }

    /// May this message be dropped when the client's queue is full?
    ///
    /// Losing a speaking indicator is invisible; losing an SDP answer wedges
    /// the call. The transport uses this to shed exactly the right load.
    pub fn is_droppable(&self) -> bool {
        match self {
            ServerMessage::Event { event } => event.is_droppable(),
            _ => false,
        }
    }
}

/// WebSocket close codes this server uses.
///
/// Application codes live in the 4000–4999 range. Distinct codes let a mobile
/// client decide whether to re-fetch a token, re-authenticate, or give up,
/// without parsing a human-readable reason.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum SignalCloseCode {
    /// Normal, client asked to leave.
    Normal = 1000,
    /// Message was not valid protocol.
    ProtocolViolation = 4000,
    /// Token missing, malformed, expired or wrongly signed.
    Unauthorized = 4001,
    /// Token is valid but does not authorise this room.
    Forbidden = 4003,
    /// Room is full.
    RoomFull = 4004,
    /// Sent too many messages.
    RateLimited = 4029,
    /// No traffic for too long.
    IdleTimeout = 4030,
    /// The server is shutting down or hit an internal error.
    ServerError = 4500,
}

impl SignalCloseCode {
    /// Numeric code for the close frame.
    pub const fn code(self) -> u16 {
        self as u16
    }

    /// Short reason string. Kept generic on purpose — close reasons are
    /// visible to anyone who can open a socket.
    pub const fn reason(self) -> &'static str {
        match self {
            SignalCloseCode::Normal => "bye",
            SignalCloseCode::ProtocolViolation => "protocol violation",
            SignalCloseCode::Unauthorized => "unauthorized",
            SignalCloseCode::Forbidden => "forbidden",
            SignalCloseCode::RoomFull => "room full",
            SignalCloseCode::RateLimited => "rate limited",
            SignalCloseCode::IdleTimeout => "idle timeout",
            SignalCloseCode::ServerError => "server error",
        }
    }
}

/// Failures decoding or validating a signalling frame.
#[derive(Debug, Error)]
pub enum ProtocolError {
    /// Frame exceeded [`crate::limits::MAX_MESSAGE_BYTES`].
    #[error("message exceeds {limit} bytes")]
    TooLarge {
        /// The limit that was exceeded.
        limit: usize,
    },

    /// Not valid JSON, or not a known message.
    #[error("malformed signalling message")]
    Malformed(#[source] serde_json::Error),

    /// A message arrived that is not legal in the current connection state.
    #[error("unexpected {message} before join")]
    BeforeJoin {
        /// The offending message kind.
        message: &'static str,
    },

    /// The client offered on the subscriber connection, or answered on the
    /// publisher connection.
    #[error("{message} is not valid for the {target} connection")]
    WrongTarget {
        /// The offending message kind.
        message: &'static str,
        /// The target it named.
        target: &'static str,
    },
}

impl ProtocolError {
    /// Close code to use when this error is fatal.
    pub fn close_code(&self) -> SignalCloseCode {
        SignalCloseCode::ProtocolViolation
    }
}

/// Decode a client frame, enforcing the size limit before parsing.
///
/// Checking length first matters: `serde_json` on a 10 MB frame allocates 10 MB
/// before it can tell us it is nonsense.
pub fn decode_client_message(raw: &str) -> Result<ClientMessage, ProtocolError> {
    if raw.len() > crate::limits::MAX_MESSAGE_BYTES {
        return Err(ProtocolError::TooLarge { limit: crate::limits::MAX_MESSAGE_BYTES });
    }
    serde_json::from_str(raw).map_err(ProtocolError::Malformed)
}

/// Validate that an SDP message names a legal target for its direction.
pub fn validate_sdp_direction(message: &ClientMessage) -> Result<(), ProtocolError> {
    match message {
        // The client owns the publisher connection, so it offers there.
        ClientMessage::Offer { target: PeerTarget::Subscriber, .. } => {
            Err(ProtocolError::WrongTarget { message: "offer", target: "subscriber" })
        }
        // The server owns the subscriber connection, so the client answers there.
        ClientMessage::Answer { target: PeerTarget::Publisher, .. } => {
            Err(ProtocolError::WrongTarget { message: "answer", target: "publisher" })
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_round_trips() {
        let raw = r#"{"type":"join","room_id":"r-1","token":"eyJhbGciOi"}"#;
        let decoded = decode_client_message(raw).expect("decode");
        assert_eq!(
            decoded,
            ClientMessage::Join { room_id: "r-1".into(), token: "eyJhbGciOi".into() }
        );
        assert_eq!(decoded.kind(), "join");
    }

    #[test]
    fn ice_candidates_tolerate_missing_optional_fields() {
        let raw = r#"{"type":"ice_candidate","target":"publisher","candidate":"candidate:1 1 udp 2 10.0.0.1 5000 typ host"}"#;
        let decoded = decode_client_message(raw).expect("decode");
        match decoded {
            ClientMessage::IceCandidate { target, sdp_mid, sdp_mline_index, .. } => {
                assert_eq!(target, PeerTarget::Publisher);
                assert!(sdp_mid.is_none());
                assert!(sdp_mline_index.is_none());
            }
            other => panic!("wrong variant: {other:?}"),
        }
    }

    #[test]
    fn oversized_frames_are_rejected_without_parsing() {
        let huge = format!(r#"{{"type":"offer","target":"publisher","sdp":"{}"}}"#, "v".repeat(crate::limits::MAX_MESSAGE_BYTES));
        assert!(matches!(
            decode_client_message(&huge),
            Err(ProtocolError::TooLarge { .. })
        ));
    }

    #[test]
    fn unknown_message_types_are_rejected() {
        assert!(matches!(
            decode_client_message(r#"{"type":"become_admin"}"#),
            Err(ProtocolError::Malformed(_))
        ));
        assert!(matches!(decode_client_message("not json"), Err(ProtocolError::Malformed(_))));
    }

    #[test]
    fn there_is_no_field_for_a_client_to_claim_an_identity() {
        // A client trying to smuggle a user_id simply fails to decode, because
        // the variant has no such field and serde is not lenient here.
        let raw = r#"{"type":"join","room_id":"r-1","token":"t","user_id":"00000000-0000-0000-0000-000000000000"}"#;
        // Unknown fields are ignored by serde's default, so decoding succeeds —
        // the point is that the extra field is dropped and cannot influence us.
        let decoded = decode_client_message(raw).expect("decode");
        assert_eq!(decoded, ClientMessage::Join { room_id: "r-1".into(), token: "t".into() });
    }

    #[test]
    fn only_join_ping_and_leave_are_legal_before_joining() {
        assert!(ClientMessage::Join { room_id: "r".into(), token: "t".into() }.allowed_before_join());
        assert!(ClientMessage::Ping.allowed_before_join());
        assert!(ClientMessage::Leave.allowed_before_join());
        assert!(!ClientMessage::Mute { muted: true }.allowed_before_join());
        assert!(
            !ClientMessage::Offer { target: PeerTarget::Publisher, sdp: "v=0".into() }
                .allowed_before_join()
        );
    }

    #[test]
    fn sdp_direction_is_enforced_per_connection() {
        let ok_offer = ClientMessage::Offer { target: PeerTarget::Publisher, sdp: "v=0".into() };
        let ok_answer = ClientMessage::Answer { target: PeerTarget::Subscriber, sdp: "v=0".into() };
        assert!(validate_sdp_direction(&ok_offer).is_ok());
        assert!(validate_sdp_direction(&ok_answer).is_ok());

        let bad_offer = ClientMessage::Offer { target: PeerTarget::Subscriber, sdp: "v=0".into() };
        let bad_answer = ClientMessage::Answer { target: PeerTarget::Publisher, sdp: "v=0".into() };
        assert!(matches!(
            validate_sdp_direction(&bad_offer),
            Err(ProtocolError::WrongTarget { message: "offer", .. })
        ));
        assert!(matches!(
            validate_sdp_direction(&bad_answer),
            Err(ProtocolError::WrongTarget { message: "answer", .. })
        ));
    }

    #[test]
    fn server_events_flatten_into_the_envelope() {
        let event = RoomEvent::SpeakingStopped { participant_id: ParticipantId::new() };
        let json = serde_json::to_value(ServerMessage::event(event)).unwrap();
        assert_eq!(json["type"], "event");
        assert_eq!(json["event"], "speaking_stopped");
    }

    #[test]
    fn only_speaking_events_are_shed_under_back_pressure() {
        let p = ParticipantId::new();
        assert!(ServerMessage::event(RoomEvent::SpeakingStarted { participant_id: p }).is_droppable());
        assert!(!ServerMessage::event(RoomEvent::ParticipantLeft { participant_id: p }).is_droppable());
        assert!(
            !ServerMessage::Answer { target: PeerTarget::Publisher, sdp: "v=0".into() }
                .is_droppable()
        );
        assert!(!ServerMessage::error("X", "y").is_droppable());
    }

    #[test]
    fn close_codes_sit_in_the_application_range() {
        for code in [
            SignalCloseCode::ProtocolViolation,
            SignalCloseCode::Unauthorized,
            SignalCloseCode::Forbidden,
            SignalCloseCode::RoomFull,
            SignalCloseCode::RateLimited,
            SignalCloseCode::IdleTimeout,
            SignalCloseCode::ServerError,
        ] {
            assert!((4000..5000).contains(&code.code()), "{code:?} out of range");
            assert!(!code.reason().is_empty());
        }
        assert_eq!(SignalCloseCode::Normal.code(), 1000);
    }
}
