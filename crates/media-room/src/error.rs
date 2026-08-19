//! Errors from the media room layer.

use genzh_media_core::track::{ParticipantId, TrackId, TrackKind};
use thiserror::Error;

/// Result alias for this crate.
pub type MediaRoomResult<T> = Result<T, MediaRoomError>;

/// Something the room manager or the SFU refused or could not do.
#[derive(Debug, Error)]
pub enum MediaRoomError {
    /// No such room on this media server.
    #[error("room not found")]
    RoomNotFound,

    /// No such participant in the room.
    #[error("participant {0} is not in this room")]
    ParticipantNotFound(ParticipantId),

    /// The room is at capacity.
    #[error("room is full")]
    RoomFull,

    /// The participant id is already in use in this room, which means a
    /// replayed token or a duplicate connection.
    #[error("participant {0} is already connected")]
    DuplicateParticipant(ParticipantId),

    /// The token does not grant this.
    #[error("not permitted to publish {0}")]
    PublishDenied(TrackKind),

    /// The token does not grant subscribing at all.
    #[error("not permitted to subscribe")]
    SubscribeDenied,

    /// Asked to subscribe to a track nobody is publishing.
    #[error("track {0} not found")]
    TrackNotFound(TrackId),

    /// A participant tried to publish a second track of the same kind.
    #[error("already publishing {0}")]
    AlreadyPublishing(TrackKind),

    /// Too many tracks from one participant.
    #[error("track limit reached")]
    TooManyTracks,

    /// The underlying WebRTC stack failed.
    #[error("webrtc error: {0}")]
    WebRtc(String),

    /// The peer connection is gone.
    #[error("transport is closed")]
    TransportClosed,

    /// Signalling arrived in an order the state machine cannot honour.
    #[error("unexpected signalling state: {0}")]
    BadSignallingState(&'static str),
}

impl MediaRoomError {
    /// Stable machine-readable code for the `error` signalling message.
    pub fn code(&self) -> &'static str {
        match self {
            MediaRoomError::RoomNotFound => "ROOM_NOT_FOUND",
            MediaRoomError::ParticipantNotFound(_) => "PARTICIPANT_NOT_FOUND",
            MediaRoomError::RoomFull => "ROOM_FULL",
            MediaRoomError::DuplicateParticipant(_) => "DUPLICATE_PARTICIPANT",
            MediaRoomError::PublishDenied(_) => "PUBLISH_DENIED",
            MediaRoomError::SubscribeDenied => "SUBSCRIBE_DENIED",
            MediaRoomError::TrackNotFound(_) => "TRACK_NOT_FOUND",
            MediaRoomError::AlreadyPublishing(_) => "ALREADY_PUBLISHING",
            MediaRoomError::TooManyTracks => "TOO_MANY_TRACKS",
            MediaRoomError::WebRtc(_) => "MEDIA_TRANSPORT_ERROR",
            MediaRoomError::TransportClosed => "TRANSPORT_CLOSED",
            MediaRoomError::BadSignallingState(_) => "BAD_SIGNALLING_STATE",
        }
    }

    /// Message safe to hand to a client. Internal WebRTC detail is replaced by
    /// a generic string so stack internals never leak over the socket.
    pub fn client_message(&self) -> String {
        match self {
            MediaRoomError::WebRtc(_) => "media transport error".to_owned(),
            other => other.to_string(),
        }
    }
}

impl From<webrtc::error::Error> for MediaRoomError {
    fn from(value: webrtc::error::Error) -> Self {
        MediaRoomError::WebRtc(value.to_string())
    }
}
