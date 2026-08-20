//! Rooms & Playground Moments.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use genzh_domain::room::{
    RoomAnonymousIdentity, RoomParticipant, RoomStatus, RoomType, RoomVisibility,
};
use genzh_domain::{CommunityId, Permission, Room, RoomId, UserId};
use serde::{Deserialize, Serialize};

use crate::error::ApiResult;
use crate::extract::ApiJson;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// `POST /api/v1/communities/{id}/rooms` or `POST /api/v1/rooms` body.
#[derive(Debug, Deserialize)]
pub struct CreateRoomRequest {
    /// Display name.
    pub name: String,
    /// What the room is for.
    pub room_type: RoomType,
    /// Topic line.
    #[serde(default)]
    pub topic: Option<String>,
    /// Category for discovery (e.g. "gaming", "debate", "tech", "confession", "random").
    #[serde(default)]
    pub category: Option<String>,
    /// Visibility (public, unlisted, friends_only, private).
    #[serde(default)]
    pub visibility: Option<RoomVisibility>,
    /// Whether user identities are anonymous.
    #[serde(default)]
    pub is_anonymous: Option<bool>,
    /// Duration in minutes before expiration (if temporary).
    #[serde(default)]
    pub duration_minutes: Option<i64>,
    /// Sort order.
    #[serde(default)]
    pub position: Option<i32>,
    /// Participant cap, media rooms only.
    #[serde(default)]
    pub max_participants: Option<i32>,
    /// Participant user IDs to add immediately.
    #[serde(default)]
    pub participant_ids: Option<Vec<UserId>>,
}

/// Query parameters for discovery.
#[derive(Debug, Deserialize)]
pub struct DiscoveryQuery {
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
}

/// Query parameters for random matchmaking.
#[derive(Debug, Deserialize)]
pub struct RandomRoomQuery {
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub room_type: Option<RoomType>,
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
    /// New category.
    #[serde(default)]
    pub category: Option<String>,
    /// New visibility.
    #[serde(default)]
    pub visibility: Option<RoomVisibility>,
    /// New status.
    #[serde(default)]
    pub status: Option<RoomStatus>,
    /// New position.
    #[serde(default)]
    pub position: Option<i32>,
    /// New participant cap.
    #[serde(default)]
    pub max_participants: Option<i32>,
}

/// A room with the caller's resolved permissions and optional anonymous identity.
#[derive(Debug, Serialize)]
pub struct RoomResponse {
    /// The room.
    #[serde(flatten)]
    pub room: Room,
    /// What the caller may do in this specific room, overrides applied.
    pub your_permissions: Vec<Permission>,
    /// Caller's anonymous identity for this room (if anonymous).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anonymous_identity: Option<RoomAnonymousIdentity>,
}

/// Discovery payload for playground home.
#[derive(Debug, Serialize)]
pub struct DiscoveryResponse {
    pub trending: Vec<Room>,
    pub live_now: Vec<Room>,
    pub categories: Vec<String>,
    pub rooms: Vec<Room>,
}

/// Join room response.
#[derive(Debug, Serialize)]
pub struct JoinRoomResponse {
    #[serde(flatten)]
    pub room: Room,
    pub your_permissions: Vec<Permission>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anonymous_identity: Option<RoomAnonymousIdentity>,
}

/// `POST /api/v1/communities/{id}/rooms`
pub async fn create_community_room(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
    ApiJson(body): ApiJson<CreateRoomRequest>,
) -> ApiResult<(StatusCode, Json<Room>)> {
    let room = state
        .rooms
        .create(
            Some(community_id),
            caller.user_id,
            genzh_room::CreateRoom {
                community_id: Some(community_id),
                name: body.name,
                topic: body.topic,
                category: body.category,
                room_type: body.room_type,
                visibility: body.visibility,
                is_anonymous: body.is_anonymous.unwrap_or(false),
                duration_minutes: body.duration_minutes,
                position: body.position,
                max_participants: body.max_participants,
                participant_ids: body.participant_ids,
            },
        )
        .await?;
    Ok((StatusCode::CREATED, Json(room)))
}

/// `POST /api/v1/rooms` (Create standalone playground room or DM)
pub async fn create_standalone_room(
    State(state): State<AppState>,
    caller: CurrentUser,
    ApiJson(body): ApiJson<CreateRoomRequest>,
) -> ApiResult<(StatusCode, Json<Room>)> {
    let room = state
        .rooms
        .create(
            None,
            caller.user_id,
            genzh_room::CreateRoom {
                community_id: None,
                name: body.name,
                topic: body.topic,
                category: body.category,
                room_type: body.room_type,
                visibility: body.visibility,
                is_anonymous: body.is_anonymous.unwrap_or(true), // default to anonymous playground
                duration_minutes: body.duration_minutes,
                position: body.position,
                max_participants: body.max_participants,
                participant_ids: body.participant_ids,
            },
        )
        .await?;
    Ok((StatusCode::CREATED, Json(room)))
}

/// `GET /api/v1/rooms/mine` (Caller's joined and direct conversation rooms)
pub async fn list_mine(
    State(state): State<AppState>,
    caller: CurrentUser,
) -> ApiResult<Json<Vec<Room>>> {
    let rooms = state.rooms.list_user_rooms(caller.user_id).await?;
    Ok(Json(rooms))
}

