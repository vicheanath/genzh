//! The one thing the application wires in.
//!
//! Holds the three recommenders and their caches so `AppState` carries a single
//! field, and so the caching policy is decided once rather than at each of the
//! three call sites.

use std::sync::Arc;
use std::time::Duration;

use genzh_domain::UserId;
use genzh_infrastructure::{DbPool, RepositoryError, ServiceResult};
use serde::Serialize;
use uuid::Uuid;

use crate::cache::{CacheKey, RecommendationCache};
use crate::communities::{CommunityRecommendation, CommunityRecommender};
use crate::people::{PeopleRecommender, PersonRecommendation};
use crate::rooms::{RoomRecommendation, RoomRecommender};
use crate::signals::ViewerSignals;
use crate::{DEFAULT_RESULTS, MAX_RESULTS};

/// How long a computed list is reused.
///
/// Two minutes: long enough that a refetch on window focus is free, short
/// enough that a room somebody joined a moment ago can still appear while it is
/// still worth joining. The number is a guess about human attention, not about
/// database load, which is why it is small.
const TTL: Duration = Duration::from_secs(120);

/// How much of the story the admin console needs to judge the engine.
#[derive(Debug, Clone, Serialize)]
pub struct CoverageReport {
    /// Accounts that have no friends, no communities and no room history, and
    /// are therefore ranked on popularity alone.
    pub cold_accounts: i64,
    pub total_accounts: i64,
    /// Rooms that could be recommended to anybody at all.
    ///
    /// The number that explains a thin feed: when this is small, the engine is
    /// not underperforming, it has nothing to choose between.
    pub eligible_rooms: i64,
    /// Communities not quarantined.
    pub eligible_communities: i64,
    /// Entries currently held across all three caches.
    pub cached_entries: usize,
}

/// Recommendations, for every surface.
pub struct RecommendationService {
    pool: DbPool,
    rooms: RoomRecommender,
    people: PeopleRecommender,
    communities: CommunityRecommender,
    room_cache: RecommendationCache<Vec<RoomRecommendation>>,
    people_cache: RecommendationCache<Vec<PersonRecommendation>>,
    community_cache: RecommendationCache<Vec<CommunityRecommendation>>,
}

impl std::fmt::Debug for RecommendationService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RecommendationService").finish_non_exhaustive()
    }
}

impl RecommendationService {
    pub fn new(pool: DbPool) -> Arc<Self> {
        Arc::new(Self {
            rooms: RoomRecommender::new(pool.clone()),
            people: PeopleRecommender::new(pool.clone()),
            communities: CommunityRecommender::new(pool.clone()),
            room_cache: RecommendationCache::new(TTL),
            people_cache: RecommendationCache::new(TTL),
            community_cache: RecommendationCache::new(TTL),
            pool,
        })
    }

    /// Rooms for the home feed.
    pub async fn rooms(
        &self,
        viewer: UserId,
        category: Option<&str>,
        limit: Option<i64>,
    ) -> ServiceResult<Vec<RoomRecommendation>> {
        let key = CacheKey::new(viewer.into(), "rooms", category.unwrap_or("all"));

        if let Some(hit) = self.room_cache.get(&key) {
            return Ok(take(&hit, limit));
        }

        let signals = self.signals(viewer).await?;
        // Computed at full size and sliced per request, so one entry serves
        // every limit a caller asks for instead of fragmenting the cache into
        // an entry per page size.
        let full = self
            .rooms
            .recommend(viewer, &signals, category, MAX_RESULTS)
            .await?;

        Ok(take(&self.room_cache.put(key, full), limit))
    }

    /// People the viewer might know.
    pub async fn people(
        &self,
        viewer: UserId,
        limit: Option<i64>,
    ) -> ServiceResult<Vec<PersonRecommendation>> {
        let key = CacheKey::new(viewer.into(), "people", "all");

        if let Some(hit) = self.people_cache.get(&key) {
            return Ok(take(&hit, limit));
        }

        let signals = self.signals(viewer).await?;
        let full = self.people.recommend(viewer, &signals, MAX_RESULTS).await?;

        Ok(take(&self.people_cache.put(key, full), limit))
    }

