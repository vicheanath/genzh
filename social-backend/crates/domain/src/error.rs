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
}

impl DomainError {
    /// Build an [`DomainError::Invalid`] without ceremony at call sites.
    pub fn invalid(field: &'static str, reason: impl Into<String>) -> Self {
        DomainError::Invalid { field, reason: reason.into() }
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
        }
    }
}
