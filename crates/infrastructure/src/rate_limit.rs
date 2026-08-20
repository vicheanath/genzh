//! Request budgets.
//!
//! The important part here is the [`RateLimiter`] trait, not the implementation
//! behind it. Rate limiting is one of the few things that genuinely has to
//! become distributed the moment there are two API instances — a per-process
//! bucket lets an attacker multiply their allowance by the number of replicas —
//! so the seam exists from the start even though the only implementation today
//! is in-memory.
//!
//! [`InMemoryRateLimiter`] is a fixed-window counter: cheap, obvious, and honest
//! about its edge (a caller can spend two windows' worth across a boundary).
//! That is fine for the abuse this defends against; when it stops being fine,
//! the replacement implements the same trait.
//!
//! This lives beside the other volatile stores rather than next to the HTTP
//! middleware that uses it, because *counting requests against a budget* and
//! *turning a refusal into a 429* are different jobs with different reasons to
//! change. The middleware is in `apps/api`; the counting is here.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use parking_lot::Mutex;

use crate::store::StoreResult;

/// The verdict on one request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Decision {
    /// May the caller proceed?
    pub allowed: bool,
    /// How many requests remain in the current window.
    pub remaining: u32,
    /// How long until the budget resets.
    pub retry_after: Duration,
}

impl Decision {
    /// Allowed, with `remaining` left before the window closes.
    pub fn allowed(remaining: u32, retry_after: Duration) -> Self {
        Self {
            allowed: true,
            remaining,
            retry_after,
        }
    }

    /// Refused; the caller should wait `retry_after`.
    pub fn refused(retry_after: Duration) -> Self {
        Self {
            allowed: false,
            remaining: 0,
            retry_after,
        }
    }
}

/// Decides whether a caller may proceed.
#[async_trait]
pub trait RateLimiter: Send + Sync + 'static {
    /// Record one request against `key` and report the verdict.
    ///
    /// Recording and deciding are one call, not two, because they have to be
    /// atomic: a distributed limiter that read a counter and wrote it back
    /// separately would let concurrent requests slip through the gap between
    /// them.
    async fn check(&self, key: &str) -> StoreResult<Decision>;
}

/// A fixed-window, in-memory limiter.
#[derive(Debug)]
pub struct InMemoryRateLimiter {
    window: Duration,
    max_requests: u32,
    buckets: Mutex<HashMap<String, Bucket>>,
}

#[derive(Debug, Clone, Copy)]
struct Bucket {
    window_started: Instant,
    count: u32,
}

/// Bucket count above which a sweep runs before the next insert.
const SWEEP_THRESHOLD: usize = 10_000;

impl InMemoryRateLimiter {
    /// Allow `max_requests` per `window` per key.
    pub fn new(max_requests: u32, window: Duration) -> Arc<Self> {
        Arc::new(Self {
            window,
            max_requests,
            buckets: Mutex::new(HashMap::new()),
        })
    }

    /// Drop buckets whose window has passed.
    ///
    /// Called opportunistically rather than on a timer: the map only grows
    /// while traffic is arriving, so the sweep can ride along with it.
    fn sweep(buckets: &mut HashMap<String, Bucket>, now: Instant, window: Duration) {
        buckets.retain(|_, bucket| now.duration_since(bucket.window_started) < window);
    }
}

#[async_trait]
impl RateLimiter for InMemoryRateLimiter {
    async fn check(&self, key: &str) -> StoreResult<Decision> {
        let now = Instant::now();
        let mut buckets = self.buckets.lock();

        // Amortised cleanup: sweeping once the map is large keeps a long-lived
        // process from accumulating a bucket per key ever seen.
        if buckets.len() > SWEEP_THRESHOLD {
            Self::sweep(&mut buckets, now, self.window);
        }

        let bucket = buckets.entry(key.to_owned()).or_insert(Bucket {
            window_started: now,
            count: 0,
        });

        if now.duration_since(bucket.window_started) >= self.window {
            *bucket = Bucket {
                window_started: now,
                count: 0,
            };
        }

        bucket.count += 1;
        let elapsed = now.duration_since(bucket.window_started);
        let retry_after = self.window.saturating_sub(elapsed);

        Ok(if bucket.count <= self.max_requests {
            Decision::allowed(self.max_requests - bucket.count, retry_after)
        } else {
            Decision::refused(retry_after)
        })
    }
}

