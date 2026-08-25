//! Messages and reactions.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use genzh_domain::message::{Message, ReactionSummary};
use genzh_domain::room::RoomAnonymousIdentity;
use genzh_domain::{MessageId, RoomId};
use serde::{Deserialize, Serialize};

use crate::error::ApiResult;
use crate::extract::ApiJson;
use crate::middleware::CurrentUser;
use crate::routes::ws::ChatServerEvent;
use crate::state::AppState;

/// `POST /api/v1/rooms/{id}/messages` body.
#[derive(Debug, Deserialize)]
pub struct PostMessageRequest {
    /// Message body.
    pub content: String,
    /// Whether this message should be sent anonymously.
    #[serde(default)]
    pub is_anonymous: Option<bool>,
    /// The message this one answers. Must be in the same room.
    #[serde(default)]
    pub reply_to_id: Option<genzh_domain::MessageId>,
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
    /// Tie-breaker for `before`, from the previous page's `next_before_id`.
    ///
    /// Optional so a client that only sends `before` keeps working; supplying
    /// both is what guarantees no message falls through a page boundary.
    #[serde(default)]
    pub before_id: Option<MessageId>,
    /// Page size.
    #[serde(default)]
    pub limit: Option<i64>,
}

/// A message plus everything a client needs to render it.
#[derive(Debug, Serialize)]
pub struct MessageView {
    /// The message itself.
    #[serde(flatten)]
    pub message: Message,
    /// Reaction tallies, including whether the caller is in each one.
    pub reactions: Vec<ReactionSummary>,
    /// Anonymous author alias if message was sent anonymously.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anonymous_author: Option<RoomAnonymousIdentity>,
}

/// A page of history.
#[derive(Debug, Serialize)]
pub struct HistoryResponse {
    /// Messages, newest first.
    pub messages: Vec<MessageView>,
    /// Cursor to pass as `before` for the next page.
    pub next_before: Option<DateTime<Utc>>,
    /// Pass alongside it as `before_id`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_before_id: Option<MessageId>,
}

/// `GET /api/v1/rooms/{id}/messages`
pub async fn list(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
    Query(query): Query<HistoryQuery>,
) -> ApiResult<Json<HistoryResponse>> {
    let _access = state.rooms.visible_access(room_id, caller.user_id).await?;

    let page = state
        .messaging
        .history(
            room_id,
            caller.user_id,
            query.before,
            query.before_id,
            query.limit,
        )
        .await?;

    let ids: Vec<_> = page.messages.iter().map(|message| message.id).collect();
    let mut reactions = state
        .messaging
        .reactions_for(room_id, caller.user_id, &ids)
        .await?;

    let mut anon_identities = HashMap::new();
    for msg in &page.messages {
        if msg.is_anonymous && !anon_identities.contains_key(&msg.author_id) {
            if let Ok(Some(ident)) = state
                .rooms
                .get_anonymous_identity(room_id, msg.author_id)
                .await
            {
                anon_identities.insert(msg.author_id, ident);
            }
        }
    }

    Ok(Json(HistoryResponse {
        messages: page
            .messages
            .into_iter()
            .map(|message| {
                let anon = if message.is_anonymous {
                    anon_identities.get(&message.author_id).cloned()
                } else {
                    None
                };
                MessageView {
                    reactions: reactions.remove(&message.id).unwrap_or_default(),
                    anonymous_author: anon,
                    message,
                }
            })
            .collect(),
        next_before: page.next_before,
        next_before_id: page.next_before_id,
    }))
}

