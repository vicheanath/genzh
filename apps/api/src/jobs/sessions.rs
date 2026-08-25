//! Deleting refresh sessions nobody can use any more.

use std::time::Duration;

use async_trait::async_trait;
use genzh_auth::AuthService;
use genzh_cron::{CronJob, CronResult, Schedule};

/// Deletes refresh sessions whose expiry has passed.
///
/// Nothing depends on this running promptly: an expired session is already
/// refused the moment it is presented, so this reclaims rows rather than
/// enforcing anything. What it prevents is the table growing without bound in a
/// service that has been up for a year.
pub struct PruneExpiredSessions {
    auth: AuthService,
    interval: Duration,
}

impl PruneExpiredSessions {
    /// Prune every `interval`.
    pub fn new(auth: AuthService, interval: Duration) -> Self {
        Self { auth, interval }
    }
}

#[async_trait]
impl CronJob for PruneExpiredSessions {
    fn name(&self) -> &'static str {
        "auth.prune_expired_sessions"
    }

    fn schedule(&self) -> Schedule {
        Schedule::Every(self.interval)
    }

    async fn run(&self) -> CronResult<()> {
        let deleted = self.auth.sessions().prune_expired().await?;

        // Logged only when it did something: this runs hourly forever, and a
        // line every hour saying nothing happened is a line nobody reads.
        if deleted > 0 {
            tracing::info!(deleted, "pruned expired auth sessions");
        }

        Ok(())
    }
}
