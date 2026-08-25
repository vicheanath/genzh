//! Pruning dead and expired community invites.

use std::time::Duration;

use async_trait::async_trait;
use genzh_community::InviteService;
use genzh_cron::{CronJob, CronResult, Schedule};

/// Deletes expired, revoked, and exhausted community invites after retention.
pub struct PruneExpiredInvites {
    invites: InviteService,
    interval: Duration,
}

impl PruneExpiredInvites {
    pub fn new(invites: InviteService, interval: Duration) -> Self {
        Self { invites, interval }
    }
}

#[async_trait]
impl CronJob for PruneExpiredInvites {
    fn name(&self) -> &'static str {
        "invites.prune_expired"
    }

    fn schedule(&self) -> Schedule {
        Schedule::Every(self.interval)
    }

    async fn run(&self) -> CronResult<()> {
        let deleted = self.invites.prune_expired().await?;

        if deleted > 0 {
            tracing::info!(deleted, "pruned expired community invites");
        }

        Ok(())
    }
}