/// `POST /api/v1/rooms/{id}/messages`
pub async fn post(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
    ApiJson(body): ApiJson<PostMessageRequest>,
) -> ApiResult<(StatusCode, Json<MessageView>)> {
    let access = state.rooms.visible_access(room_id, caller.user_id).await?;

    // Determine anonymity: explicit choice in body > participant preference > room default
    let participant = state
        .rooms
        .participant(room_id, caller.user_id)
        .await
        .unwrap_or(None);

    let is_anonymous = body.is_anonymous.unwrap_or_else(|| {
        participant
            .map(|p| p.is_anonymous)
            .unwrap_or(access.room.is_anonymous)
    });

    let message = state
        .messaging
        .post(room_id, caller.user_id, &body.content, is_anonymous, body.reply_to_id)
        .await?;

    let anonymous_author = if is_anonymous {
        state
            .rooms
            .ensure_anonymous_identity(room_id, caller.user_id)
            .await
            .ok()
    } else {
        None
    };

    state
        .broadcast(ChatServerEvent::MessageCreated {
            room_id,
            message: message.clone(),
            reactions: Vec::new(),
            anonymous_author: anonymous_author.clone(),
        })
        .await;

    // An anonymous message still notifies — being mentioned is the point — but
    // names no actor, so it cannot unmask who wrote it.
    let actor = (!is_anonymous).then_some(caller.user_id);
    crate::notify::notify_for_message(&state, &access.room, &message, actor).await;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            (!is_anonymous).then_some(caller.user_id),
            genzh_domain::audit::AuditAction::MessageCreated,
            format!("Message created in room {}", room_id),
        )
        .about("message", message.id.as_uuid()),
    ).await;

    Ok((
        StatusCode::CREATED,
        Json(MessageView {
            message,
            reactions: Vec::new(),
            anonymous_author,
        }),
    ))
}

/// `PATCH /api/v1/messages/{id}`
pub async fn edit(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(message_id): Path<MessageId>,
    ApiJson(body): ApiJson<EditMessageRequest>,
) -> ApiResult<Json<Message>> {
    let updated = state
        .messaging
        .edit(message_id, caller.user_id, &body.content)
        .await?;

    let anonymous_author = if updated.is_anonymous {
        state
            .rooms
            .get_anonymous_identity(updated.room_id, updated.author_id)
            .await
            .ok()
            .flatten()
    } else {
        None
    };

    let reactions = state
        .messaging
        .reactions_for(updated.room_id, caller.user_id, &[message_id])
        .await
        .ok()
        .and_then(|mut map| map.remove(&message_id))
        .unwrap_or_default();

    state
        .broadcast(ChatServerEvent::MessageUpdated {
            room_id: updated.room_id,
            message: updated.clone(),
            reactions,
            anonymous_author,
        })
        .await;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            (!updated.is_anonymous).then_some(caller.user_id),
            genzh_domain::audit::AuditAction::MessageEdited,
            format!("Message {} edited in room {}", message_id, updated.room_id),
        )
        .about("message", message_id.as_uuid()),
    ).await;

    Ok(Json(updated))
}

/// `DELETE /api/v1/messages/{id}`
pub async fn delete(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(message_id): Path<MessageId>,
) -> ApiResult<StatusCode> {
    let msg = state
        .messaging
        .find(message_id)
        .await?
        .ok_or_else(|| genzh_infrastructure::ServiceError::not_found("message"))?;

    state.messaging.delete(message_id, caller.user_id).await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::MessageRemoved,
            format!("Message {} removed", message_id),
        )
        .about("message", message_id.as_uuid()),
    ).await;

    state
        .broadcast(ChatServerEvent::MessageDeleted {
            room_id: msg.room_id,
            message_id,
        })
        .await;

    Ok(StatusCode::NO_CONTENT)
}

/// `PUT /api/v1/messages/{id}/reactions`
pub async fn react(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(message_id): Path<MessageId>,
    ApiJson(body): ApiJson<ReactionRequest>,
) -> ApiResult<Json<Vec<ReactionSummary>>> {
    let reactions = state
        .messaging
        .react(message_id, caller.user_id, &body.reaction)
        .await?;

    if let Ok(Some(msg)) = state.messaging.find(message_id).await {
        state
            .broadcast(ChatServerEvent::ReactionsUpdated {
                room_id: msg.room_id,
                message_id,
                reactions: reactions.clone(),
            })
            .await;
    }

    Ok(Json(reactions))
}

