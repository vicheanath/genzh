//! Media session handover.
//!
//! Two endpoints, and only the first one matters. `join` performs the whole
//! authorization chain and returns a signed LiveKit access token; from that
//! point the client talks to LiveKit directly and the API is out of the media
//! path entirely — no RTP, no SDP, no ICE ever traverses this process.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use genzh_domain::RoomId;
use genzh_infrastructure::ServiceError;
use genzh_room::MediaJoinResponse;
use serde::Deserialize;

use crate::error::ApiResult;
use crate::extract::ApiJson;
use crate::middleware::CurrentUser;
use crate::routes::ws::{CallEndReason, ChatServerEvent};
use crate::state::AppState;

/// `POST /api/v1/rooms/{id}/media/join`
///
/// ```jsonc
/// {
///   "room_id": "…",
///   "participant_id": "…",
///   "media_url": "wss://livekit.example.com",
///   "token": "eyJhbGciOiJIUzI1NiJ9…",
///   "expires_at": "2026-08-19T10:32:00Z"
/// }
/// ```
pub async fn join(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<Json<MediaJoinResponse>> {
    // The display name goes into the token so LiveKit can build participant
    // lists without ever reading the database.
    let user = state.auth.current_user(caller.user_id).await?;

    let response = state
        .media
        .join(room_id, caller.user_id, user.profile.display_name)
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::MediaSessionJoined,
            format!("User joined media session in room {}", room_id),
        )
        .about("room", room_id.as_uuid()),
    ).await;

    Ok(Json(response))
}

/// `POST /api/v1/rooms/{id}/media/leave`
///
/// Advisory. LiveKit treats a closed connection as the authoritative
/// departure signal, which is what makes a crashed client behave correctly.
pub async fn leave(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
) -> ApiResult<StatusCode> {
    state.media.leave(room_id, caller.user_id).await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::MediaSessionLeft,
            format!("User left media session in room {}", room_id),
        )
        .about("room", room_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/v1/rooms/{id}/call/ring` body.
#[derive(Debug, Default, Deserialize)]
pub struct RingRequest {
    /// True when the caller is starting with their camera on.
    #[serde(default)]
    pub video: bool,
}

/// `POST /api/v1/rooms/{id}/call/end` body.
#[derive(Debug, Deserialize)]
pub struct EndCallRequest {
    /// Which side stopped it, and how.
    pub reason: CallEndReason,
}

/// `POST /api/v1/rooms/{id}/call/ring`
///
/// Tell the other person in a direct conversation that they are being called.
///
/// Purely a notice: no token is minted here, and the caller has already joined
/// the room's media session by the time this fires. Authorization still runs in
/// full, so a blocked caller cannot use the ring as a channel to reach someone
/// who has shut them out.
pub async fn ring(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
    ApiJson(body): ApiJson<RingRequest>,
) -> ApiResult<StatusCode> {
    let peer = direct_peer(&state, room_id, caller).await?;
    let user = state.auth.current_user(caller.user_id).await?;

    state
        .broadcast(ChatServerEvent::CallRinging {
            user_id: peer,
            room_id,
            from_user_id: caller.user_id,
            from_display_name: user.profile.display_name,
            video: body.video,
        })
        .await;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CallStarted,
            format!("Call started in room {}", room_id),
        )
        .about("room", room_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/v1/rooms/{id}/call/end`
///
/// Stop a call that has not connected — a hang-up before the answer, or a
/// decline. Either side may send it; it is delivered to the other one.
pub async fn end_call(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(room_id): Path<RoomId>,
    ApiJson(body): ApiJson<EndCallRequest>,
) -> ApiResult<StatusCode> {
    let peer = direct_peer(&state, room_id, caller).await?;

    state
        .broadcast(ChatServerEvent::CallEnded {
            user_id: peer,
            room_id,
            from_user_id: caller.user_id,
            reason: body.reason,
        })
        .await;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CallEnded,
            format!("Call ended in room {}", room_id),
        )
        .about("room", room_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// Resolve who a caller is talking to, refusing anything that is not a direct
/// conversation the caller can currently see.
///
/// Going through `visible_access` rather than a bare lookup is what makes a
/// block bite here too: the room stops being visible from either side, so the
/// peer is never resolved and no event is published.
async fn direct_peer(
    state: &AppState,
    room_id: RoomId,
    caller: CurrentUser,
) -> Result<genzh_domain::UserId, ServiceError> {
    let access = state.rooms.visible_access(room_id, caller.user_id).await?;
    if !access.room.is_direct() {
        return Err(ServiceError::Domain(genzh_domain::DomainError::invalid(
            "room",
            "only a direct conversation can be called",
        )));
    }

    state
        .directs
        .peer(room_id, caller.user_id)
        .await?
        .ok_or_else(|| ServiceError::not_found("call recipient"))
}
