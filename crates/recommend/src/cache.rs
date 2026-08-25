//! A short memory, so a refetch does not re-run the joins.
//!
//! The feed is polled: React Query refetches on window focus, on reconnect, and
//! on every navigation back to the home screen. Without a cache, tabbing away
//! and back re-runs three aggregate joins to produce a list that could not
//! possibly have changed in the two seconds since.
//!
//! Deliberately not a general cache. Entries are small, keyed by viewer and
//! surface, and expire on a timer rather than on invalidation — because the
//! thing that makes a recommendation stale is *somebody else* joining a room,
//! which no write path on this viewer's behalf could ever know to invalidate.
//! A short TTL is the honest mechanism; a precise one would be a lie.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use uuid::Uuid;

/// Which list, for whom.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CacheKey {
    pub viewer: Uuid,
    /// `"rooms"`, `"people"`, `"communities"` — plus whatever narrowed it.
    pub surface: &'static str,
    /// Filters that change the answer, flattened. A category filter produces a
    /// different list and therefore a different entry.
    pub variant: String,
}

impl CacheKey {
    pub fn new(viewer: Uuid, surface: &'static str, variant: impl Into<String>) -> Self {
        Self {
            viewer,
            surface,
            variant: variant.into(),
        }
    }
}

struct Entry<T> {
    value: Arc<T>,
    stored_at: Instant,
}

/// Above this many entries, expired ones are swept before the next insert.
///
/// Amortised rather than timed: the map only grows when requests arrive, so the
/// cleanup can ride along with them and there is no task to shut down.
const SWEEP_THRESHOLD: usize = 2_048;

/// A TTL cache of recommendation results.
pub struct RecommendationCache<T> {
    entries: Mutex<HashMap<CacheKey, Entry<T>>>,
    ttl: Duration,
}

impl<T> std::fmt::Debug for RecommendationCache<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RecommendationCache")
            .field("entries", &self.entries.lock().len())
            .field("ttl", &self.ttl)
            .finish()
    }
}

impl<T> RecommendationCache<T> {
    /// Remember results for `ttl`.
    pub fn new(ttl: Duration) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            ttl,
        }
    }

    /// The stored value, if it has not expired.
    pub fn get(&self, key: &CacheKey) -> Option<Arc<T>> {
        let entries = self.entries.lock();
        let entry = entries.get(key)?;

        if entry.stored_at.elapsed() >= self.ttl {
            // Left in place rather than removed: `get` takes the lock in read
            // spirit, the sweep on insert will collect it, and an expired entry
            // is already invisible.
            return None;
        }

        Some(Arc::clone(&entry.value))
    }

    /// Store a result, returning the handle the caller should use.
    pub fn put(&self, key: CacheKey, value: T) -> Arc<T> {
        let value = Arc::new(value);
        let mut entries = self.entries.lock();

        if entries.len() > SWEEP_THRESHOLD {
            let ttl = self.ttl;
            entries.retain(|_, entry| entry.stored_at.elapsed() < ttl);
        }

        entries.insert(
            key,
            Entry {
                value: Arc::clone(&value),
                stored_at: Instant::now(),
            },
        );

        value
    }

    /// Forget everything remembered for one viewer.
    ///
    /// For the writes that *do* invalidate deterministically — joining a room,
    /// adding a friend, blocking somebody. Blocking especially: a blocked
    /// account must leave the viewer's suggestions immediately, and waiting out
    /// a TTL is not an acceptable answer to that.
    pub fn forget_viewer(&self, viewer: Uuid) {
        self.entries.lock().retain(|key, _| key.viewer != viewer);
    }

    /// How many entries are held, expired ones included.
    pub fn len(&self) -> usize {
        self.entries.lock().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(viewer: u128) -> CacheKey {
        CacheKey::new(Uuid::from_u128(viewer), "rooms", "all")
    }

    #[test]
    fn a_stored_value_comes_back() {
        let cache = RecommendationCache::new(Duration::from_secs(60));
        cache.put(key(1), vec![1, 2, 3]);

        assert_eq!(cache.get(&key(1)).as_deref(), Some(&vec![1, 2, 3]));
    }

    #[test]
    fn a_different_viewer_gets_nothing() {
        // The bug this guards against is the worst one a cache here could have:
        // serving one person's recommendations to another.
        let cache = RecommendationCache::new(Duration::from_secs(60));
        cache.put(key(1), vec![1, 2, 3]);

        assert!(cache.get(&key(2)).is_none());
    }

    #[test]
    fn a_different_variant_gets_nothing() {
        let cache = RecommendationCache::new(Duration::from_secs(60));
        cache.put(CacheKey::new(Uuid::from_u128(1), "rooms", "tech"), vec![1]);

        assert!(
            cache
                .get(&CacheKey::new(Uuid::from_u128(1), "rooms", "music"))
                .is_none()
        );
    }

    #[test]
    fn an_expired_value_is_not_served() {
        let cache = RecommendationCache::new(Duration::ZERO);
        cache.put(key(1), vec![1]);

        assert!(cache.get(&key(1)).is_none());
    }

    #[test]
    fn forgetting_a_viewer_leaves_everyone_else_alone() {
        let cache = RecommendationCache::new(Duration::from_secs(60));
        cache.put(key(1), vec![1]);
        cache.put(key(2), vec![2]);

        cache.forget_viewer(Uuid::from_u128(1));

        assert!(cache.get(&key(1)).is_none());
        assert!(cache.get(&key(2)).is_some());
    }
}