    /// Communities to explore.
    pub async fn communities(
        &self,
        viewer: UserId,
        limit: Option<i64>,
    ) -> ServiceResult<Vec<CommunityRecommendation>> {
        let key = CacheKey::new(viewer.into(), "communities", "all");

        if let Some(hit) = self.community_cache.get(&key) {
            return Ok(take(&hit, limit));
        }

        let signals = self.signals(viewer).await?;
        let full = self
            .communities
            .recommend(viewer, &signals, MAX_RESULTS)
            .await?;

        Ok(take(&self.community_cache.put(key, full), limit))
    }

    /// Everything the engine knows about one viewer.
    ///
    /// Loaded per surface rather than cached alongside the results: it is four
    /// indexed lookups, and caching it would mean a block or a new friendship
    /// took effect on a different clock from the lists it feeds.
    pub async fn signals(&self, viewer: UserId) -> ServiceResult<ViewerSignals> {
        Ok(ViewerSignals::load(&self.pool, viewer).await?)
    }

    /// Drop everything remembered for one viewer.
    ///
    /// Called by the writes whose effect must be immediate rather than eventual
    /// — blocking somebody, above all. A blocked account lingering in
    /// suggestions for two minutes is not a cache detail, it is the block
    /// visibly not working.
    pub fn forget(&self, viewer: Uuid) {
        self.room_cache.forget_viewer(viewer);
        self.people_cache.forget_viewer(viewer);
        self.community_cache.forget_viewer(viewer);
    }

    /// What the engine has to work with, for the admin console.
    pub async fn coverage(&self) -> ServiceResult<CoverageReport> {
        let row: (i64, i64, i64, i64) = sqlx::query_as(
            "SELECT
               (SELECT COUNT(*) FROM users u
                 WHERE NOT EXISTS (SELECT 1 FROM community_members m WHERE m.user_id = u.id)
                   AND NOT EXISTS (SELECT 1 FROM messages g WHERE g.author_id = u.id)
                   AND NOT EXISTS (SELECT 1 FROM friendships f
                                    WHERE f.status = 'accepted'
                                      AND u.id IN (f.requester_id, f.addressee_id))),
               (SELECT COUNT(*) FROM users),
               (SELECT COUNT(*) FROM rooms
                 WHERE status = 'active' AND visibility = 'public' AND category <> 'dm'),
               (SELECT COUNT(*) FROM communities WHERE is_quarantined = FALSE)",
        )
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(CoverageReport {
            cold_accounts: row.0,
            total_accounts: row.1,
            eligible_rooms: row.2,
            eligible_communities: row.3,
            cached_entries: self.room_cache.len()
                + self.people_cache.len()
                + self.community_cache.len(),
        })
    }
}

/// Clone out the first `limit` results.
///
/// Cloning rather than handing back the `Arc`: the cached list is shared by
/// every concurrent request for this viewer, and slicing it per caller is the
/// only way one caller's page size does not become everyone's.
fn take<T: Clone>(cached: &[T], limit: Option<i64>) -> Vec<T> {
    let limit = limit.unwrap_or(DEFAULT_RESULTS).clamp(1, MAX_RESULTS) as usize;
    cached.iter().take(limit).cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn take_applies_the_default_when_no_limit_is_given() {
        let all: Vec<i32> = (0..MAX_RESULTS as i32).collect();
        assert_eq!(take(&all, None).len(), DEFAULT_RESULTS as usize);
    }

    #[test]
    fn take_clamps_an_absurd_limit() {
        let all: Vec<i32> = (0..MAX_RESULTS as i32).collect();

        assert_eq!(take(&all, Some(1_000_000)).len(), MAX_RESULTS as usize);
        // Zero and negatives clamp up rather than returning an empty list,
        // which would look like "no recommendations" instead of a bad request.
        assert_eq!(take(&all, Some(0)).len(), 1);
        assert_eq!(take(&all, Some(-5)).len(), 1);
    }

    #[test]
    fn take_keeps_the_ranking() {
        let all: Vec<i32> = vec![9, 8, 7, 6];
        assert_eq!(take(&all, Some(2)), vec![9, 8]);
    }

    #[test]
    fn take_is_safe_when_there_is_less_than_asked_for() {
        let all: Vec<i32> = vec![1, 2];
        assert_eq!(take(&all, Some(50)).len(), 2);
    }
}
