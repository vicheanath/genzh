//! Authentication errors.

use genzh_domain::DomainError;
use genzh_infrastructure::RepositoryError;
use thiserror::Error;

/// Result alias for authentication operations.
pub type AuthResult<T> = Result<T, AuthError>;

/// Something went wrong authenticating or provisioning an account.
#[derive(Debug, Error)]
pub enum AuthError {
    /// The handle or e-mail is taken.
    #[error("{0} is already registered")]
    AlreadyRegistered(&'static str),

    /// Wrong identifier or wrong password.
    ///
    /// One variant covers both on purpose: telling an attacker that a handle
    /// exists but the password is wrong turns a credential-stuffing run into
    /// an account-enumeration run.
    #[error("invalid credentials")]
    InvalidCredentials,

    /// The account exists but has been deactivated.
    #[error("account is not active")]
    AccountInactive,

    /// The presented access token is missing, malformed or expired.
    #[error("invalid or expired token")]
    InvalidToken,

    /// The refresh token is unknown, already used, revoked or expired.
    #[error("invalid or expired session")]
    InvalidSession,

    /// Input failed a domain rule.
    #[error(transparent)]
    Domain(#[from] DomainError),

    /// Storage failed.
    #[error("storage failure")]
    Repository(#[from] RepositoryError),

    /// The password hasher failed, which is a server fault rather than a
    /// credential problem.
    #[error("password hashing failed")]
    Hashing,
}

impl AuthError {
    /// Stable machine-readable code for API responses.
    pub fn code(&self) -> &'static str {
        match self {
            AuthError::AlreadyRegistered(_) => "ALREADY_REGISTERED",
            AuthError::InvalidCredentials => "INVALID_CREDENTIALS",
            AuthError::AccountInactive => "ACCOUNT_INACTIVE",
            AuthError::InvalidToken => "INVALID_TOKEN",
            AuthError::InvalidSession => "INVALID_SESSION",
            AuthError::Domain(error) => error.code(),
            AuthError::Repository(_) | AuthError::Hashing => "INTERNAL_ERROR",
        }
    }
}
