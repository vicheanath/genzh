//! Reading who is online.
//!
//! The WebSocket carries *changes*; this carries the starting point. A screen
//! that only listened for `presence_changed` would show everyone offline until
//! they happened to reconnect, so every list fetches the current state once and
//! then applies deltas.

use axum::extract::{Query, State};
use axum::Json;
use genzh_domain::UserId;
use serde::{Deserialize, Serialize};

use crate::error::ApiResult;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// Query for [`online`].
#[derive(Debug, Deserialize)]
pub struct PresenceQuery {
    /// Comma-separated user ids to ask about. Absent means "everyone online".
    #[serde(default)]
    pub ids: Option<String>,
}

/// Response for [`online`].
#[derive(Debug, Serialize)]
pub struct PresenceResponse {
    /// The subset of the requested users who are online right now.
    pub online: Vec<UserId>,
}

/// `GET /api/v1/presence?ids=a,b,c`
///
/// Answers only about the ids asked for. Omitting `ids` returns everyone
/// currently connected, which is what the friends list wants — it has no id
/// list of its own until the friendships have loaded.
pub async fn online(
    State(state): State<AppState>,
    _caller: CurrentUser,
    Query(query): Query<PresenceQuery>,
) -> ApiResult<Json<PresenceResponse>> {
    let online = match query.ids.as_deref() {
        Some(raw) => {
            // Unparseable ids are dropped rather than rejected: a caller
            // batching a member list should not lose the whole answer to one
            // malformed entry.
            let ids: Vec<UserId> = raw
                .split(',')
                .filter_map(|id| id.trim().parse::<uuid::Uuid>().ok())
                .map(UserId)
                .collect();
            state.presence.online_among(&ids).await
        }
        None => state.presence.online().await,
    }
    // Unlike the fan-out paths, this *is* the answer the caller asked for.
    // Returning an empty list on failure would be indistinguishable from
    // "nobody is online", and a client would render everyone offline and
    // believe it — so a store that cannot answer says so.
    ?;

    Ok(Json(PresenceResponse { online }))
}
