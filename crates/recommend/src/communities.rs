//! Communities to explore.
//!
//! The densest signal in the product — 305 memberships across 237 communities —
//! and the most classical case for item-to-item collaborative filtering: the
//! communities your co-members also belong to.

use genzh_domain::UserId;
use genzh_infrastructure::{DbPool, RepositoryError, RepositoryResult};
use serde::Serialize;
use uuid::Uuid;

use crate::score::{Reason, ReasonKind, Scorer, Weights, rank};
use crate::signals::ViewerSignals;
use crate::{MAX_REASONS, MAX_RESULTS};

/// Counts for one candidate community.
#[derive(Debug, sqlx::FromRow)]
struct CommunityCandidate {
    id: Uuid,
    name: String,
    description: Option<String>,
    icon_url: Option<String>,
    member_count: i64,
    /// Members here who are also in one of the viewer's communities.
    overlap: i64,
    /// Friends of the viewer who are members.
    friends: i64,
}

/// A community to suggest, with why.
#[derive(Debug, Clone, Serialize)]
pub struct CommunityRecommendation {
    pub community_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub icon_url: Option<String>,
    pub member_count: i64,
    pub score: f64,
    pub reasons: Vec<Reason>,
}

const OVERLAP_HALF: f64 = 3.0;
const FRIENDS_HALF: f64 = 1.0;
const SIZE_HALF: f64 = 25.0;

/// Suggests communities.
#[derive(Debug, Clone)]
pub struct CommunityRecommender {
    pool: DbPool,
    weights: Weights,
}

impl CommunityRecommender {
    pub fn new(pool: DbPool) -> Self {
        Self {
            pool,
            weights: Weights::default(),
        }
    }

    /// Communities this viewer might want, best first.
    ///
    /// Size *is* a term here, unlike the people surface. Joining a community is
    /// a low-risk act and an empty one is a bad experience regardless of fit, so
    /// a popularity prior is doing honest work — and it is what a viewer with no
    /// memberships at all gets ranked by.
    pub async fn recommend(
        &self,
        viewer: UserId,
        signals: &ViewerSignals,
        limit: i64,
    ) -> RepositoryResult<Vec<CommunityRecommendation>> {
        let limit = limit.clamp(1, MAX_RESULTS);

        let candidates = self
            .candidates(viewer, signals, (limit * 4).min(200))
            .await?;

        let mut scored: Vec<crate::score::Scored<CommunityCandidate>> = candidates
            .into_iter()
            .map(|candidate| {
                let mut scorer = Scorer::new(self.weights);

                scorer.count(
                    ReasonKind::SharedCommunity,
                    u32::try_from(candidate.overlap).unwrap_or(u32::MAX),
                    OVERLAP_HALF,
                );
                scorer.count(
                    ReasonKind::FriendActivity,
                    u32::try_from(candidate.friends).unwrap_or(u32::MAX),
                    FRIENDS_HALF,
                );
                scorer.count(
                    ReasonKind::Popularity,
                    u32::try_from(candidate.member_count).unwrap_or(u32::MAX),
                    SIZE_HALF,
                );

                scorer.finish(candidate, MAX_REASONS)
            })
            .collect();

        rank(&mut scored, |candidate| candidate.id);
        scored.truncate(limit as usize);

        Ok(scored
            .into_iter()
            .map(|entry| CommunityRecommendation {
                community_id: entry.item.id,
                name: entry.item.name,
                description: entry.item.description,
                icon_url: entry.item.icon_url,
                member_count: entry.item.member_count,
                score: entry.score,
                reasons: entry.reasons,
            })
            .collect())
    }

    async fn candidates(
        &self,
        viewer: UserId,
        signals: &ViewerSignals,
        limit: i64,
    ) -> RepositoryResult<Vec<CommunityCandidate>> {
        sqlx::query_as::<_, CommunityCandidate>(
            "WITH peers AS (
                 -- Everyone who shares a community with the viewer. This is the
                 -- neighbourhood the recommendation is drawn from; blocked
                 -- accounts are dropped so somebody the viewer blocked cannot
                 -- be the reason a community is suggested.
                 SELECT DISTINCT m.user_id
                   FROM community_members m
                  WHERE m.community_id = ANY($2)
                    AND m.user_id <> $1
                    AND m.user_id <> ALL($3)
             )
             SELECT c.id,
                    c.name,
                    c.description,
                    c.icon_url,
                    COALESCE(size.total, 0)    AS member_count,
                    COALESCE(shared.total, 0)  AS overlap,
                    COALESCE(friend.total, 0)  AS friends
               FROM communities c
               LEFT JOIN LATERAL (
                     SELECT COUNT(*) AS total
                       FROM community_members m WHERE m.community_id = c.id
                   ) size ON TRUE
               LEFT JOIN LATERAL (
                     SELECT COUNT(DISTINCT m.user_id) AS total
                       FROM community_members m
                       JOIN peers p ON p.user_id = m.user_id
                      WHERE m.community_id = c.id
                   ) shared ON TRUE
               LEFT JOIN LATERAL (
                     SELECT COUNT(DISTINCT m.user_id) AS total
                       FROM community_members m
                      WHERE m.community_id = c.id AND m.user_id = ANY($4)
                   ) friend ON TRUE
              WHERE c.is_quarantined = FALSE
                -- Not somewhere they already are.
                AND c.id <> ALL($2)
              ORDER BY COALESCE(shared.total, 0) DESC,
                       COALESCE(size.total, 0) DESC,
                       c.id
              LIMIT $5",
        )
        .bind(viewer)
        .bind(signals.community_vec())
        .bind(signals.excluded_vec())
        .bind(signals.friend_vec())
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }
}
