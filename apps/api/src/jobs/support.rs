//! Auto-closing stale support tickets.

use std::time::Duration;

use async_trait::async_trait;
use genzh_admin::SupportService;
use genzh_cron::{CronJob, CronResult, Schedule};

/// Automatically closes tickets that were marked resolved and received no updates.
pub struct AutoCloseStaleTickets {
    support: SupportService,
    interval: Duration,
    stale_after: Duration,
}

impl AutoCloseStaleTickets {
    pub fn new(support: SupportService, interval: Duration, stale_after: Duration) -> Self {
        Self {
            support,
            interval,
            stale_after,
        }
    }
}

#[async_trait]
impl CronJob for AutoCloseStaleTickets {
    fn name(&self) -> &'static str {
        "support.auto_close_stale"
    }

    fn schedule(&self) -> Schedule {
        Schedule::Every(self.interval)
    }

    async fn run(&self) -> CronResult<()> {
        let closed = self.support.auto_close_stale(self.stale_after).await?;

        if closed > 0 {
            tracing::info!(closed, "auto-closed stale support tickets");
        }

        Ok(())
    }
}
