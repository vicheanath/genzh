//! Media server errors.

use genzh_media_core::MediaCoreError;
use genzh_media_room::MediaRoomError;
use genzh_media_signaling::{ProtocolError, SignalCloseCode};
use thiserror::Error;

/// Anything that can end or reject a signalling connection.
#[derive(Debug, Error)]
pub enum MediaError {
    /// The token was missing, malformed, expired or wrongly signed.
    #[error("unauthorized")]
    Unauthorized,

    /// The token is valid but does not authorise this room.
    #[error("forbidden")]
    Forbidden,

    /// The client sent something the protocol does not allow.
    #[error(transparent)]
    Protocol(#[from] ProtocolError),

    /// The room layer refused.
    #[error(transparent)]
    Room(#[from] MediaRoomError),

    /// Token verification failed.
    #[error(transparent)]
    Token(#[from] MediaCoreError),

    /// The client took too long to say anything.
    #[error("handshake timed out")]
    HandshakeTimeout,

    /// The connection went quiet.
    #[error("idle timeout")]
    IdleTimeout,

    /// The socket closed underneath us.
    #[error("connection closed")]
    ConnectionClosed,
}

impl MediaError {
    /// The close code to send.
    ///
    /// Deliberately coarse for anything credential-related: a client learns
    /// "your token is not good here", not which check failed.
    pub fn close_code(&self) -> SignalCloseCode {
        match self {
            MediaError::Unauthorized | MediaError::Token(_) => SignalCloseCode::Unauthorized,
            MediaError::Forbidden => SignalCloseCode::Forbidden,
            MediaError::Protocol(error) => error.close_code(),
            MediaError::Room(MediaRoomError::RoomFull) => SignalCloseCode::RoomFull,
            MediaError::Room(_) => SignalCloseCode::ServerError,
            MediaError::HandshakeTimeout | MediaError::IdleTimeout => SignalCloseCode::IdleTimeout,
            MediaError::ConnectionClosed => SignalCloseCode::Normal,
        }
    }

    /// A stable code for the `error` signalling message.
    pub fn code(&self) -> &'static str {
        match self {
            MediaError::Unauthorized | MediaError::Token(_) => "UNAUTHORIZED",
            MediaError::Forbidden => "FORBIDDEN",
            MediaError::Protocol(_) => "PROTOCOL_ERROR",
            MediaError::Room(error) => error.code(),
            MediaError::HandshakeTimeout => "HANDSHAKE_TIMEOUT",
            MediaError::IdleTimeout => "IDLE_TIMEOUT",
            MediaError::ConnectionClosed => "CONNECTION_CLOSED",
        }
    }

    /// A message safe to send to a client.
    pub fn client_message(&self) -> String {
        match self {
            MediaError::Room(error) => error.client_message(),
            MediaError::Unauthorized | MediaError::Token(_) => {
                "Your media token is not valid".to_owned()
            }
            MediaError::Forbidden => "You cannot join this room".to_owned(),
            other => other.to_string(),
        }
    }
}
