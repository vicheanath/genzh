//! Resolving the caller.
//!
//! [`CurrentUser`] is an extractor rather than a layer, which means a handler
//! that needs an authenticated caller says so in its signature and one that
//! does not cannot accidentally receive one. Forgetting authentication becomes
//! a visible absence in the argument list instead of a missing route
//! annotation.
//!
//! What it does *not* do is authorize anything. Knowing who is calling is the
//! start of the story; whether they may act is resolved per resource, from the
//! database.

use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use genzh_domain::platform::PlatformRole;
use genzh_domain::{DomainError, SessionId, UserId};

use crate::error::ApiError;
use crate::state::AppState;

/// The authenticated caller.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CurrentUser {
    /// The account making the request.
    pub user_id: UserId,
    /// The session its token belongs to.
    pub session_id: SessionId,
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(bearer)
            .ok_or(ApiError::Unauthenticated)?;

        let caller = state
            .auth
            .authenticate(token)
            .map_err(|_| ApiError::Unauthenticated)?;

        // Attach identity to the current span so every log line for this
        // request can be correlated with the media plane's participant logs.
        tracing::Span::current().record("user_id", tracing::field::display(caller.user_id));

        Ok(CurrentUser {
            user_id: caller.user_id,
            session_id: caller.session_id,
        })
    }
}

/// Pull the token out of an `Authorization: Bearer …` header.
///
/// The scheme match is case-insensitive because the RFC says so and clients
/// disagree in practice.
fn bearer(header: &str) -> Option<&str> {
    let (scheme, token) = header.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("bearer") {
        return None;
    }
    let token = token.trim();
    (!token.is_empty()).then_some(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bearer_tokens_are_extracted_case_insensitively() {
        assert_eq!(bearer("Bearer abc.def.ghi"), Some("abc.def.ghi"));
        assert_eq!(bearer("bearer abc.def.ghi"), Some("abc.def.ghi"));
        assert_eq!(bearer("BEARER abc.def.ghi"), Some("abc.def.ghi"));
    }

    #[test]
    fn other_schemes_and_malformed_headers_are_refused() {
        assert_eq!(bearer("Basic dXNlcjpwYXNz"), None);
        assert_eq!(bearer("abc.def.ghi"), None);
        assert_eq!(bearer("Bearer"), None);
        assert_eq!(bearer("Bearer "), None);
        assert_eq!(bearer(""), None);
    }
}

/// A caller who works the support queue — `support` or `admin`.
///
/// The role is read from the database on every request rather than carried in
/// the access token. A token is good for its whole lifetime, so authority baked
/// into one keeps working for minutes after it is revoked — and staff authority
/// is exactly the kind that has to stop the moment somebody decides it should.
/// One extra indexed lookup on a handful of endpoints is the right price.
#[derive(Debug, Clone, Copy)]
pub struct StaffUser {
    pub user_id: UserId,
    pub session_id: SessionId,
    pub role: PlatformRole,
}

impl FromRequestParts<AppState> for StaffUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let caller = CurrentUser::from_request_parts(parts, state).await?;
        let role = state
            .staff
            .role_of(caller.user_id)
            .await
            .map_err(|_| ApiError::Unauthenticated)?;

        if !role.is_staff() {
            // Not found rather than forbidden: the console's existence is not
            // something an ordinary account needs confirmed by probing it.
            return Err(ApiError::Domain(DomainError::NotFound("resource")));
        }

        Ok(StaffUser {
            user_id: caller.user_id,
            session_id: caller.session_id,
            role,
        })
    }
}

/// A caller who may enforce: suspend accounts, remove content, read the log.
#[derive(Debug, Clone, Copy)]
pub struct AdminUser {
    pub user_id: UserId,
    pub session_id: SessionId,
}

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let staff = StaffUser::from_request_parts(parts, state).await?;

        if !staff.role.is_admin() {
            // Support reaching an admin-only route is a real caller hitting a
            // real endpoint they may not use, so this one is honest about it.
            return Err(ApiError::Forbidden("platform_admin".to_string()));
        }

        Ok(AdminUser {
            user_id: staff.user_id,
            session_id: staff.session_id,
        })
    }
}
