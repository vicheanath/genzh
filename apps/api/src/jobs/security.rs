//! Pruning expired IP and CIDR bans.

use std::time::Duration;

use async_trait::async_trait;
use genzh_admin::SecurityService;
use genzh_cron::{CronJob, CronResult, Schedule};

/// Cleans up expired temporary IP bans.
pub struct PruneExpiredBans {
    security: SecurityService,
    interval: Duration,
}

impl PruneExpiredBans {
    pub fn new(security: SecurityService, interval: Duration) -> Self {
        Self { security, interval }
    }
}

#[async_trait]
impl CronJob for PruneExpiredBans {
    fn name(&self) -> &'static str {
        "security.prune_expired_bans"
    }

    fn schedule(&self) -> Schedule {
        Schedule::Every(self.interval)
    }

    async fn run(&self) -> CronResult<()> {
        let pruned = self.security.prune_expired_bans().await?;

        if pruned > 0 {
            tracing::info!(pruned, "pruned expired IP bans");
        }

        Ok(())
    }
}