/// A limiter that allows everything.
///
/// For tests and for local runs where a budget only gets in the way. Named for
/// what it does, so nobody configures it into production by mistaking it for a
/// default.
#[derive(Debug, Default)]
pub struct UnlimitedRateLimiter;

impl UnlimitedRateLimiter {
    /// A limiter that never refuses.
    pub fn new() -> Arc<Self> {
        Arc::new(Self)
    }
}

#[async_trait]
impl RateLimiter for UnlimitedRateLimiter {
    async fn check(&self, _key: &str) -> StoreResult<Decision> {
        Ok(Decision::allowed(u32::MAX, Duration::ZERO))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn requests_within_the_limit_are_allowed() {
        let limiter = InMemoryRateLimiter::new(3, Duration::from_secs(60));
        for _ in 0..3 {
            assert!(limiter.check("user-a").await.expect("check").allowed);
        }
    }

    #[tokio::test]
    async fn the_request_after_the_limit_is_refused() {
        let limiter = InMemoryRateLimiter::new(3, Duration::from_secs(60));
        for _ in 0..3 {
            limiter.check("user-a").await.expect("check");
        }
        assert!(!limiter.check("user-a").await.expect("check").allowed);
        assert!(
            !limiter.check("user-a").await.expect("check").allowed,
            "still refused"
        );
    }

    #[tokio::test]
    async fn callers_do_not_share_an_allowance() {
        let limiter = InMemoryRateLimiter::new(1, Duration::from_secs(60));
        assert!(limiter.check("user-a").await.expect("check").allowed);
        assert!(!limiter.check("user-a").await.expect("check").allowed);
        assert!(
            limiter.check("user-b").await.expect("check").allowed,
            "one caller must not exhaust another's budget"
        );
    }

    #[tokio::test]
    async fn the_remaining_budget_counts_down() {
        let limiter = InMemoryRateLimiter::new(2, Duration::from_secs(60));
        assert_eq!(limiter.check("user-a").await.expect("check").remaining, 1);
        assert_eq!(limiter.check("user-a").await.expect("check").remaining, 0);
    }

    #[tokio::test]
    async fn a_refusal_says_how_long_to_wait() {
        let limiter = InMemoryRateLimiter::new(1, Duration::from_secs(60));
        limiter.check("user-a").await.expect("check");

        let refused = limiter.check("user-a").await.expect("check");
        assert!(!refused.allowed);
        assert!(
            refused.retry_after > Duration::ZERO && refused.retry_after <= Duration::from_secs(60)
        );
    }

    #[tokio::test]
    async fn the_window_resets() {
        let limiter = InMemoryRateLimiter::new(1, Duration::from_millis(20));
        assert!(limiter.check("user-a").await.expect("check").allowed);
        assert!(!limiter.check("user-a").await.expect("check").allowed);

        tokio::time::sleep(Duration::from_millis(30)).await;
        assert!(
            limiter.check("user-a").await.expect("check").allowed,
            "a new window starts fresh"
        );
    }

    #[tokio::test]
    async fn stale_buckets_are_swept() {
        let mut buckets = HashMap::from([
            (
                "fresh".to_owned(),
                Bucket {
                    window_started: Instant::now(),
                    count: 1,
                },
            ),
            (
                "stale".to_owned(),
                Bucket {
                    window_started: Instant::now() - Duration::from_secs(120),
                    count: 1,
                },
            ),
        ]);

        InMemoryRateLimiter::sweep(&mut buckets, Instant::now(), Duration::from_secs(60));

        assert!(buckets.contains_key("fresh"));
        assert!(!buckets.contains_key("stale"));
    }

    #[tokio::test]
    async fn the_unlimited_limiter_never_refuses() {
        let limiter = UnlimitedRateLimiter::new();
        for _ in 0..1_000 {
            assert!(limiter.check("user-a").await.expect("check").allowed);
        }
    }

    #[tokio::test]
    async fn the_port_is_object_safe() {
        let limiter: Arc<dyn RateLimiter> = InMemoryRateLimiter::new(1, Duration::from_secs(60));
        assert!(limiter.check("user-a").await.expect("check").allowed);
        assert!(!limiter.check("user-a").await.expect("check").allowed);
    }
}
