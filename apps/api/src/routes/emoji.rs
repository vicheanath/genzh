//! Custom emoji.
//!
//! Two ways in, because there are two questions. A community's settings screen
//! asks "what does this community have, and let me change it"; a chat client
//! asks "what may I draw in *this room*", which it can answer without knowing
//! which community the room belongs to.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use genzh_community::CreateEmoji;
use genzh_domain::emoji::CustomEmoji;
use genzh_domain::{CommunityId, EmojiId, RoomId};
use serde::Deserialize;

use crate::error::ApiResult;
use crate::extract::ApiJson;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// `POST /api/v1/communities/{id}/emojis` body.
#[derive(Debug, Deserialize)]
pub struct CreateEmojiRequest {
    /// The shortcode. Colons optional — `blob` and `:blob:` are the same name.
    pub name: String,
    /// Where the artwork lives. Must be `https://`.
    pub image_url: String,
    /// Whether the artwork animates.
    #[serde(default)]
    pub is_animated: bool,
}

/// `PATCH /api/v1/communities/{id}/emojis/{emoji_id}` body.
#[derive(Debug, Deserialize)]
pub struct RenameEmojiRequest {
    /// The new shortcode.
    pub name: String,
}

/// `GET /api/v1/communities/{id}/emojis`
pub async fn list(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
) -> ApiResult<Json<Vec<CustomEmoji>>> {
    Ok(Json(state.emojis.list(community_id, caller.user_id).await?))
}

/// `GET /api/v1/rooms/{id}/emojis`
///
/// What a chat client calls when it opens a room.
///
/// A room outside any community — a direct conversation, an ephemeral
/// playground — has no emoji set, and answers with an empty list rather than a
/// 404. "This room has none" is not an error, and making the client special-case
/// a status code for it would mean every DM logs a failure on open.
pub async fn list_for_room(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<Json<Vec<CustomEmoji>>> {
    // Room visibility is the authorization: someone who can see the room can
    // see what may be drawn in it.
    let access = state.rooms.visible_access(room_id, caller.user_id).await?;

    let Some(community_id) = access.room.community_id else {
        return Ok(Json(Vec::new()));
    };

    Ok(Json(state.emojis.list(community_id, caller.user_id).await?))
}

/// `POST /api/v1/communities/{id}/emojis`
pub async fn create(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
    ApiJson(request): ApiJson<CreateEmojiRequest>,
) -> ApiResult<(StatusCode, Json<CustomEmoji>)> {
    let created = state
        .emojis
        .create(
            community_id,
            caller.user_id,
            CreateEmoji {
                name: request.name,
                image_url: request.image_url,
                is_animated: request.is_animated,
            },
        )
        .await?;

    state
        .audit
        .record_best_effort(
            genzh_admin::AuditRecord::new(
                Some(caller.user_id),
                genzh_domain::audit::AuditAction::CommunityUpdated,
                format!("Added custom emoji :{}: to community", created.name),
            )
            .about("community", community_id.as_uuid()),
        )
        .await;

    Ok((StatusCode::CREATED, Json(created)))
}

/// `PATCH /api/v1/communities/{id}/emojis/{emoji_id}`
pub async fn rename(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path((community_id, emoji_id)): Path<(CommunityId, EmojiId)>,
    ApiJson(request): ApiJson<RenameEmojiRequest>,
) -> ApiResult<Json<CustomEmoji>> {
    Ok(Json(
        state
            .emojis
            .rename(community_id, emoji_id, caller.user_id, &request.name)
            .await?,
    ))
}

/// `DELETE /api/v1/communities/{id}/emojis/{emoji_id}`
pub async fn delete(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path((community_id, emoji_id)): Path<(CommunityId, EmojiId)>,
) -> ApiResult<StatusCode> {
    state
        .emojis
        .delete(community_id, emoji_id, caller.user_id)
        .await?;

    state
        .audit
        .record_best_effort(
            genzh_admin::AuditRecord::new(
                Some(caller.user_id),
                genzh_domain::audit::AuditAction::CommunityUpdated,
                "Removed a custom emoji from community".to_owned(),
            )
            .about("community", community_id.as_uuid()),
        )
        .await;

    Ok(StatusCode::NO_CONTENT)
}
