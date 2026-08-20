//! Reading and clearing notifications.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use genzh_domain::notification::Notification;
use genzh_domain::{NotificationId, Timestamp};
use serde::{Deserialize, Serialize};

use crate::error::ApiResult;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// Query for [`list`].
#[derive(Debug, Deserialize)]
pub struct ListQuery {
    /// Cursor: return notifications older than this. Absent for the first page.
    #[serde(default)]
    pub before: Option<Timestamp>,
    #[serde(default)]
    pub limit: Option<i64>,
}

/// A page of notifications plus the unread badge.
///
/// The count travels with the list because every caller of one wants the other,
/// and a client that fetched them separately could render a badge that
/// disagrees with the list beneath it.
#[derive(Debug, Serialize)]
pub struct NotificationPageResponse {
    pub notifications: Vec<Notification>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_before: Option<Timestamp>,
    pub unread: i64,
}

/// `GET /api/v1/notifications`
pub async fn list(
    State(state): State<AppState>,
    caller: CurrentUser,
    Query(query): Query<ListQuery>,
) -> ApiResult<Json<NotificationPageResponse>> {
    let page = state
        .notifications
        .list(caller.user_id, query.before, query.limit)
        .await?;
    let unread = state.notifications.unread_count(caller.user_id).await?;

    Ok(Json(NotificationPageResponse {
        notifications: page.notifications,
        next_before: page.next_before,
        unread,
    }))
}

/// `POST /api/v1/notifications/{id}/read`
pub async fn mark_read(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(id): Path<NotificationId>,
) -> ApiResult<StatusCode> {
    // Already-read is not an error: marking twice is what a client does when it
    // opens the same notification from two places.
    state.notifications.mark_read(caller.user_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/v1/notifications/read`
pub async fn mark_all_read(
    State(state): State<AppState>,
    caller: CurrentUser,
) -> ApiResult<StatusCode> {
    state.notifications.mark_all_read(caller.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
