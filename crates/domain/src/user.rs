//! User accounts and their public profiles.
//!
//! An account (`User`) carries credentials and is never serialised to clients.
//! A `Profile` is the public face: display name, avatar, and the animated
//! avatar effect the creator marketplace will eventually sell.

use serde::{Deserialize, Serialize};

use crate::Timestamp;
use crate::error::{DomainError, DomainResult};
use crate::ids::UserId;

/// Minimum and maximum length of a handle, in characters.
pub const HANDLE_MIN_LEN: usize = 3;
/// See [`HANDLE_MIN_LEN`].
pub const HANDLE_MAX_LEN: usize = 32;
/// Maximum length of a display name.
pub const DISPLAY_NAME_MAX_LEN: usize = 48;
/// Minimum password length accepted at registration.
pub const PASSWORD_MIN_LEN: usize = 10;

/// A user account. `password_hash` never leaves the server process.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct User {
    /// Primary key.
    pub id: UserId,
    /// Unique, case-insensitive login handle.
    pub handle: String,
    /// Unique, case-insensitive e-mail address.
    pub email: String,
    /// Argon2id PHC string. None if the user registered via OAuth without a password.
    pub password_hash: Option<String>,
    /// Whether the account can still authenticate.
    pub is_active: bool,
    /// Creation time (UTC).
    pub created_at: Timestamp,
    /// Last modification time (UTC).
    pub updated_at: Timestamp,
}

/// The publicly visible half of an account.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Profile {
    /// Owning account.
    pub user_id: UserId,
    /// Name shown in rooms and member lists.
    pub display_name: String,
    /// Free-form bio.
    pub bio: Option<String>,
    /// URL of the static avatar image.
    pub avatar_url: Option<String>,
    /// Key of the animated avatar effect (resolved by the client asset bundle).
    pub avatar_effect: Option<String>,
    /// Accent colour as `#rrggbb`.
    pub accent_color: Option<String>,
    /// Creation time (UTC).
    pub created_at: Timestamp,
    /// Last modification time (UTC).
    pub updated_at: Timestamp,
}

/// Normalise and validate a handle. Handles are stored lower-cased so that
/// uniqueness is case-insensitive without a functional index.
pub fn normalize_handle(raw: &str) -> DomainResult<String> {
    let handle = raw.trim().to_lowercase();
    let len = handle.chars().count();
    if !(HANDLE_MIN_LEN..=HANDLE_MAX_LEN).contains(&len) {
        return Err(DomainError::invalid(
            "handle",
            format!("must be between {HANDLE_MIN_LEN} and {HANDLE_MAX_LEN} characters"),
        ));
    }
    if !handle
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
    {
        return Err(DomainError::invalid(
            "handle",
            "may only contain letters, digits, '_' and '.'",
        ));
    }
    if handle.starts_with('.') || handle.ends_with('.') {
        return Err(DomainError::invalid(
            "handle",
            "may not start or end with '.'",
        ));
    }
    Ok(handle)
}

/// Normalise and validate an e-mail address.
///
/// Deliberately shallow: real verification happens by sending mail. We only
/// reject values that cannot possibly be addresses.
pub fn normalize_email(raw: &str) -> DomainResult<String> {
    let email = raw.trim().to_lowercase();
    let mut parts = email.split('@');
    let (local, domain) = (
        parts.next().unwrap_or_default(),
        parts.next().unwrap_or_default(),
    );
    if parts.next().is_some() || local.is_empty() || domain.is_empty() || !domain.contains('.') {
        return Err(DomainError::invalid(
            "email",
            "must be a valid e-mail address",
        ));
    }
    if email.len() > 254 {
        return Err(DomainError::invalid(
            "email",
            "must be at most 254 characters",
        ));
    }
    Ok(email)
}

/// Validate a display name.
pub fn validate_display_name(raw: &str) -> DomainResult<String> {
    let name = raw.trim().to_owned();
    if name.is_empty() || name.chars().count() > DISPLAY_NAME_MAX_LEN {
        return Err(DomainError::invalid(
            "display_name",
            format!("must be between 1 and {DISPLAY_NAME_MAX_LEN} characters"),
        ));
    }
    Ok(name)
}

/// Validate a plaintext password before hashing.
///
/// Length is the only rule we enforce: composition rules push users towards
/// predictable passwords, and the hash is Argon2id either way.
pub fn validate_password(raw: &str) -> DomainResult<()> {
    if raw.chars().count() < PASSWORD_MIN_LEN {
        return Err(DomainError::invalid(
            "password",
            format!("must be at least {PASSWORD_MIN_LEN} characters"),
        ));
    }
    if raw.len() > 1024 {
        return Err(DomainError::invalid(
            "password",
            "must be at most 1024 bytes",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handles_are_lowercased_and_trimmed() {
        assert_eq!(normalize_handle("  MoonWalker  ").unwrap(), "moonwalker");
    }

    #[test]
    fn handles_reject_bad_shapes() {
        assert!(normalize_handle("ab").is_err(), "too short");
        assert!(normalize_handle(&"a".repeat(33)).is_err(), "too long");
        assert!(normalize_handle("hey there").is_err(), "space");
        assert!(normalize_handle(".leading").is_err(), "leading dot");
        assert!(normalize_handle("trailing.").is_err(), "trailing dot");
        assert!(normalize_handle("emoji🙂").is_err(), "non-ascii");
    }

    #[test]
    fn emails_are_shallowly_validated() {
        assert_eq!(normalize_email(" A@B.CO ").unwrap(), "a@b.co");
        assert!(normalize_email("nope").is_err());
        assert!(normalize_email("a@b").is_err());
        assert!(normalize_email("a@@b.co").is_err());
        assert!(normalize_email("@b.co").is_err());
    }

    #[test]
    fn passwords_have_a_length_floor() {
        assert!(validate_password("short").is_err());
        assert!(validate_password("a-long-enough-password").is_ok());
    }
}
