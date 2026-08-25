//! People to add.
//!
//! The sparsest surface and the one where a recommender earns the most: the
//! friend graph has few edges, and an empty "people you may know" list is the
//! thing that keeps it that way.

use genzh_domain::UserId;
use genzh_infrastructure::{DbPool, RepositoryError, RepositoryResult};
use serde::Serialize;
use uuid::Uuid;

use crate::score::{Reason, ReasonKind, Scorer, Weights, rank};
use crate::signals::ViewerSignals;
use crate::{MAX_REASONS, MAX_RESULTS};

/// Counts for one candidate person.
#[derive(Debug, sqlx::FromRow)]
struct PersonCandidate {
    id: Uuid,
    handle: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
    /// Friends the viewer and this person have in common.
    mutual_friends: i64,
    /// Communities both belong to.
    shared_communities: i64,
    /// Rooms both have posted in.
    shared_rooms: i64,
}

/// Somebody to suggest, with why.
#[derive(Debug, Clone, Serialize)]
pub struct PersonRecommendation {
    pub user_id: Uuid,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub score: f64,
    pub reasons: Vec<Reason>,
}

const MUTUALS_HALF: f64 = 2.0;
const COMMUNITIES_HALF: f64 = 1.5;
const ROOMS_HALF: f64 = 2.0;

/// Suggests people.
#[derive(Debug, Clone)]
pub struct PeopleRecommender {
    pool: DbPool,
    weights: Weights,
}

impl PeopleRecommender {
    pub fn new(pool: DbPool) -> Self {
        Self {
            pool,
            weights: Weights::default(),
        }
    }

    /// People this viewer might know, best first.
    ///
    /// Unlike the room feed there is **no popularity term**. Ranking people by
    /// how many friends they have would push the same few accounts at everyone
    /// and make the suggestion say nothing about the viewer — and being widely
    /// added is not evidence that *you* know somebody. A candidate with no
    /// connection to the viewer is therefore not weakly ranked, it is not a
    /// candidate: the query requires at least one shared edge.
    pub async fn recommend(
        &self,
        viewer: UserId,
        signals: &ViewerSignals,
        limit: i64,
    ) -> RepositoryResult<Vec<PersonRecommendation>> {
        let limit = limit.clamp(1, MAX_RESULTS);

        let candidates = self
            .candidates(viewer, signals, (limit * 4).min(200))
            .await?;

        let mut scored: Vec<crate::score::Scored<PersonCandidate>> = candidates
            .into_iter()
            .map(|candidate| {
                let mut scorer = Scorer::new(self.weights);

                scorer.count(
                    ReasonKind::MutualFriends,
                    u32::try_from(candidate.mutual_friends).unwrap_or(u32::MAX),
                    MUTUALS_HALF,
                );
                scorer.count(
                    ReasonKind::SharedCommunity,
                    u32::try_from(candidate.shared_communities).unwrap_or(u32::MAX),
                    COMMUNITIES_HALF,
                );
                scorer.count(
                    ReasonKind::Activity,
                    u32::try_from(candidate.shared_rooms).unwrap_or(u32::MAX),
                    ROOMS_HALF,
                );

                scorer.finish(candidate, MAX_REASONS)
            })
            .collect();

        rank(&mut scored, |candidate| candidate.id);
        scored.truncate(limit as usize);

        Ok(scored
            .into_iter()
            .map(|entry| PersonRecommendation {
                user_id: entry.item.id,
                handle: entry.item.handle,
                display_name: entry.item.display_name,
                avatar_url: entry.item.avatar_url,
                score: entry.score,
                reasons: entry.reasons,
            })
            .collect())
    }

    /// Candidates and their overlap counts.
    ///
    /// Everyone already connected to the viewer is excluded — friends, and
    /// requests pending in either direction. Suggesting somebody whose request
    /// is already sitting in the viewer's inbox is the kind of thing that makes
    /// a feature feel broken even though every row is correct.
    async fn candidates(
        &self,
        viewer: UserId,
        signals: &ViewerSignals,
        limit: i64,
    ) -> RepositoryResult<Vec<PersonCandidate>> {
        sqlx::query_as::<_, PersonCandidate>(
            "WITH viewer_friends AS (
                 SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
                   FROM friendships
                  WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)
             ),
             -- Any existing edge at all, not just accepted ones.
             connected AS (
                 SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
                   FROM friendships
                  WHERE requester_id = $1 OR addressee_id = $1
             ),
             viewer_rooms AS (
                 SELECT DISTINCT room_id FROM messages WHERE author_id = $1
             ),
             candidate AS (
                 -- Friends of friends.
                 SELECT CASE WHEN f.requester_id = vf.id THEN f.addressee_id ELSE f.requester_id END AS id
                   FROM friendships f
                   JOIN viewer_friends vf
                     ON vf.id IN (f.requester_id, f.addressee_id)
                  WHERE f.status = 'accepted'
                 UNION
                 -- People in the viewer's communities.
                 SELECT m.user_id FROM community_members m WHERE m.community_id = ANY($2)
                 UNION
                 -- People who have talked in the same rooms.
                 SELECT msg.author_id
                   FROM messages msg
                   JOIN viewer_rooms vr ON vr.room_id = msg.room_id
                  WHERE msg.is_anonymous = FALSE
             )
             SELECT u.id,
                    u.handle,
                    p.display_name,
                    p.avatar_url,
                    COALESCE(mutual.total, 0)    AS mutual_friends,
                    COALESCE(community.total, 0) AS shared_communities,
                    COALESCE(room.total, 0)      AS shared_rooms
               FROM candidate c
               JOIN users u ON u.id = c.id
               LEFT JOIN profiles p ON p.user_id = u.id
               LEFT JOIN LATERAL (
                     SELECT COUNT(DISTINCT vf.id) AS total
                       FROM viewer_friends vf
                       JOIN friendships f
                         ON f.status = 'accepted'
                        AND vf.id IN (f.requester_id, f.addressee_id)
                        AND c.id IN (f.requester_id, f.addressee_id)
                   ) mutual ON TRUE
               LEFT JOIN LATERAL (
                     SELECT COUNT(*) AS total
                       FROM community_members m
                      WHERE m.user_id = c.id AND m.community_id = ANY($2)
                   ) community ON TRUE
               LEFT JOIN LATERAL (
                     SELECT COUNT(DISTINCT msg.room_id) AS total
                       FROM messages msg
                       JOIN viewer_rooms vr ON vr.room_id = msg.room_id
                      WHERE msg.author_id = c.id AND msg.is_anonymous = FALSE
                   ) room ON TRUE
              WHERE u.is_active = TRUE
                AND c.id <> $1
                AND c.id <> ALL($3)
                AND c.id NOT IN (SELECT id FROM connected)
                -- No shared edge, no suggestion. See `recommend`.
                AND (COALESCE(mutual.total, 0)
                   + COALESCE(community.total, 0)
                   + COALESCE(room.total, 0)) > 0
              ORDER BY (COALESCE(mutual.total, 0) * 3
                      + COALESCE(community.total, 0) * 2
                      + COALESCE(room.total, 0)) DESC,
                       u.id
              LIMIT $4",
        )
        .bind(viewer)
        .bind(signals.community_vec())
        .bind(signals.excluded_vec())
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }
}
