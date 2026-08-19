//! Public user profiles.
//!
//! Message authors and room participants arrive as ids; clients resolve them
//! here. Deliberately separate from `/me`: this response carries no e-mail and
//! no account state, so it is safe to hand to anyone the caller shares a room
//! with.

use axum::Json;
use axum::extract::{Path, State};
use serde::Serialize;
use genzh_domain::UserId;

use crate::error::{ApiError, ApiResult};
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// What one user looks like to another.
#[derive(Debug, Serialize)]
pub struct PublicProfile {
    /// Account id.
    pub id: UserId,
    /// Unique handle.
    pub handle: String,
    /// Name to show.
    pub display_name: String,
    /// User bio.
    pub bio: Option<String>,
    /// Static avatar image.
    pub avatar_url: Option<String>,
    /// Animated avatar effect key.
    pub avatar_effect: Option<String>,
    /// Accent colour.
    pub accent_color: Option<String>,
}

/// `GET /api/v1/users/{id}`
///
/// Authentication is required — profile lookup is not an anonymous enumeration
/// endpoint — but no relationship is: anyone signed in can resolve a handle
/// they have already been shown in a room or a message.
pub async fn get(
    State(state): State<AppState>,
    _caller: CurrentUser,
    Path(user_id): Path<UserId>,
) -> ApiResult<Json<PublicProfile>> {
    let user = state
        .auth
        .users()
        .find_by_id(user_id)
        .await
        .map_err(genzh_infrastructure::ServiceError::Repository)?
        .ok_or(ApiError::Domain(genzh_domain::DomainError::NotFound("user")))?;

    let profile = state
        .auth
        .users()
        .find_profile(user_id)
        .await
        .map_err(genzh_infrastructure::ServiceError::Repository)?
        .ok_or(ApiError::Domain(genzh_domain::DomainError::NotFound("profile")))?;

    Ok(Json(PublicProfile {
        id: user.id,
        handle: user.handle,
        display_name: profile.display_name,
        bio: profile.bio,
        avatar_url: profile.avatar_url,
        avatar_effect: profile.avatar_effect,
        accent_color: profile.accent_color,
    }))
}
