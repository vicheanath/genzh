//! Rate limiting.
//!
//! The important part here is the [`RateLimiter`] trait, not the
//! implementation behind it. Rate limiting is one of the few things that
//! genuinely has to become distributed the moment there are two API instances
//! — a per-process bucket lets an attacker multiply their allowance by the
//! number of replicas — so the seam exists from the start even though the only
//! implementation today is in-memory.
//!
//! [`InMemoryRateLimiter`] is a fixed-window counter: cheap, obvious, and
//! honest about its edge (a caller can spend two windows' worth across a
//! boundary). That is fine for the abuse this defends against; when it stops
//! being fine, the replacement implements the same trait.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

/// Decides whether a caller may proceed.
pub trait RateLimiter: Send + Sync + 'static {
    /// Record one request and report whether it is allowed.
    fn check(&self, key: &str) -> bool;
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

impl InMemoryRateLimiter {
    /// Allow `max_requests` per `window` per key.
    pub fn new(max_requests: u32, window: Duration) -> Arc<Self> {
        Arc::new(Self { window, max_requests, buckets: Mutex::new(HashMap::new()) })
    }

    /// Drop buckets whose window has passed.
    ///
    /// Called opportunistically rather than on a timer: the map only grows
    /// while traffic is arriving, so the sweep can ride along with it.
    fn sweep(buckets: &mut HashMap<String, Bucket>, now: Instant, window: Duration) {
        buckets.retain(|_, bucket| now.duration_since(bucket.window_started) < window);
    }
}

impl RateLimiter for InMemoryRateLimiter {
    fn check(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut buckets = self.buckets.lock();

        // Amortised cleanup: sweeping once the map is large keeps a long-lived
        // process from accumulating a bucket per key ever seen.
        if buckets.len() > 10_000 {
            Self::sweep(&mut buckets, now, self.window);
        }

        let bucket = buckets
            .entry(key.to_owned())
            .or_insert(Bucket { window_started: now, count: 0 });

        if now.duration_since(bucket.window_started) >= self.window {
            *bucket = Bucket { window_started: now, count: 0 };
        }

        bucket.count += 1;
        bucket.count <= self.max_requests
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requests_within_the_limit_are_allowed() {
        let limiter = InMemoryRateLimiter::new(3, Duration::from_secs(60));
        for _ in 0..3 {
            assert!(limiter.check("user-a"));
        }
    }

    #[test]
    fn the_request_after_the_limit_is_refused() {
        let limiter = InMemoryRateLimiter::new(3, Duration::from_secs(60));
        for _ in 0..3 {
            limiter.check("user-a");
        }
        assert!(!limiter.check("user-a"));
        assert!(!limiter.check("user-a"), "still refused");
    }

    #[test]
    fn callers_do_not_share_an_allowance() {
        let limiter = InMemoryRateLimiter::new(1, Duration::from_secs(60));
        assert!(limiter.check("user-a"));
        assert!(!limiter.check("user-a"));
        assert!(limiter.check("user-b"), "one caller must not exhaust another's budget");
    }

    #[test]
    fn the_window_resets() {
        let limiter = InMemoryRateLimiter::new(1, Duration::from_millis(20));
        assert!(limiter.check("user-a"));
        assert!(!limiter.check("user-a"));

        std::thread::sleep(Duration::from_millis(30));
        assert!(limiter.check("user-a"), "a new window starts fresh");
    }

    #[test]
    fn stale_buckets_are_swept() {
        let mut buckets = HashMap::from([
            ("fresh".to_owned(), Bucket { window_started: Instant::now(), count: 1 }),
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
}

// ─────────────────────────── axum integration ───────────────────────────

use axum::extract::{ConnectInfo, State};
use axum::extract::Request;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::net::SocketAddr;

use crate::error::ApiError;
use crate::state::AppState;

/// Rate-limit by client address.
///
/// Keyed on the peer address rather than on the authenticated user, because
/// the endpoints most worth protecting — login, registration, refresh — are
/// precisely the ones with no authenticated user yet.
///
/// Behind a proxy the peer address is the proxy. Trusting `X-Forwarded-For`
/// instead would let any client pick its own bucket, so the correct fix is for
/// the proxy to enforce this or to be configured as trusted — not to believe a
/// header.
pub async fn enforce(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    // Authentication endpoints get the tighter budget.
    let (limiter, scope) = if path.starts_with("/api/v1/auth/") {
        (&state.auth_rate_limiter, "auth")
    } else {
        (&state.rate_limiter, "api")
    };

    let key = format!("{scope}:{}", peer.ip());
    if !limiter.check(&key) {
        tracing::warn!(peer = %peer.ip(), scope, "rate limited");
        return ApiError::RateLimited.into_response();
    }

    next.run(request).await
}
