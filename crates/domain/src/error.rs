//! Domain-level errors.
//!
//! These describe *rule* violations, not transport or storage failures. Each
//! application layer maps them onto its own protocol (HTTP status + error code
//! for the API, close frames for WebSockets).

use thiserror::Error;

/// Result alias for fallible domain operations.
pub type DomainResult<T> = Result<T, DomainError>;

/// Something the domain refuses to do.
#[derive(Debug, Error, PartialEq, Eq, Clone)]
pub enum DomainError {
    /// A field failed a domain invariant (length, charset, range).
    #[error("{field} is invalid: {reason}")]
    Invalid {
        /// Field that failed validation.
        field: &'static str,
        /// Human-readable reason.
        reason: String,
    },

    /// The requested entity does not exist (or is not visible to the caller).
    #[error("{0} not found")]
    NotFound(&'static str),

    /// The entity already exists and the operation is not idempotent.
    #[error("{0} already exists")]
    Conflict(&'static str),

    /// The caller is authenticated but lacks the required capability.
    #[error("missing permission: {0}")]
    PermissionDenied(&'static str),

    /// The caller is not a member of the community that owns the resource.
    #[error("not a member of this community")]
    NotAMember,

    /// The operation is meaningless for this room type (e.g. joining media on
    /// a text room).
    #[error("operation not supported for {0} rooms")]
    UnsupportedRoomType(&'static str),

    /// A permission key arrived that is not in the catalogue.
    #[error("unknown permission: {0}")]
    UnknownPermission(String),

    /// The caller is acting faster than the rules allow, or repeating
    /// themselves.
    ///
    /// Deliberately not a [`Self::PermissionDenied`]: nothing about who they
    /// are is wrong, and waiting fixes it. Carrying the wait here rather than
    /// only in the HTTP layer is what lets the WebSocket path say the same
    /// thing — a flood is refused identically whichever way it arrives.
    #[error("{reason}")]
    Throttled {
        /// What was too fast, phrased for a person.
        reason: &'static str,
        /// How long until it is worth trying again.
        retry_after_seconds: u64,
    },
}

impl DomainError {
    /// Build a [`DomainError::Throttled`] from a wait.
    ///
    /// Rounded up so a sub-second wait advertises one second rather than zero,
    /// which a client would read as "retry immediately".
    pub fn throttled(reason: &'static str, retry_after: std::time::Duration) -> Self {
        DomainError::Throttled {
            reason,
            retry_after_seconds: retry_after.as_secs_f64().ceil().max(1.0) as u64,
        }
    }

    /// How long to wait, for a failure that is worth retrying.
    pub fn retry_after_seconds(&self) -> Option<u64> {
        match self {
            DomainError::Throttled {
                retry_after_seconds,
                ..
            } => Some(*retry_after_seconds),
            _ => None,
        }
    }

    /// Build an [`DomainError::Invalid`] without ceremony at call sites.
    pub fn invalid(field: &'static str, reason: impl Into<String>) -> Self {
        DomainError::Invalid {
            field,
            reason: reason.into(),
        }
    }

    /// A stable, machine-readable code for API clients.
    pub fn code(&self) -> &'static str {
        match self {
            DomainError::Invalid { .. } => "VALIDATION_FAILED",
            DomainError::NotFound(_) => "NOT_FOUND",
            DomainError::Conflict(_) => "CONFLICT",
            DomainError::PermissionDenied(_) => "PERMISSION_DENIED",
            DomainError::NotAMember => "NOT_A_MEMBER",
            DomainError::UnsupportedRoomType(_) => "UNSUPPORTED_ROOM_TYPE",
            DomainError::UnknownPermission(_) => "UNKNOWN_PERMISSION",
            // The same code the per-address budget returns: to a client both
            // mean "you are going too fast", and branching on which limiter
            // fired is not something a client can act on differently.
            DomainError::Throttled { .. } => "RATE_LIMITED",
        }
    }
}
