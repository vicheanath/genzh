//! Whether one account is posting like a person or like a script.
//!
//! The distinction the [`RateLimiter`](crate::rate_limit::RateLimiter) cannot
//! make. That one counts requests per address, which is the right defence for
//! login and registration and the wrong one for chat: an authenticated flood
//! arrives from one ordinary-looking client, and the abuse is what the account
//! is doing rather than how many HTTP requests reached the process. It also
//! misses the WebSocket path entirely — a hundred messages can arrive down one
//! socket that the HTTP middleware saw open exactly once.
//!
//! So this port answers a different question: *given who is posting and what
//! they just said, should this go through?* Two rules, because the two shapes
//! of chat spam are different:
//!
//! * **burst** — more than N in a window, whatever the content;
//! * **repetition** — the same thing over and over, which stays under any
//!   sensible burst limit and is still the most common flood there is.
//!
//! Like the other volatile ports here it is a trait with an in-memory
//! implementation: correct for one instance, wrong for several — a second
//! replica would count only its own traffic — and replaceable by a shared store
//! without touching a call site. See [`crate::store`] for why the trait is
//! async and fallible when the implementation is neither.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use parking_lot::Mutex;

use crate::store::StoreResult;
use crate::sweep::Sweep;

/// The verdict on one post.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FloodVerdict {
    /// Nothing suspicious; carry on.
    Allowed,
    /// Too many in too short a window.
    TooFast {
        /// How long until the window rolls over.
        retry_after: Duration,
    },
    /// The same content, again, too soon.
    Repeated {
        /// How long until the repeat is forgotten.
        retry_after: Duration,
    },
}

impl FloodVerdict {
    /// Did this verdict let the post through?
    pub fn allowed(&self) -> bool {
        matches!(self, FloodVerdict::Allowed)
    }

    /// How long the caller should wait, if they were refused.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            FloodVerdict::Allowed => None,
            FloodVerdict::TooFast { retry_after } | FloodVerdict::Repeated { retry_after } => {
                Some(*retry_after)
            }
        }
    }
}

/// How much is too much.
#[derive(Debug, Clone, Copy)]
pub struct FloodPolicy {
    /// Posts allowed per [`Self::window`].
    pub burst: u32,
    /// The burst window.
    pub window: Duration,
    /// How long an identical post is remembered.
    pub repeat_window: Duration,
    /// How many identical posts within that window are tolerated.
    ///
    /// Not one: saying "ok" twice in a conversation is conversation. It is the
    /// third and fourth identical line that stop being one.
    pub repeats: u32,
}

impl Default for FloodPolicy {
    /// Room to talk, not room to flood.
    ///
    /// Ten messages in ten seconds is faster than anybody types and slower than
    /// anything automated bothers to be.
    fn default() -> Self {
        Self {
            burst: 10,
            window: Duration::from_secs(10),
            repeat_window: Duration::from_secs(30),
            repeats: 3,
        }
    }
}

/// Decides whether an account may post right now.
///
/// [`Sweep`] is a supertrait for the same reason it is one on
/// [`RateLimiter`](crate::RateLimiter): the scheduler that reclaims this map
/// should not have to be handed the concrete guard to do it.
#[async_trait]
pub trait FloodGuard: Sweep + Send + Sync + 'static {
    /// Record one post by `key` and report the verdict.
    ///
    /// `key` scopes the budget — a user in a room, a user's reactions — and
    /// `digest` fingerprints the content, from
    /// [`genzh_domain::spam::digest`](../../genzh_domain/spam/fn.digest.html).
    ///
    /// Recording and deciding are one call for the same reason the rate
    /// limiter's are: a distributed implementation that read and then wrote
    /// would let concurrent posts through the gap between them.
    async fn check(&self, key: &str, digest: u64) -> StoreResult<FloodVerdict>;
}

/// Per-key counters held in this process.
#[derive(Debug)]
pub struct InMemoryFloodGuard {
    policy: FloodPolicy,
    recent: Mutex<HashMap<String, Recent>>,
}

/// What one key has been doing lately.
#[derive(Debug, Clone, Copy)]
struct Recent {
    window_started: Instant,
    count: u32,
    /// The last thing said, and when — `None` until something has been.
    ///
    /// An `Option` rather than a pre-seeded digest, because seeding it with the
    /// incoming one makes every first post look like a repeat of itself.
    last: Option<(u64, Instant)>,
    /// How many times in a row that same thing has been said since.
    repeats: u32,
}

/// Key count above which a sweep runs before the next insert.
const SWEEP_THRESHOLD: usize = 10_000;

