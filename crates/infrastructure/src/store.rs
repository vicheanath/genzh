//! What can go wrong in a volatile store.
//!
//! The in-memory implementations in this crate cannot fail — a `HashMap` behind
//! a mutex either has the key or it does not. Their signatures are fallible
//! anyway, and that is the whole point of the exercise: the moment one of these
//! ports is backed by Redis, every call becomes a network round trip that can
//! time out. A trait that could not report failure would force a replacement to
//! either panic or lie about what happened, and either of those is a
//! substitution the caller cannot survive.
//!
//! So the error lives at the port, not at the implementation, and callers are
//! written today against the behaviour they will need tomorrow.

use thiserror::Error;

/// Result alias for volatile-store operations.
pub type StoreResult<T> = Result<T, StoreError>;

/// A volatile store could not answer.
#[derive(Debug, Error)]
pub enum StoreError {
    /// The backing store could not be reached at all.
    ///
    /// Distinct from [`Self::Backend`] because it is the variant a caller can
    /// reasonably degrade around: an unreachable presence store means "we do
    /// not know who is online", not "the request is invalid".
    #[error("{backend} store unavailable: {message}")]
    Unavailable {
        /// Which store — `"presence"`, `"rate_limit"`, `"events"`.
        backend: &'static str,
        /// What the driver said.
        message: String,
    },

    /// The store was reached and refused, or answered something unusable.
    #[error("{backend} store failed: {message}")]
    Backend {
        /// Which store the failure came from.
        backend: &'static str,
        /// What the driver said.
        message: String,
    },
}

impl StoreError {
    /// The store could not be reached.
    pub fn unavailable(backend: &'static str, message: impl Into<String>) -> Self {
        Self::Unavailable {
            backend,
            message: message.into(),
        }
    }

    /// The store was reached and the operation failed.
    pub fn backend(backend: &'static str, message: impl Into<String>) -> Self {
        Self::Backend {
            backend,
            message: message.into(),
        }
    }

    /// Which store produced this.
    pub fn backend_name(&self) -> &'static str {
        match self {
            Self::Unavailable { backend, .. } | Self::Backend { backend, .. } => backend,
        }
    }
}
