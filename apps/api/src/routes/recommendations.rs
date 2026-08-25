//! Suggestions: moments to join, people to add, communities to explore.
//!
//! Every route here is scoped to the caller by construction — [`CurrentUser`]
//! is an argument, and the viewer id is taken from it rather than from the
//! query string. That is the whole authorization story, and it is worth being
//! explicit about why it is enough: a recommendation is derived from who the
//! viewer knows and what they have blocked, so a `user_id` parameter would not
//! merely be a privacy leak, it would let anyone read anyone else's social
//! graph one suggestion at a time.

use axum::Json;
use axum::extract::{Query, State};
use genzh_recommend::{CommunityRecommendation, PersonRecommendation, RoomRecommendation};
use serde::{Deserialize, Serialize};

use crate::error::ApiResult;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// Shared query string for every surface.
#[derive(Debug, Deserialize)]
pub struct RecommendQuery {
    /// Narrows the room feed the way the home screen's chips do.
    #[serde(default)]
    pub category: Option<String>,
    /// Clamped server-side; see [`genzh_recommend::MAX_RESULTS`].
    #[serde(default)]
    pub limit: Option<i64>,
}

/// A ranked list, plus what the engine had to work with.
#[derive(Debug, Serialize)]
pub struct Recommendations<T> {
    pub items: Vec<T>,
    /// True when the viewer has no friends, communities or history, so the list
    /// is ranked on popularity alone.
    ///
    /// Sent so the client can say "popular right now" instead of "for you",
    /// which is the difference between a feed that looks generic and one that
    /// looks broken.
    pub personalized: bool,
}

/// `GET /api/v1/recommendations/rooms`
///
/// The home feed. Ranked by who from the viewer's world is already there,
/// falling back to what is busy and recent for an account with no history.
pub async fn rooms(
    State(state): State<AppState>,
    caller: CurrentUser,
    Query(query): Query<RecommendQuery>,
) -> ApiResult<Json<Recommendations<RoomRecommendation>>> {
    let items = state
        .recommend
        .rooms(caller.user_id, query.category.as_deref(), query.limit)
        .await?;

    Ok(Json(Recommendations {
        personalized: personalized(&state, caller).await,
        items,
    }))
}

/// `GET /api/v1/recommendations/people`
///
/// People the viewer plausibly knows. Never ranked by how many friends somebody
/// has — see [`genzh_recommend::PeopleRecommender::recommend`] for why.
pub async fn people(
    State(state): State<AppState>,
    caller: CurrentUser,
    Query(query): Query<RecommendQuery>,
) -> ApiResult<Json<Recommendations<PersonRecommendation>>> {
    let items = state.recommend.people(caller.user_id, query.limit).await?;

    Ok(Json(Recommendations {
        personalized: personalized(&state, caller).await,
        items,
    }))
}

/// `GET /api/v1/recommendations/communities`
pub async fn communities(
    State(state): State<AppState>,
    caller: CurrentUser,
    Query(query): Query<RecommendQuery>,
) -> ApiResult<Json<Recommendations<CommunityRecommendation>>> {
    let items = state
        .recommend
        .communities(caller.user_id, query.limit)
        .await?;

    Ok(Json(Recommendations {
        personalized: personalized(&state, caller).await,
        items,
    }))
}

/// Whether this viewer has anything to personalise on.
///
/// Swallows a failure into `false` rather than failing the request: the flag
/// only decides a heading, and returning a good list under a cautious label
/// beats returning an error because a count did not come back.
async fn personalized(state: &AppState, caller: CurrentUser) -> bool {
    match state.recommend.signals(caller.user_id).await {
        Ok(signals) => !signals.is_cold(),
        Err(error) => {
            tracing::warn!(%error, "could not read viewer signals for the personalised flag");
            false
        }
    }
}
