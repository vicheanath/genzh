//! What the engine knows about the person asking.
//!
//! Gathered once per request and handed to whichever recommender runs, because
//! all three surfaces need the same three answers — who this viewer's people
//! are, what they have shown interest in, and who they must never be shown.

use std::collections::{HashMap, HashSet};

use genzh_domain::UserId;
use genzh_infrastructure::{DbPool, RepositoryError, RepositoryResult};
use uuid::Uuid;

/// How strongly a viewer leans toward each category.
///
/// Normalised so the values sum to 1, which makes it a share of attention
/// rather than a count. That matters because the alternative — raw counts —
/// would make a heavy user's mild interest outscore a light user's only
/// interest, and the question being asked is "what does *this* person like",
/// not "who is busiest".
#[derive(Debug, Clone, Default)]
pub struct Affinity {
    shares: HashMap<String, f64>,
    /// Rooms behind the affinity, so a reason can say how it was earned.
    observations: u32,
}

impl Affinity {
    fn from_counts(counts: HashMap<String, i64>) -> Self {
        let total: i64 = counts.values().sum();
        if total <= 0 {
            return Self::default();
        }

        Self {
            shares: counts
                .iter()
                .map(|(category, count)| (category.clone(), *count as f64 / total as f64))
                .collect(),
            observations: u32::try_from(total).unwrap_or(u32::MAX),
        }
    }

    /// This viewer's share of attention on `category`, in `[0, 1]`.
    ///
    /// Zero for a category they have never touched, and zero for a viewer with
    /// no history at all — which is the correct answer in both cases, and lets
    /// the caller add it unconditionally.
    pub fn share(&self, category: &str) -> f64 {
        self.shares.get(category).copied().unwrap_or(0.0)
    }

    /// How many rooms this affinity was learned from.
    pub fn observations(&self) -> u32 {
        self.observations
    }

    /// Whether there is anything to go on.
    pub fn is_empty(&self) -> bool {
        self.shares.is_empty()
    }
}

/// Everything about the viewer that the recommenders score against.
#[derive(Debug, Clone)]
pub struct ViewerSignals {
    pub viewer: UserId,
    /// Accepted friends, both directions.
    pub friends: HashSet<Uuid>,
    /// Communities the viewer belongs to.
    pub communities: HashSet<Uuid>,
    /// Rooms the viewer is already in or has posted in — the "seen it" set.
    pub known_rooms: HashSet<Uuid>,
    /// Category leanings learned from those rooms.
    pub affinity: Affinity,
    /// Accounts that must not appear, in either direction.
    ///
    /// Symmetric on purpose: somebody the viewer blocked should not be
    /// recommended to them, and neither should somebody who blocked the
    /// viewer — surfacing the latter invites exactly the contact the block was
    /// meant to stop.
    pub excluded_users: HashSet<Uuid>,
}

impl ViewerSignals {
    /// Whether the viewer has enough history for personalisation to mean
    /// anything.
    ///
    /// Not used to switch code paths — the scorers handle an empty viewer
    /// perfectly well — but worth reporting, because "your feed is generic"
    /// and "the ranking is broken" look identical from the outside.
    pub fn is_cold(&self) -> bool {
        self.friends.is_empty() && self.communities.is_empty() && self.known_rooms.is_empty()
    }