/// `DELETE /api/v1/messages/{id}/reactions`
pub async fn unreact(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(message_id): Path<MessageId>,
    ApiJson(body): ApiJson<ReactionRequest>,
) -> ApiResult<Json<Vec<ReactionSummary>>> {
    let reactions = state
        .messaging
        .unreact(message_id, caller.user_id, &body.reaction)
        .await?;

    if let Ok(Some(msg)) = state.messaging.find(message_id).await {
        state
            .broadcast(ChatServerEvent::ReactionsUpdated {
                room_id: msg.room_id,
                message_id,
                reactions: reactions.clone(),
            })
            .await;
    }

    Ok(Json(reactions))
}

// ────────────────────────────── pins ──────────────────────────────────

/// `PUT /api/v1/messages/{id}/pin`
///
/// `manage_room`, not authorship: a pin is the room saying "this matters",
/// which is a moderation call rather than one the author makes about their own
/// message.
pub async fn pin(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(message_id): Path<MessageId>,
) -> ApiResult<StatusCode> {
    state.messaging.pin(message_id, caller.user_id).await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::MessagePinned,
            format!("Message {} pinned", message_id),
        )
        .about("message", message_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/v1/messages/{id}/pin`
pub async fn unpin(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(message_id): Path<MessageId>,
) -> ApiResult<StatusCode> {
    state.messaging.unpin(message_id, caller.user_id).await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::MessageUnpinned,
            format!("Message {} unpinned", message_id),
        )
        .about("message", message_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/v1/rooms/{id}/pins`
pub async fn pins(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<Json<Vec<Message>>> {
    Ok(Json(state.messaging.pins(room_id, caller.user_id).await?))
}

// ───────────────────────────── search ─────────────────────────────────

/// `GET /api/v1/search/messages` query string.
#[derive(Debug, Deserialize)]
pub struct MessageSearch {
    /// What to look for. `websearch` syntax: quotes and `-` work as expected.
    pub q: String,
    /// Narrow to one room. Absent searches every room the caller is in.
    #[serde(default)]
    pub room_id: Option<RoomId>,
    #[serde(default)]
    pub limit: Option<i64>,
}

/// `GET /api/v1/search/messages`
///
/// Only ever searches rooms the caller participates in — the restriction is
/// part of the query rather than a filter over its results, so nothing is
/// found and then hidden.
pub async fn search(
    State(state): State<AppState>,
    caller: CurrentUser,
    Query(params): Query<MessageSearch>,
) -> ApiResult<Json<Vec<Message>>> {
    Ok(Json(
        state
            .messaging
            .search(caller.user_id, &params.q, params.room_id, params.limit)
            .await?,
    ))
}

// ─────────────────────── read state and muting ────────────────────────

/// `GET /api/v1/me/unread`
///
/// One call for the whole sidebar: a user in forty rooms would otherwise cost
/// forty round-trips on every page load.
pub async fn unread(
    State(state): State<AppState>,
    caller: CurrentUser,
) -> ApiResult<Json<Vec<genzh_room::RoomUnread>>> {
    Ok(Json(state.read_state.overview(caller.user_id).await?))
}

/// `POST /api/v1/rooms/{id}/read`
pub async fn mark_read(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<StatusCode> {
    state.read_state.mark_read(caller.user_id, room_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `PUT /api/v1/rooms/{id}/mute` body.
#[derive(Debug, Deserialize)]
pub struct MuteRequest {
    pub muted: bool,
}

/// `PUT /api/v1/rooms/{id}/mute`
///
/// Muting does not mark anything read: a muted room still knows what you have
/// not seen, it just stops asking for attention.
pub async fn set_muted(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
    ApiJson(body): ApiJson<MuteRequest>,
) -> ApiResult<StatusCode> {
    state
        .read_state
        .set_muted(caller.user_id, room_id, body.muted)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
