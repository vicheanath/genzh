//! Friends and blocks.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use genzh_domain::UserId;
use genzh_domain::social::Friendship;
use serde::Deserialize;

use crate::error::ApiResult;
use crate::extract::ApiJson;
use crate::middleware::CurrentUser;
use genzh_domain::notification::NotificationKind;
use genzh_domain::social::FriendshipStatus;
use crate::state::AppState;

/// `GET /api/v1/friends/sent`
pub async fn sent(
    State(state): State<AppState>,
    caller: CurrentUser,
) -> ApiResult<Json<Vec<Friendship>>> {
    Ok(Json(state.social.sent_requests(caller.user_id).await?))
}

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
    let friendship = state
        .social
        .request_friend(caller.user_id, body.user_id)
        .await?;

    // Requesting back an outstanding request accepts it, so which side to tell
    // depends on what actually happened rather than on which endpoint was hit.
    let (recipient, kind) = if friendship.status == FriendshipStatus::Accepted {
        (friendship.requester_id, NotificationKind::FriendAccepted)
    } else {
        (body.user_id, NotificationKind::FriendRequest)
    };
    crate::notify::notify_friendship(&state, recipient, caller.user_id, kind).await;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::FriendRequested,
            format!("Friend request to user {}", body.user_id),
        )
        .about("user", body.user_id.as_uuid()),
    ).await;

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

    // Only an acceptance is worth telling someone about. A decline that
    // notified would make declining quietly impossible.
    if body.accept {
        crate::notify::notify_friendship(
            &state,
            requester_id,
            caller.user_id,
            NotificationKind::FriendAccepted,
        )
        .await;
    }

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::FriendResponded,
            format!("Friend request from user {} responded (accept={})", requester_id, body.accept),
        )
        .about("user", requester_id.as_uuid()),
    ).await;

    Ok(Json(friendship))
}

/// `DELETE /api/v1/friends/{user_id}`
pub async fn remove(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(other_id): Path<UserId>,
) -> ApiResult<StatusCode> {
    state.social.remove_friend(caller.user_id, other_id).await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::FriendRemoved,
            format!("Friendship with user {} removed", other_id),
        )
        .about("user", other_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/v1/blocks`
pub async fn blocked(
    State(state): State<AppState>,
    caller: CurrentUser,
) -> ApiResult<Json<Vec<UserId>>> {
    Ok(Json(state.social.blocked(caller.user_id).await?))
}

/// `PUT /api/v1/blocks/{user_id}`
pub async fn block(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(other_id): Path<UserId>,
) -> ApiResult<StatusCode> {
    state.social.block(caller.user_id, other_id).await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::UserBlocked,
            format!("User {} blocked", other_id),
        )
        .about("user", other_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/v1/blocks/{user_id}`
pub async fn unblock(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(other_id): Path<UserId>,
) -> ApiResult<StatusCode> {
    state.social.unblock(caller.user_id, other_id).await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::UserUnblocked,
            format!("User {} unblocked", other_id),
        )
        .about("user", other_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}
