//! HTTP error mapping.
//!
//! Every failure leaves the API in one shape:
//!
//! ```json
//! { "error": { "code": "ROOM_ACCESS_DENIED", "message": "…" } }
//! ```
//!
//! The `code` is stable and machine-readable; the `message` is for humans and
//! never contains internal detail. A database failure becomes
//! `INTERNAL_ERROR` with a generic message, and the real cause goes to the
//! logs with the request id attached.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use genzh_auth::AuthError;
use genzh_domain::DomainError;
use genzh_infrastructure::{ServiceError, StoreError};
use serde::Serialize;

/// The body of every error response.
#[derive(Debug, Serialize)]
pub struct ErrorBody {
    /// The error envelope.
    pub error: ErrorDetail,
}

/// Code and message.
#[derive(Debug, Serialize)]
pub struct ErrorDetail {
    /// Stable machine-readable code.
    pub code: String,
    /// Human-readable explanation.
    pub message: String,
}

/// Anything a handler can fail with.
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    /// A domain rule said no.
    #[error(transparent)]
    Domain(#[from] DomainError),

    /// An application service failed.
    #[error(transparent)]
    Service(#[from] ServiceError),

    /// Authentication or account provisioning failed.
    #[error(transparent)]
    Auth(#[from] AuthError),

    /// The request body or parameters were malformed.
    #[error("{0}")]
    BadRequest(String),

    /// No credentials, or bad ones.
    #[error("authentication required")]
    Unauthenticated,

    /// Forbidden action.
    #[error("{0}")]
    Forbidden(String),

    /// Too many requests.
    #[error("too many requests")]
    RateLimited,

    /// A volatile store — presence, request budgets, real-time fan-out —
    /// could not answer.
    ///
    /// Separate from [`Self::Service`] because it means something different to
    /// the caller: the request was valid and a dependency is degraded, so
    /// retrying is reasonable in a way that retrying a rejected write is not.
    #[error(transparent)]
    Store(#[from] StoreError),
}

impl ApiError {
    /// The status and code for this failure.
    fn parts(&self) -> (StatusCode, String, String) {
        match self {
            ApiError::Domain(error) => domain_parts(error),
            ApiError::Service(ServiceError::Domain(error)) => domain_parts(error),
            ApiError::Service(ServiceError::Repository(error)) => {
                tracing::error!(%error, "repository failure");
                internal()
            }
            ApiError::Auth(error) => auth_parts(error),
            ApiError::BadRequest(message) => (
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST".to_owned(),
                message.clone(),
            ),
            ApiError::Forbidden(message) => (
                StatusCode::FORBIDDEN,
                "FORBIDDEN".to_owned(),
                message.clone(),
            ),
            ApiError::Unauthenticated => (
                StatusCode::UNAUTHORIZED,
                "UNAUTHENTICATED".to_owned(),
                "Authentication is required".to_owned(),
            ),
            ApiError::RateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMITED".to_owned(),
                "Too many requests, slow down".to_owned(),
            ),
            // 503 rather than 500: nothing is broken, something is briefly
            // unreachable, and a client is right to try again shortly.
            ApiError::Store(error) => {
                tracing::error!(%error, backend = error.backend_name(), "volatile store failure");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "STORE_UNAVAILABLE".to_owned(),
                    "That information is briefly unavailable, try again".to_owned(),
                )
            }
        }
    }
}

fn internal() -> (StatusCode, String, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR".to_owned(),
        "Something went wrong on our side".to_owned(),
    )
}

fn domain_parts(error: &DomainError) -> (StatusCode, String, String) {
    match error {
        DomainError::Invalid { .. } | DomainError::UnknownPermission(_) => (
            StatusCode::BAD_REQUEST,
            error.code().to_owned(),
            error.to_string(),
        ),
        DomainError::NotFound(_) => (
            StatusCode::NOT_FOUND,
            error.code().to_owned(),
            error.to_string(),
        ),
        DomainError::Conflict(_) => (
            StatusCode::CONFLICT,
            error.code().to_owned(),
            error.to_string(),
        ),
        DomainError::UnsupportedRoomType(_) => (
            StatusCode::BAD_REQUEST,
            error.code().to_owned(),
            error.to_string(),
        ),
        // A non-member and a member who cannot see a room get the same 403 with
        // a specific code, so a client can tell the user something useful
        // without the API confirming what exists inside a community.
        DomainError::NotAMember => (
            StatusCode::FORBIDDEN,
            error.code().to_owned(),
            "You are not a member of this community".to_owned(),
        ),
        DomainError::PermissionDenied(permission) => (
            StatusCode::FORBIDDEN,
            room_access_code(permission),
            format!("You do not have permission to {}", describe(permission)),
        ),
    }
}

/// Map a denied permission onto a code a client can branch on.
fn room_access_code(permission: &str) -> String {
    match permission {
        "view_room" => "ROOM_ACCESS_DENIED".to_owned(),
        "speak" => "SPEAK_DENIED".to_owned(),
        "use_video" => "VIDEO_DENIED".to_owned(),
        "screen_share" => "SCREEN_SHARE_DENIED".to_owned(),
        other => format!("PERMISSION_DENIED_{}", other.to_uppercase()),
    }
}

