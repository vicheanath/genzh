//! Moments to join.
//!
//! The home feed. Everything else in this crate is secondary to getting this
//! one right, because it is the screen the product opens on.

use chrono::Utc;
use genzh_domain::room::Room;
use genzh_domain::{Timestamp, UserId};
use genzh_infrastructure::{DbPool, RepositoryError, RepositoryResult};
use serde::Serialize;
use uuid::Uuid;

use crate::score::{Reason, ReasonKind, Scorer, Weights, decay, rank};
use crate::signals::ViewerSignals;
use crate::{DEFAULT_RESULTS, MAX_REASONS, MAX_RESULTS};

/// Counts for one candidate room, as the database produced them.
#[derive(Debug, sqlx::FromRow)]
struct RoomCandidate {
    id: Uuid,
    category: Option<String>,
    current_participants: i32,
    started_at: Option<Timestamp>,
    /// Distinct people in this room who share a community with the viewer.
    peers: i64,
    /// Distinct friends of the viewer in this room.
    friends: i64,
    /// Messages in the last day — activity, not size.
    recent_messages: i64,
}

/// A room to suggest, with why.
#[derive(Debug, Clone, Serialize)]
pub struct RoomRecommendation {
    #[serde(flatten)]
    pub room: Room,
    pub score: f64,
    pub reasons: Vec<Reason>,
}

/// How many of a signal counts as "a lot", for [`crate::score::saturate`].
///
/// Tuned to this product's scale rather than borrowed. Two people you share a
/// community with is already meaningful in a room that holds a handful; two
/// would be nothing in a thousand-person server.
const PEERS_HALF: f64 = 2.0;
const FRIENDS_HALF: f64 = 1.0;
const ACTIVITY_HALF: f64 = 12.0;
const OCCUPANCY_HALF: f64 = 4.0;

/// A room stops feeling like "right now" after about this long.
const FRESHNESS_HALF_LIFE_HOURS: f64 = 6.0;

/// Suggests rooms.
#[derive(Debug, Clone)]
pub struct RoomRecommender {
    pool: DbPool,
    weights: Weights,
}

impl RoomRecommender {
    pub fn new(pool: DbPool) -> Self {
        Self {
            pool,
            weights: Weights::default(),
        }
    }

    /// Override the ranking policy — for tuning, and for the admin explain view.
    pub fn with_weights(mut self, weights: Weights) -> Self {
        Self {
            pool: self.pool.clone(),
            weights: {
                self.weights = weights;
                self.weights
            },
        }
    }

    /// Rooms this viewer might want, best first.
    ///
    /// `category` narrows the candidate set the way the home screen's filter
    /// chips do; `None` means all of them.
    pub async fn recommend(
        &self,
        viewer: UserId,
        signals: &ViewerSignals,
        category: Option<&str>,
        limit: i64,
    ) -> RepositoryResult<Vec<RoomRecommendation>> {
        let limit = limit.clamp(1, MAX_RESULTS);

        // Over-fetch candidates so ranking has something to choose between:
        // taking exactly `limit` from the database would mean the *database's*
        // ordering decided the feed and the scorer only shuffled it.
        let candidate_pool = (limit * 6).min(300);

        let candidates = self
            .candidates(viewer, signals, category, candidate_pool)
            .await?;

        let mut scored: Vec<crate::score::Scored<Uuid>> = candidates
            .iter()
            .map(|candidate| self.score(candidate, signals))
            .collect();

        rank(&mut scored, |id| *id);
        scored.truncate(limit as usize);

        // Fetch the full rows only for what survived. Selecting every room
        // column for three hundred candidates to show twelve is most of the
        // cost of the request for none of the benefit.
        self.hydrate(scored).await
    }

    /// Score one candidate. Pure, given the counts — see [`crate::score`].
    fn score(
        &self,
        candidate: &RoomCandidate,
        signals: &ViewerSignals,
    ) -> crate::score::Scored<Uuid> {
        let mut scorer = Scorer::new(self.weights);

        scorer.count(
            ReasonKind::SharedCommunity,
            u32::try_from(candidate.peers).unwrap_or(u32::MAX),
            PEERS_HALF,
        );
        scorer.count(
            ReasonKind::FriendActivity,
            u32::try_from(candidate.friends).unwrap_or(u32::MAX),
            FRIENDS_HALF,
        );
        scorer.count(
            ReasonKind::Activity,
            u32::try_from(candidate.recent_messages).unwrap_or(u32::MAX),
            ACTIVITY_HALF,
        );
        scorer.count(
            ReasonKind::Popularity,
            u32::try_from(candidate.current_participants.max(0)).unwrap_or(u32::MAX),
            OCCUPANCY_HALF,
        );

        if let Some(category) = &candidate.category {
            let share = signals.affinity.share(category);
            if share > 0.0 {
                scorer.ratio(
                    ReasonKind::CategoryAffinity,
                    signals.affinity.observations(),
                    share,
                );
            }
        }

        if let Some(started_at) = candidate.started_at {
            let age_hours = (Utc::now() - started_at).num_seconds() as f64 / 3600.0;
            scorer.ratio(
                ReasonKind::Freshness,
                1,
                decay(age_hours, FRESHNESS_HALF_LIFE_HOURS),
            );
        }

        scorer.finish(candidate.id, MAX_REASONS)
    }

