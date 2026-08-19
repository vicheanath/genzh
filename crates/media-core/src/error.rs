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

    /// The token was well-formed and correctly signed, but its lifetime has
    /// passed.
    ///
    /// Split out from [`MediaCoreError::InvalidToken`] because the two need
    /// opposite client behaviour: an expired token is fixed by fetching a new
    /// one, a rejected token never will be. This leaks nothing — the API hands
    /// the client `expires_at` in the join response, so the client already
    /// knows when its token dies.
    #[error("media token has expired")]
    ExpiredToken,

    /// Signature mismatch, wrong issuer or audience, or malformed.
    ///
    /// The inner error is kept for logs but deliberately not surfaced to
    /// clients: which check failed is a small oracle we do not need to give
    /// away. [`MediaCoreError::reason`] is for the operator, not the client.
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
            MediaCoreError::ExpiredToken => "MEDIA_TOKEN_EXPIRED",
            MediaCoreError::InvalidToken(_) => "MEDIA_TOKEN_INVALID",
            MediaCoreError::TokenMismatch(_) => "MEDIA_TOKEN_MISMATCH",
            MediaCoreError::InvalidIceUrl(_) => "INVALID_ICE_URL",
        }
    }

    /// A short operator-facing reason, safe for a log line.
    ///
    /// This is the difference between "the media token was rejected" — which
    /// tells whoever is on call nothing at all — and "signature", which says
    /// the two planes disagree about `MEDIA_TOKEN_SECRET`. It never reaches a
    /// client, and never contains any part of the token or the key.
    pub fn reason(&self) -> &'static str {
        use jsonwebtoken::errors::ErrorKind;

        match self {
            MediaCoreError::Sign(_) => "signing failed",
            MediaCoreError::ExpiredToken => "expired",
            MediaCoreError::TokenMismatch(what) => what,
            MediaCoreError::InvalidIceUrl(_) => "invalid ice url",
            MediaCoreError::InvalidToken(error) => match error.kind() {
                // The one an operator most needs named: it means the API and
                // the media server were started with different secrets.
                ErrorKind::InvalidSignature => "signature — the two planes disagree about MEDIA_TOKEN_SECRET",
                ErrorKind::InvalidIssuer => "issuer — JWT_ISSUER differs between the planes",
                ErrorKind::InvalidAudience => "audience",
                ErrorKind::ImmatureSignature => "not yet valid — check clock skew between the planes",
                ErrorKind::InvalidToken | ErrorKind::Base64(_) | ErrorKind::Json(_) => "malformed",
                _ => "rejected",
            },
        }
    }
}
