//! Repository errors, and the translation from PostgreSQL error codes.

use social_domain::DomainError;
use thiserror::Error;

/// Result alias for repository calls.
pub type RepositoryResult<T> = Result<T, RepositoryError>;

/// Anything that can go wrong talking to PostgreSQL.
#[derive(Debug, Error)]
pub enum RepositoryError {
    /// A row that was required is not there.
    #[error("{0} not found")]
    NotFound(&'static str),

    /// A unique index rejected the write.
    ///
    /// The constraint name is carried so services can turn "some unique index"
    /// into "that handle is taken" without string-matching driver messages.
    #[error("conflict on {constraint}")]
    Conflict {
        /// Name of the violated constraint.
        constraint: String,
    },

    /// A foreign key rejected the write, i.e. the parent row is gone.
    #[error("referenced row does not exist")]
    ForeignKey,

    /// Anything else the driver reported.
    #[error("database error")]
    Database(#[source] sqlx::Error),

    /// A migration failed to apply.
    #[error("migration failed: {0}")]
    Migration(String),
}

/// PostgreSQL SQLSTATE for `unique_violation`.
const UNIQUE_VIOLATION: &str = "23505";
/// PostgreSQL SQLSTATE for `foreign_key_violation`.
const FOREIGN_KEY_VIOLATION: &str = "23503";

impl From<sqlx::Error> for RepositoryError {
    fn from(error: sqlx::Error) -> Self {
        let sqlx::Error::Database(db) = &error else {
            return RepositoryError::Database(error);
        };

        match db.code().as_deref() {
            Some(UNIQUE_VIOLATION) => RepositoryError::Conflict {
                constraint: db.constraint().unwrap_or("unique constraint").to_owned(),
            },
            Some(FOREIGN_KEY_VIOLATION) => RepositoryError::ForeignKey,
            _ => RepositoryError::Database(error),
        }
    }
}

impl RepositoryError {
    /// Was this a violation of the named constraint?
    ///
    /// Lets a service map one specific index onto one specific domain error,
    /// rather than guessing which uniqueness rule fired.
    pub fn is_conflict_on(&self, name: &str) -> bool {
        matches!(self, RepositoryError::Conflict { constraint } if constraint == name)
    }

    /// Turn a storage failure into a domain failure where there is a faithful
    /// mapping, so services can return `DomainError` uniformly.
    pub fn into_domain(self, entity: &'static str) -> DomainError {
        match self {
            RepositoryError::NotFound(what) => DomainError::NotFound(what),
            RepositoryError::Conflict { .. } => DomainError::Conflict(entity),
            RepositoryError::ForeignKey => DomainError::NotFound(entity),
            other => {
                // Storage failures are not domain failures; the caller logs the
                // detail and returns a 500.
                tracing::error!(error = %other, entity, "repository failure");
                DomainError::Invalid { field: "request", reason: "internal error".to_owned() }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conflicts_are_matched_by_constraint_name() {
        let error = RepositoryError::Conflict { constraint: "users_handle_key".to_owned() };
        assert!(error.is_conflict_on("users_handle_key"));
        assert!(!error.is_conflict_on("users_email_key"));
    }

    #[test]
    fn a_missing_row_maps_onto_a_domain_not_found() {
        let error = RepositoryError::NotFound("community");
        assert_eq!(error.into_domain("community"), DomainError::NotFound("community"));
    }

    #[test]
    fn a_foreign_key_failure_reads_as_a_missing_parent() {
        assert_eq!(
            RepositoryError::ForeignKey.into_domain("room"),
            DomainError::NotFound("room")
        );
    }
}

/// The error every application service returns.
///
/// There are exactly two ways a service call fails: the domain said no, or
/// storage broke. Sharing one enum across the bounded contexts keeps the API's
/// error mapping to a single `impl` instead of one per crate, without
/// flattening a rule violation and a dead database into the same thing.
#[derive(Debug, Error)]
pub enum ServiceError {
    /// A domain rule rejected the request.
    #[error(transparent)]
    Domain(#[from] DomainError),

    /// Persistence failed. Never surfaced to clients verbatim.
    #[error("storage failure")]
    Repository(#[from] RepositoryError),
}

/// Result alias for application services.
pub type ServiceResult<T> = Result<T, ServiceError>;

impl ServiceError {
    /// Stable machine-readable code.
    pub fn code(&self) -> &'static str {
        match self {
            ServiceError::Domain(error) => error.code(),
            ServiceError::Repository(_) => "INTERNAL_ERROR",
        }
    }

    /// Convenience for the very common "this row must exist" case.
    pub fn not_found(entity: &'static str) -> Self {
        ServiceError::Domain(DomainError::NotFound(entity))
    }

    /// Convenience for a denied capability.
    pub fn denied(permission: &'static str) -> Self {
        ServiceError::Domain(DomainError::PermissionDenied(permission))
    }
}