/// `POST /api/v1/rooms/dm/{target_user_id}` (Get or create shared direct message room)
pub async fn get_or_create_dm(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(target_user_id): Path<UserId>,
) -> ApiResult<(StatusCode, Json<Room>)> {
    let target_profile = state
        .auth
        .users()
        .find_profile(target_user_id)
        .await
        .ok()
        .flatten();

    let target_user = state
        .auth
        .users()
        .find_by_id(target_user_id)
        .await
        .ok()
        .flatten();

    let display_name = target_profile
        .as_ref()
        .map(|p| p.display_name.as_str())
        .unwrap_or("Friend");

    let handle = target_user
        .as_ref()
        .map(|u| u.handle.as_str())
        .unwrap_or("");

    let room = state
        .rooms
        .get_or_create_dm(caller.user_id, target_user_id, display_name, handle)
        .await?;

    Ok((StatusCode::OK, Json(room)))
}

/// `GET /api/v1/rooms/discovery`
pub async fn discovery(
    State(state): State<AppState>,
    _caller: CurrentUser,
    Query(query): Query<DiscoveryQuery>,
) -> ApiResult<Json<DiscoveryResponse>> {
    let limit = query.limit.unwrap_or(30).clamp(1, 100);
    let trending = state.rooms.list_trending(6).await?;
    let live_now = state.rooms.list_live(6).await?;
    let rooms = state.rooms.list_discovery(query.category.as_deref(), limit).await?;

    let categories = vec![
        "gaming".into(),
        "debate".into(),
        "tech".into(),
        "music".into(),
        "confession".into(),
        "random".into(),
        "art".into(),
        "memes".into(),
        "movies".into(),
    ];

    Ok(Json(DiscoveryResponse {
        trending,
        live_now,
        categories,
        rooms,
    }))
}

/// `GET /api/v1/rooms/trending`
pub async fn trending(
    State(state): State<AppState>,
    _caller: CurrentUser,
) -> ApiResult<Json<Vec<Room>>> {
    Ok(Json(state.rooms.list_trending(20).await?))
}

/// `GET /api/v1/rooms/live`
pub async fn live(
    State(state): State<AppState>,
    _caller: CurrentUser,
) -> ApiResult<Json<Vec<Room>>> {
    Ok(Json(state.rooms.list_live(20).await?))
}

/// `GET /api/v1/rooms/random`
pub async fn random_room(
    State(state): State<AppState>,
    _caller: CurrentUser,
    Query(query): Query<RandomRoomQuery>,
) -> ApiResult<Json<Option<Room>>> {
    Ok(Json(
        state
            .rooms
            .find_random(query.category.as_deref(), query.room_type)
            .await?,
    ))
}

/// `GET /api/v1/communities/{id}/rooms`
pub async fn list(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
) -> ApiResult<Json<Vec<Room>>> {
    Ok(Json(state.rooms.list(community_id, caller.user_id).await?))
}

/// `PATCH /api/v1/rooms/{id}/persona` body.
#[derive(Debug, Deserialize)]
pub struct SetPersonaRequest {
    pub is_anonymous: bool,
}

/// `GET /api/v1/rooms/{id}`
pub async fn get(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<Json<RoomResponse>> {
    let access = state.rooms.visible_access(room_id, caller.user_id).await?;
    let anonymous_identity = state
        .rooms
        .get_anonymous_identity(room_id, caller.user_id)
        .await
        .unwrap_or(None);

    Ok(Json(RoomResponse {
        room: access.room,
        your_permissions: access.permissions.to_permissions(),
        anonymous_identity,
    }))
}

/// `POST /api/v1/rooms/{id}/join`
pub async fn join(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<Json<JoinRoomResponse>> {
    let (room, _) = state.rooms.join(room_id, caller.user_id).await?;
    let access = state.rooms.visible_access(room_id, caller.user_id).await?;
    let anonymous_identity = state
        .rooms
        .get_anonymous_identity(room_id, caller.user_id)
        .await
        .unwrap_or(None);

    Ok(Json(JoinRoomResponse {
        room,
        your_permissions: access.permissions.to_permissions(),
        anonymous_identity,
    }))
}

/// `PATCH /api/v1/rooms/{id}/persona`
pub async fn set_persona(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
    ApiJson(body): ApiJson<SetPersonaRequest>,
) -> ApiResult<Json<RoomParticipant>> {
    let _ = state.rooms.visible_access(room_id, caller.user_id).await?;
    let participant = state
        .rooms
        .repository()
        .set_participant_persona(room_id, caller.user_id, body.is_anonymous)
        .await
        .map_err(genzh_infrastructure::ServiceError::from)?
        .ok_or_else(|| genzh_infrastructure::ServiceError::not_found("participant"))?;

    Ok(Json(participant))
}

/// `POST /api/v1/rooms/{id}/leave`
pub async fn leave(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<StatusCode> {
    state.rooms.leave(room_id, caller.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/v1/rooms/{id}/participants`
pub async fn participants(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<Json<Vec<RoomParticipant>>> {
    let _ = state.rooms.visible_access(room_id, caller.user_id).await?;
    Ok(Json(state.rooms.list_participants(room_id).await?))
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
            genzh_room::UpdateRoom {
                name: body.name,
                topic: body.topic,
                category: body.category,
                visibility: body.visibility,
                status: body.status,
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