    /// Load everything in one pass.
    ///
    /// Four small indexed queries rather than one join of everything: they are
    /// independent, each is a primary-key or index scan, and a single query
    /// producing the cross product of friends × communities × rooms would
    /// return far more rows than the sum of these.
    pub async fn load(pool: &DbPool, viewer: UserId) -> RepositoryResult<Self> {
        let friends: Vec<(Uuid,)> = sqlx::query_as(
            "SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END
               FROM friendships
              WHERE status = 'accepted'
                AND (requester_id = $1 OR addressee_id = $1)",
        )
        .bind(viewer)
        .fetch_all(pool)
        .await
        .map_err(RepositoryError::from)?;

        let communities: Vec<(Uuid,)> =
            sqlx::query_as("SELECT community_id FROM community_members WHERE user_id = $1")
                .bind(viewer)
                .fetch_all(pool)
                .await
                .map_err(RepositoryError::from)?;

        // Joined *or* posted in. Posting is the stronger signal of the two, and
        // a participant row disappears when somebody leaves — so joins alone
        // would forget every room the viewer has ever been in.
        let rooms: Vec<(Uuid, Option<String>)> = sqlx::query_as(
            "SELECT r.id, r.category
               FROM rooms r
              WHERE r.id IN (
                    SELECT room_id FROM room_participants WHERE user_id = $1
                    UNION
                    SELECT room_id FROM messages WHERE author_id = $1
                    )",
        )
        .bind(viewer)
        .fetch_all(pool)
        .await
        .map_err(RepositoryError::from)?;

        let blocked: Vec<(Uuid,)> = sqlx::query_as(
            "SELECT blocked_id FROM blocks WHERE blocker_id = $1
             UNION
             SELECT blocker_id FROM blocks WHERE blocked_id = $1",
        )
        .bind(viewer)
        .fetch_all(pool)
        .await
        .map_err(RepositoryError::from)?;

        let mut categories: HashMap<String, i64> = HashMap::new();
        let mut known_rooms = HashSet::with_capacity(rooms.len());
        for (room_id, category) in rooms {
            known_rooms.insert(room_id);
            if let Some(category) = category {
                *categories.entry(category).or_default() += 1;
            }
        }

        let mut excluded_users: HashSet<Uuid> = blocked.into_iter().map(|(id,)| id).collect();
        // The viewer is never a recommendation for themselves.
        excluded_users.insert(viewer.into());

        Ok(Self {
            viewer,
            friends: friends.into_iter().map(|(id,)| id).collect(),
            communities: communities.into_iter().map(|(id,)| id).collect(),
            known_rooms,
            affinity: Affinity::from_counts(categories),
            excluded_users,
        })
    }

    /// The exclusion set as a vector, for binding to `!= ALL($n)`.
    pub fn excluded_vec(&self) -> Vec<Uuid> {
        self.excluded_users.iter().copied().collect()
    }

    /// The viewer's communities as a vector, for binding.
    pub fn community_vec(&self) -> Vec<Uuid> {
        self.communities.iter().copied().collect()
    }

    /// The viewer's friends as a vector, for binding.
    pub fn friend_vec(&self) -> Vec<Uuid> {
        self.friends.iter().copied().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn counts(pairs: &[(&str, i64)]) -> HashMap<String, i64> {
        pairs
            .iter()
            .map(|(name, count)| ((*name).to_owned(), *count))
            .collect()
    }

    #[test]
    fn affinity_is_a_share_of_attention() {
        let affinity = Affinity::from_counts(counts(&[("tech", 3), ("music", 1)]));

        assert!((affinity.share("tech") - 0.75).abs() < 1e-9);
        assert!((affinity.share("music") - 0.25).abs() < 1e-9);
        assert_eq!(affinity.observations(), 4);
    }

    #[test]
    fn a_heavy_user_does_not_outscore_a_light_one_on_the_same_taste() {
        // Both are wholly interested in tech; the busier one must not be scored
        // as *more* interested, or the feed would rank by activity in disguise.
        let light = Affinity::from_counts(counts(&[("tech", 1)]));
        let heavy = Affinity::from_counts(counts(&[("tech", 400)]));

        assert!((light.share("tech") - heavy.share("tech")).abs() < 1e-9);
    }

    #[test]
    fn an_unknown_category_scores_zero_rather_than_failing() {
        let affinity = Affinity::from_counts(counts(&[("tech", 2)]));
        assert_eq!(affinity.share("gaming"), 0.0);
    }

    #[test]
    fn a_viewer_with_no_history_has_an_empty_affinity() {
        let affinity = Affinity::from_counts(HashMap::new());

        assert!(affinity.is_empty());
        assert_eq!(affinity.share("anything"), 0.0);
        assert_eq!(affinity.observations(), 0);
    }
}