impl InMemoryFloodGuard {
    /// Build a guard enforcing `policy`.
    pub fn new(policy: FloodPolicy) -> Arc<Self> {
        Arc::new(Self {
            policy,
            recent: Mutex::new(HashMap::new()),
        })
    }

    /// Drop keys that have gone quiet for longer than either window.
    ///
    /// Opportunistic rather than timed, for the same reason as the rate
    /// limiter's: the map only grows while traffic is arriving, so the sweep
    /// can ride along with it.
    fn sweep(recent: &mut HashMap<String, Recent>, now: Instant, policy: &FloodPolicy) {
        let idle = policy.window.max(policy.repeat_window);
        recent.retain(|_, entry| match entry.last {
            Some((_, at)) => now.duration_since(at) < idle,
            None => now.duration_since(entry.window_started) < idle,
        });
    }

}

impl Sweep for InMemoryFloodGuard {
    fn label(&self) -> &'static str {
        "flood"
    }

    fn sweep_stale(&self) -> usize {
        let now = Instant::now();
        let mut recent = self.recent.lock();
        let before = recent.len();
        Self::sweep(&mut recent, now, &self.policy);
        before.saturating_sub(recent.len())
    }
}

#[async_trait]
impl FloodGuard for InMemoryFloodGuard {
    async fn check(&self, key: &str, digest: u64) -> StoreResult<FloodVerdict> {
        let now = Instant::now();
        let mut recent = self.recent.lock();

        if recent.len() > SWEEP_THRESHOLD {
            Self::sweep(&mut recent, now, &self.policy);
        }

        let entry = recent.entry(key.to_owned()).or_insert(Recent {
            window_started: now,
            count: 0,
            last: None,
            repeats: 0,
        });

        if now.duration_since(entry.window_started) >= self.policy.window {
            entry.window_started = now;
            entry.count = 0;
        }

        // Repetition is decided before the burst rule, because a refused post
        // must not also consume the burst budget: a client retrying a message
        // the guard already rejected would otherwise talk itself into a
        // slow-down it never earned.
        let repeated = match entry.last {
            Some((last, at)) => {
                last == digest && now.duration_since(at) < self.policy.repeat_window
            }
            None => false,
        };
        let age = entry.last.map_or(Duration::ZERO, |(_, at)| now.duration_since(at));

        if repeated {
            entry.repeats += 1;
        } else {
            entry.repeats = 0;
        }
        entry.last = Some((digest, now));

        // `repeats` counts the times this was said *again*, so the policy's
        // number is how many identical posts go through before the next one
        // stops.
        if repeated && entry.repeats >= self.policy.repeats {
            return Ok(FloodVerdict::Repeated {
                retry_after: self.policy.repeat_window.saturating_sub(age),
            });
        }

        entry.count += 1;
        if entry.count > self.policy.burst {
            let elapsed = now.duration_since(entry.window_started);
            return Ok(FloodVerdict::TooFast {
                retry_after: self.policy.window.saturating_sub(elapsed),
            });
        }

        Ok(FloodVerdict::Allowed)
    }
}

/// A guard that allows everything.
///
/// For tests and for local runs where a budget only gets in the way. Named for
/// what it does, so nobody configures it into production by mistaking it for a
/// default.
#[derive(Debug, Default)]
pub struct PermissiveFloodGuard;

impl PermissiveFloodGuard {
    /// A guard that never refuses.
    pub fn new() -> Arc<Self> {
        Arc::new(Self)
    }
}

#[async_trait]
impl FloodGuard for PermissiveFloodGuard {
    async fn check(&self, _key: &str, _digest: u64) -> StoreResult<FloodVerdict> {
        Ok(FloodVerdict::Allowed)
    }
}

impl Sweep for PermissiveFloodGuard {
    fn label(&self) -> &'static str {
        "flood_permissive"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Distinct content each time, so only the burst rule can fire.
    fn varied(index: u64) -> u64 {
        index.wrapping_mul(0x9E37_79B9_7F4A_7C15)
    }

    fn policy() -> FloodPolicy {
        FloodPolicy {
            burst: 3,
            window: Duration::from_secs(10),
            repeat_window: Duration::from_secs(30),
            repeats: 3,
        }
    }

    #[tokio::test]
    async fn a_normal_run_of_messages_is_allowed() {
        let guard = InMemoryFloodGuard::new(policy());
        for index in 0..3 {
            assert!(
                guard
                    .check("ana", varied(index))
                    .await
                    .expect("check")
                    .allowed(),
                "message {index} should be allowed"
            );
        }
    }

