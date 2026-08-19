//! Errors raised by the media contract types.

use thiserror::Error;

/// Result alias for this crate.
pub type MediaCoreResult<T> = Result<T, MediaCoreError>;

/// Something went wrong minting or verifying a media token.
#[derive(Debug, Error)]
pub enum MediaCoreError {
    /// The token could not be signed.
    #[error("failed to sign media token")]
    Sign(#[source] jsonwebtoken::errors::Error),

    /// Signature mismatch, malformed token, or expired.
    ///
    /// The inner error is kept for logs but deliberately not surfaced to
    /// clients: distinguishing "bad signature" from "expired" is a small oracle
    /// we do not need to give away.
    #[error("media token is not valid")]
    InvalidToken(#[source] jsonwebtoken::errors::Error),

    /// The token is well-formed and correctly signed, but does not authorise
    /// what is being attempted.
    #[error("media token does not authorise this: {0}")]
    TokenMismatch(&'static str),

    /// A configured ICE server URL is not usable.
    #[error("invalid ICE server url: {0}")]
    InvalidIceUrl(String),
}

impl MediaCoreError {
    /// Stable machine-readable code.
    pub fn code(&self) -> &'static str {
        match self {
            MediaCoreError::Sign(_) => "MEDIA_TOKEN_SIGN_FAILED",
            MediaCoreError::InvalidToken(_) => "MEDIA_TOKEN_INVALID",
            MediaCoreError::TokenMismatch(_) => "MEDIA_TOKEN_MISMATCH",
            MediaCoreError::InvalidIceUrl(_) => "INVALID_ICE_URL",
        }
    }
}
