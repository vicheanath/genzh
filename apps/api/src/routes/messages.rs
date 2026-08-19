//! Messages and reactions.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use genzh_domain::message::{Message, ReactionTally};
use genzh_domain::{MessageId, RoomId};
use serde::{Deserialize, Serialize};

use crate::error::ApiResult;
use crate::extract::ApiJson;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// `POST /api/v1/rooms/{id}/messages` body.
#[derive(Debug, Deserialize)]
pub struct PostMessageRequest {
    /// Message body.
    pub content: String,
}

/// `PATCH /api/v1/messages/{id}` body.
#[derive(Debug, Deserialize)]
pub struct EditMessageRequest {
    /// Replacement body.
    pub content: String,
}

/// A reaction key.
#[derive(Debug, Deserialize)]
pub struct ReactionRequest {
    /// Emoji or `:custom_name:`.
    pub reaction: String,
}

/// History paging.
#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    /// Return messages older than this timestamp.
    #[serde(default)]
    pub before: Option<DateTime<Utc>>,
    /// Page size.
    #[serde(default)]
    pub limit: Option<i64>,
}

/// A page of history.
#[derive(Debug, Serialize)]
pub struct HistoryResponse {
    /// Messages, newest first.
    pub messages: Vec<Message>,
    /// Cursor to pass as `before` for the next page.
    pub next_before: Option<DateTime<Utc>>,
}

/// `GET /api/v1/rooms/{id}/messages`
pub async fn list(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
    Query(query): Query<HistoryQuery>,
) -> ApiResult<Json<HistoryResponse>> {
    let page = state
        .messaging
        .history(room_id, caller.user_id, query.before, query.limit)
        .await?;
    Ok(Json(HistoryResponse {
        messages: page.messages,
        next_before: page.next_before,
    }))
}

/// `POST /api/v1/rooms/{id}/messages`
pub async fn post(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
    ApiJson(body): ApiJson<PostMessageRequest>,
) -> ApiResult<(StatusCode, Json<Message>)> {
    let message = state
        .messaging
        .post(room_id, caller.user_id, &body.content)
        .await?;
    Ok((StatusCode::CREATED, Json(message)))
}

/// `PATCH /api/v1/messages/{id}`
pub async fn edit(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(message_id): Path<MessageId>,
    ApiJson(body): ApiJson<EditMessageRequest>,
) -> ApiResult<Json<Message>> {
    Ok(Json(
        state
            .messaging
            .edit(message_id, caller.user_id, &body.content)
            .await?,
    ))
}

/// `DELETE /api/v1/messages/{id}`
pub async fn delete(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(message_id): Path<MessageId>,
) -> ApiResult<StatusCode> {
    state.messaging.delete(message_id, caller.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `PUT /api/v1/messages/{id}/reactions`
pub async fn react(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(message_id): Path<MessageId>,
    ApiJson(body): ApiJson<ReactionRequest>,
) -> ApiResult<Json<Vec<ReactionTally>>> {
    Ok(Json(
        state
            .messaging
            .react(message_id, caller.user_id, &body.reaction)
            .await?,
    ))
}

/// `DELETE /api/v1/messages/{id}/reactions`
pub async fn unreact(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(message_id): Path<MessageId>,
    ApiJson(body): ApiJson<ReactionRequest>,
) -> ApiResult<Json<Vec<ReactionTally>>> {
    Ok(Json(
        state
            .messaging
            .unreact(message_id, caller.user_id, &body.reaction)
            .await?,
    ))
}