    #[tokio::test]
    async fn a_burst_past_the_limit_is_refused() {
        let guard = InMemoryFloodGuard::new(policy());
        for index in 0..3 {
            guard.check("ana", varied(index)).await.expect("check");
        }

        let verdict = guard.check("ana", varied(99)).await.expect("check");
        assert!(matches!(verdict, FloodVerdict::TooFast { .. }));
        assert!(
            verdict
                .retry_after()
                .is_some_and(|wait| wait > Duration::ZERO)
        );
    }

    #[tokio::test]
    async fn saying_the_same_thing_twice_is_fine() {
        let guard = InMemoryFloodGuard::new(policy());
        assert!(guard.check("ana", 7).await.expect("check").allowed());
        assert!(guard.check("ana", 7).await.expect("check").allowed());
    }

    #[tokio::test]
    async fn identical_messages_are_refused_once_they_become_a_pattern() {
        // Roomy burst budget, so only the repeat rule can be what refuses.
        let guard = InMemoryFloodGuard::new(FloodPolicy {
            burst: 20,
            ..policy()
        });

        // `repeats: 3` — three identical posts go through, the fourth does not.
        for index in 0..3 {
            assert!(
                guard.check("ana", 7).await.expect("check").allowed(),
                "identical post {index} should still be allowed"
            );
        }
        assert!(matches!(
            guard.check("ana", 7).await.expect("check"),
            FloodVerdict::Repeated { .. }
        ));
    }

    #[tokio::test]
    async fn a_different_message_clears_the_repeat_count() {
        // A roomier burst budget, so only the repeat rule can be what refuses.
        let guard = InMemoryFloodGuard::new(FloodPolicy {
            burst: 20,
            ..policy()
        });
        guard.check("ana", 7).await.expect("check");
        guard.check("ana", 7).await.expect("check");
        guard.check("ana", 8).await.expect("check");
        assert!(
            guard.check("ana", 7).await.expect("check").allowed(),
            "the run of repeats was broken, so this is a first repeat again"
        );
    }

    #[tokio::test]
    async fn a_refused_repeat_does_not_spend_the_burst_budget() {
        let guard = InMemoryFloodGuard::new(FloodPolicy {
            burst: 3,
            repeats: 2,
            ..policy()
        });

        // Two identical posts go through; the next two are refused as repeats.
        for _ in 0..4 {
            guard.check("ana", 7).await.expect("check");
        }

        // Five posts against a budget of three, and something new still gets
        // through: the refusals cost the sender nothing they had not spent.
        assert!(
            guard
                .check("ana", varied(1))
                .await
                .expect("check")
                .allowed(),
            "only the two accepted posts should have counted"
        );
        assert!(
            !guard
                .check("ana", varied(2))
                .await
                .expect("check")
                .allowed(),
            "the budget is still a budget"
        );
    }

    #[tokio::test]
    async fn budgets_are_not_shared_between_accounts() {
        let guard = InMemoryFloodGuard::new(FloodPolicy {
            burst: 1,
            ..policy()
        });
        assert!(guard.check("ana", 1).await.expect("check").allowed());
        assert!(!guard.check("ana", 2).await.expect("check").allowed());
        assert!(
            guard.check("bo", 3).await.expect("check").allowed(),
            "one account must not exhaust another's budget"
        );
    }

    #[tokio::test]
    async fn the_window_rolls_over() {
        let guard = InMemoryFloodGuard::new(FloodPolicy {
            burst: 1,
            window: Duration::from_millis(30),
            ..policy()
        });
        assert!(guard.check("ana", 1).await.expect("check").allowed());
        assert!(!guard.check("ana", 2).await.expect("check").allowed());

        tokio::time::sleep(Duration::from_millis(40)).await;
        assert!(guard.check("ana", 3).await.expect("check").allowed());
    }

    /// Every call site holds this as `Arc<dyn FloodGuard>`, so a trait that
    /// could not be made into one would not be a seam at all.
    #[tokio::test]
    async fn the_port_is_object_safe() {
        let guard: Arc<dyn FloodGuard> = InMemoryFloodGuard::new(FloodPolicy {
            burst: 1,
            ..policy()
        });
        assert!(guard.check("ana", 1).await.expect("check").allowed());
        assert!(!guard.check("ana", 2).await.expect("check").allowed());
    }

    #[tokio::test]
    async fn a_permissive_guard_never_refuses() {
        let guard = PermissiveFloodGuard::new();
        for _ in 0..100 {
            assert!(guard.check("ana", 7).await.expect("check").allowed());
        }
    }
}