    /// Candidate rooms and every count needed to rank them, in one query.
    ///
    /// The `WHERE` clause is the safety boundary, not the ranking: a room the
    /// viewer may not see is absent here rather than scored low, because a
    /// weight can be retuned to zero by accident and a filter cannot.
    async fn candidates(
        &self,
        viewer: UserId,
        signals: &ViewerSignals,
        category: Option<&str>,
        limit: i64,
    ) -> RepositoryResult<Vec<RoomCandidate>> {
        let communities = signals.community_vec();
        let friends = signals.friend_vec();
        let known: Vec<Uuid> = signals.known_rooms.iter().copied().collect();

        sqlx::query_as::<_, RoomCandidate>(
            "WITH candidate AS (
                 SELECT r.id, r.category, r.current_participants, r.started_at
                   FROM rooms r
                  WHERE r.status = 'active'
                    AND r.visibility = 'public'
                    -- Playground rooms only, the same scope discovery and the
                    -- feed use. A community's channel is not somewhere to be
                    -- *sent*: you reach it by belonging to the community, and
                    -- suggesting one on the playground side of the app offers a
                    -- place to stay where the whole promise is places to leave.
                    --
                    -- This is also why there is no join to `communities` here
                    -- any more: the quarantine rule it enforced only ever
                    -- applied to rooms that had a community, and none of these
                    -- do.
                    AND r.community_id IS NULL
                    -- A DM is a conversation, not a place to be sent.
                    AND r.category <> 'dm'
                    -- An expired room is over even before the reaper notices.
                    AND (r.expires_at IS NULL OR r.expires_at > now())
                    -- Never suggest somewhere they already are.
                    AND r.id <> ALL($2)
                    -- Nor a room they own. Ownership does not create a
                    -- participant row, so without this the one place somebody
                    -- is guaranteed to already know about is also the one the
                    -- feed is most likely to hand back to them.
                    AND (r.owner_id IS NULL OR r.owner_id <> $1)
                    AND ($3::text IS NULL OR r.category = $3)
                  ORDER BY r.current_participants DESC, r.started_at DESC NULLS LAST
                  LIMIT $6
             )
             SELECT c.id,
                    c.category,
                    c.current_participants,
                    c.started_at,
                    COALESCE(peer.total, 0)     AS peers,
                    COALESCE(friend.total, 0)   AS friends,
                    COALESCE(activity.total, 0) AS recent_messages
               FROM candidate c
               -- People in this room who share a community with the viewer.
               -- Blocked accounts are excluded from the count as well as from
               -- the results: somebody the viewer blocked must not become the
               -- reason a room is recommended to them.
               LEFT JOIN LATERAL (
                     SELECT COUNT(DISTINCT p.user_id) AS total
                       FROM room_participants p
                       JOIN community_members m ON m.user_id = p.user_id
                      WHERE p.room_id = c.id
                        AND m.community_id = ANY($4)
                        AND p.user_id <> $1
                        AND p.user_id <> ALL($5)
                   ) peer ON TRUE
               LEFT JOIN LATERAL (
                     SELECT COUNT(DISTINCT p.user_id) AS total
                       FROM room_participants p
                      WHERE p.room_id = c.id
                        AND p.user_id = ANY($7)
                   ) friend ON TRUE
               LEFT JOIN LATERAL (
                     SELECT COUNT(*) AS total
                       FROM messages msg
                      WHERE msg.room_id = c.id
                        AND msg.created_at > now() - INTERVAL '24 hours'
                   ) activity ON TRUE",
        )
        .bind(viewer)
        .bind(&known)
        .bind(category)
        .bind(&communities)
        .bind(signals.excluded_vec())
        .bind(limit)
        .bind(&friends)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Load the full room rows for the winners, preserving the ranked order.
    async fn hydrate(
        &self,
        scored: Vec<crate::score::Scored<Uuid>>,
    ) -> RepositoryResult<Vec<RoomRecommendation>> {
        if scored.is_empty() {
            return Ok(Vec::new());
        }

        let ids: Vec<Uuid> = scored.iter().map(|s| s.item).collect();

        let rooms: Vec<Room> = sqlx::query_as(
            "SELECT id, community_id, name, topic, room_type, owner_id, category,
                    visibility, status, is_anonymous, position, max_participants,
                    current_participants, started_at, expires_at, ended_at,
                    created_at, updated_at
               FROM rooms WHERE id = ANY($1)",
        )
        .bind(&ids)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        let mut by_id: std::collections::HashMap<Uuid, Room> =
            rooms.into_iter().map(|room| (room.id.into(), room)).collect();

        // Driven by `scored`, not by the query result: `= ANY` returns rows in
        // whatever order the plan produced, and rebuilding from the ranking is
        // what keeps the order the scorer decided. A row that vanished between
        // the two queries is simply dropped.
        Ok(scored
            .into_iter()
            .filter_map(|entry| {
                by_id.remove(&entry.item).map(|room| RoomRecommendation {
                    room,
                    score: entry.score,
                    reasons: entry.reasons,
                })
            })
            .collect())
    }
}

/// The default page size, re-exported where callers reach for it.
pub const DEFAULT_LIMIT: i64 = DEFAULT_RESULTS;
