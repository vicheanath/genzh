//! Rooms.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use social_domain::room::RoomType;
use social_domain::{CommunityId, Permission, Room, RoomId};

use crate::extract::ApiJson;
use crate::error::ApiResult;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// `POST /api/v1/communities/{id}/rooms` body.
#[derive(Debug, Deserialize)]
pub struct CreateRoomRequest {
    /// Display name.
    pub name: String,
    /// What the room is for.
    pub room_type: RoomType,
    /// Topic line.
    #[serde(default)]
    pub topic: Option<String>,
    /// Sort order.
    #[serde(default)]
    pub position: Option<i32>,
    /// Participant cap, media rooms only.
    #[serde(default)]
    pub max_participants: Option<i32>,
}

/// `PATCH /api/v1/rooms/{id}` body.
#[derive(Debug, Deserialize)]
pub struct UpdateRoomRequest {
    /// New name.
    #[serde(default)]
    pub name: Option<String>,
    /// New topic.
    #[serde(default)]
    pub topic: Option<String>,
    /// New position.
    #[serde(default)]
    pub position: Option<i32>,
    /// New participant cap.
    #[serde(default)]
    pub max_participants: Option<i32>,
}

/// A room with the caller's resolved permissions.
#[derive(Debug, Serialize)]
pub struct RoomResponse {
    /// The room.
    #[serde(flatten)]
    pub room: Room,
    /// What the caller may do in this specific room, overrides applied.
    pub your_permissions: Vec<Permission>,
}

/// `POST /api/v1/communities/{id}/rooms`
pub async fn create(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
    ApiJson(body): ApiJson<CreateRoomRequest>,
) -> ApiResult<(StatusCode, Json<Room>)> {
    let room = state
        .rooms
        .create(
            community_id,
            caller.user_id,
            social_room::CreateRoom {
                name: body.name,
                topic: body.topic,
                room_type: body.room_type,
                position: body.position,
                max_participants: body.max_participants,
            },
        )
        .await?;
    Ok((StatusCode::CREATED, Json(room)))
}

/// `GET /api/v1/communities/{id}/rooms`
pub async fn list(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
) -> ApiResult<Json<Vec<Room>>> {
    Ok(Json(state.rooms.list(community_id, caller.user_id).await?))
}

/// `GET /api/v1/rooms/{id}`
pub async fn get(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<Json<RoomResponse>> {
    let access = state.rooms.visible_access(room_id, caller.user_id).await?;
    Ok(Json(RoomResponse {
        room: access.room,
        your_permissions: access.permissions.to_permissions(),
    }))
}

/// `PATCH /api/v1/rooms/{id}`
pub async fn update(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
    ApiJson(body): ApiJson<UpdateRoomRequest>,
) -> ApiResult<Json<Room>> {
    let room = state
        .rooms
        .update(
            room_id,
            caller.user_id,
            social_room::UpdateRoom {
                name: body.name,
                topic: body.topic,
                position: body.position,
                max_participants: body.max_participants,
            },
        )
        .await?;
    Ok(Json(room))
}

/// `DELETE /api/v1/rooms/{id}`
pub async fn delete(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<StatusCode> {
    state.rooms.delete(room_id, caller.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