fn describe(permission: &str) -> &str {
    match permission {
        "view_room" => "join this room",
        "send_message" => "post messages here",
        "add_reaction" => "react to messages here",
        "speak" => "speak in this room",
        "use_video" => "turn on your camera here",
        "screen_share" => "share your screen here",
        "manage_room" => "manage this room",
        "manage_roles" => "manage roles",
        "manage_members" => "manage members",
        "manage_community" => "manage this community",
        "owner_only" => "do this — only the owner can",
        "cannot_remove_owner" => "remove the owner",
        "message_author_only" => "edit someone else's message",
        "friend_request_addressee_only" => "respond to this request",
        "blocked" => "contact this user",
        _ => "do this",
    }
}

fn auth_parts(error: &AuthError) -> (StatusCode, String, String) {
    match error {
        AuthError::AlreadyRegistered(field) => (
            StatusCode::CONFLICT,
            error.code().to_owned(),
            format!("That {field} is already registered"),
        ),
        AuthError::InvalidCredentials => (
            StatusCode::UNAUTHORIZED,
            error.code().to_owned(),
            "Incorrect handle, e-mail or password".to_owned(),
        ),
        AuthError::AccountInactive => (
            StatusCode::FORBIDDEN,
            error.code().to_owned(),
            "This account is not active".to_owned(),
        ),
        AuthError::InvalidToken | AuthError::InvalidSession => (
            StatusCode::UNAUTHORIZED,
            error.code().to_owned(),
            "Your session has expired, please sign in again".to_owned(),
        ),
        AuthError::Domain(domain) => domain_parts(domain),
        AuthError::Repository(inner) => {
            tracing::error!(error = %inner, "repository failure during authentication");
            internal()
        }
        AuthError::Hashing => {
            tracing::error!("password hashing failed");
            internal()
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = self.parts();
        (
            status,
            Json(ErrorBody {
                error: ErrorDetail { code, message },
            }),
        )
            .into_response()
    }
}

/// Result alias for handlers.
pub type ApiResult<T> = Result<T, ApiError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_denied_room_join_is_a_403_with_a_branchable_code() {
        let error = ApiError::Domain(DomainError::PermissionDenied("view_room"));
        let (status, code, message) = error.parts();
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(code, "ROOM_ACCESS_DENIED");
        assert_eq!(message, "You do not have permission to join this room");
    }

    #[test]
    fn media_permissions_get_their_own_codes() {
        for (permission, expected) in [
            ("speak", "SPEAK_DENIED"),
            ("use_video", "VIDEO_DENIED"),
            ("screen_share", "SCREEN_SHARE_DENIED"),
        ] {
            let (status, code, _) =
                ApiError::Domain(DomainError::PermissionDenied(permission)).parts();
            assert_eq!(status, StatusCode::FORBIDDEN);
            assert_eq!(code, expected);
        }
    }

    #[test]
    fn storage_failures_never_reach_the_client() {
        let error = ApiError::Service(ServiceError::Repository(
            genzh_infrastructure::RepositoryError::Migration("column x does not exist".into()),
        ));
        let (status, code, message) = error.parts();
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(code, "INTERNAL_ERROR");
        assert!(
            !message.contains("column"),
            "internal detail leaked: {message}"
        );
    }

    #[test]
    fn bad_credentials_do_not_say_which_half_was_wrong() {
        let (status, code, message) = ApiError::Auth(AuthError::InvalidCredentials).parts();
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(code, "INVALID_CREDENTIALS");
        assert!(message.contains("handle, e-mail or password"));
    }

    #[test]
    fn validation_failures_are_400_and_keep_their_detail() {
        let error = ApiError::Domain(DomainError::invalid(
            "handle",
            "must be at least 3 characters",
        ));
        let (status, code, message) = error.parts();
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(code, "VALIDATION_FAILED");
        assert!(message.contains("at least 3 characters"));
    }

    #[test]
    fn the_error_body_has_the_documented_shape() {
        let body = ErrorBody {
            error: ErrorDetail {
                code: "ROOM_ACCESS_DENIED".into(),
                message: "You do not have permission to join this room".into(),
            },
        };
        let json = serde_json::to_value(&body).unwrap();
        assert_eq!(json["error"]["code"], "ROOM_ACCESS_DENIED");
        assert!(json["error"]["message"].is_string());
        assert_eq!(
            json.as_object().unwrap().len(),
            1,
            "no stray top-level fields"
        );
    }

    #[test]
    fn not_found_and_conflict_map_to_their_status_codes() {
        assert_eq!(
            ApiError::Domain(DomainError::NotFound("room")).parts().0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            ApiError::Domain(DomainError::Conflict("membership"))
                .parts()
                .0,
            StatusCode::CONFLICT
        );
    }
}
