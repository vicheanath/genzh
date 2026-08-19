//! Friends and blocks.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use social_domain::social::Friendship;
use social_domain::UserId;

use crate::extract::ApiJson;
use crate::error::ApiResult;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// `POST /api/v1/friends` body.
#[derive(Debug, Deserialize)]
pub struct FriendRequest {
    /// Who to befriend.
    pub user_id: UserId,
}

/// `POST /api/v1/friends/{user_id}/respond` body.
#[derive(Debug, Deserialize)]
pub struct RespondRequest {
    /// True to accept, false to decline.
    pub accept: bool,
}

/// `GET /api/v1/friends`
pub async fn list(
    State(state): State<AppState>,
    caller: CurrentUser,
) -> ApiResult<Json<Vec<UserId>>> {
    Ok(Json(state.social.friends(caller.user_id).await?))
}

/// `GET /api/v1/friends/requests`
pub async fn pending(
    State(state): State<AppState>,
    caller: CurrentUser,
) -> ApiResult<Json<Vec<Friendship>>> {
    Ok(Json(state.social.pending_requests(caller.user_id).await?))
}

/// `POST /api/v1/friends`
pub async fn request(
    State(state): State<AppState>,
    caller: CurrentUser,
    ApiJson(body): ApiJson<FriendRequest>,
) -> ApiResult<(StatusCode, Json<Friendship>)> {
    let friendship = state.social.request_friend(caller.user_id, body.user_id).await?;
    Ok((StatusCode::CREATED, Json(friendship)))
}

/// `POST /api/v1/friends/{user_id}/respond`
pub async fn respond(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(requester_id): Path<UserId>,
    ApiJson(body): ApiJson<RespondRequest>,
) -> ApiResult<Json<Friendship>> {
    let friendship = state
        .social
        .respond_to_request(caller.user_id, requester_id, body.accept)
        .await?;
    Ok(Json(friendship))
}

/// `DELETE /api/v1/friends/{user_id}`
pub async fn remove(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(other_id): Path<UserId>,
) -> ApiResult<StatusCode> {
    state.social.remove_friend(caller.user_id, other_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `PUT /api/v1/blocks/{user_id}`
pub async fn block(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(other_id): Path<UserId>,
) -> ApiResult<StatusCode> {
    state.social.block(caller.user_id, other_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/v1/blocks/{user_id}`
pub async fn unblock(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(other_id): Path<UserId>,
) -> ApiResult<StatusCode> {
    state.social.unblock(caller.user_id, other_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
