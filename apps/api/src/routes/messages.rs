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
use crate::state::AppState;

/// `POST /api/v1/rooms/{id}/messages` body.
#[derive(Debug, Deserialize)]
pub struct PostMessageRequest {
    /// Message body.
    pub content: String,
    /// Whether this message should be sent anonymously.
    #[serde(default)]
    pub is_anonymous: Option<bool>,
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
        .history(room_id, caller.user_id, query.before, query.limit)
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
                .repository()
                .find_anonymous_identity(room_id, msg.author_id)
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
        .repository()
        .find_participant(room_id, caller.user_id)
        .await
        .unwrap_or(None);

    let is_anonymous = body.is_anonymous.unwrap_or_else(|| {
        participant
            .map(|p| p.is_anonymous)
            .unwrap_or(access.room.is_anonymous)
    });

    let message = state
        .messaging
        .post(room_id, caller.user_id, &body.content, is_anonymous)
        .await?;

    let anonymous_author = if is_anonymous {
        state
            .rooms
            .repository()
            .get_or_create_anonymous_identity(room_id, caller.user_id)
            .await
            .ok()
    } else {
        None
    };

    let _ = state.chat_tx.send(crate::routes::ws::ChatServerEvent::MessageCreated {
        room_id,
        message: message.clone(),
        reactions: Vec::new(),
        anonymous_author: anonymous_author.clone(),
    });

    // An anonymous message still notifies — being mentioned is the point — but
    // names no actor, so it cannot unmask who wrote it.
    let actor = (!is_anonymous).then_some(caller.user_id);
    crate::notify::notify_for_message(&state, &access.room, &message, actor).await;

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
            .repository()
            .find_anonymous_identity(updated.room_id, updated.author_id)
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

    let _ = state.chat_tx.send(crate::routes::ws::ChatServerEvent::MessageUpdated {
        room_id: updated.room_id,
        message: updated.clone(),
        reactions,
        anonymous_author,
    });

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
        .repository()
        .find(message_id)
        .await
        .map_err(genzh_infrastructure::ServiceError::from)?
        .ok_or_else(|| genzh_infrastructure::ServiceError::not_found("message"))?;

    state.messaging.delete(message_id, caller.user_id).await?;

    let _ = state.chat_tx.send(crate::routes::ws::ChatServerEvent::MessageDeleted {
        room_id: msg.room_id,
        message_id,
    });

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

    if let Ok(Some(msg)) = state.messaging.repository().find(message_id).await {
        let _ = state.chat_tx.send(crate::routes::ws::ChatServerEvent::ReactionsUpdated {
            room_id: msg.room_id,
            message_id,
            reactions: reactions.clone(),
        });
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

    if let Ok(Some(msg)) = state.messaging.repository().find(message_id).await {
        let _ = state.chat_tx.send(crate::routes::ws::ChatServerEvent::ReactionsUpdated {
            room_id: msg.room_id,
            message_id,
            reactions: reactions.clone(),
        });
    }

    Ok(Json(reactions))
}
