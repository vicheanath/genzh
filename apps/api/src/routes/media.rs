//! Media session handover.
//!
//! Two endpoints, and only the first one matters. `join` performs the whole
//! authorization chain and returns a signed token; from that point the client
//! talks to the media server directly and the API is out of the media path
//! entirely — no RTP, no SDP, no ICE ever traverses this process.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use genzh_domain::RoomId;
use genzh_room::MediaJoinResponse;

use crate::error::ApiResult;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// `POST /api/v1/rooms/{id}/media/join`
///
/// ```jsonc
/// {
///   "room_id": "…",
///   "participant_id": "…",
///   "media_url": "wss://media.example.com/ws/media",
///   "token": "eyJhbGciOiJIUzI1NiJ9…",
///   "expires_at": "2026-08-19T10:32:00Z",
///   "ice_servers": [ { "urls": ["stun:…"] } ]
/// }
/// ```
pub async fn join(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<Json<MediaJoinResponse>> {
    // The display name goes into the token so the media server can build
    // participant lists without ever reading the database.
    let user = state.auth.current_user(caller.user_id).await?;

    let response = state
        .media
        .join(room_id, caller.user_id, user.profile.display_name)
        .await?;

    Ok(Json(response))
}

/// `POST /api/v1/rooms/{id}/media/leave`
///
/// Advisory. The media server treats a closed WebSocket as the authoritative
/// departure signal, which is what makes a crashed client behave correctly.
pub async fn leave(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<StatusCode> {
    state.media.leave(room_id, caller.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
