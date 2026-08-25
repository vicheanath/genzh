//! Pruning old notifications to prevent unbounded growth.

use std::time::Duration;

use async_trait::async_trait;
use genzh_cron::{CronJob, CronResult, Schedule};
use genzh_notification::NotificationService;

/// Prunes old read and unread notifications past their retention windows.
pub struct PruneOldNotifications {
    notifications: NotificationService,
    interval: Duration,
    read_retention: Duration,
    unread_retention: Duration,
}

impl PruneOldNotifications {
    pub fn new(
        notifications: NotificationService,
        interval: Duration,
        read_retention: Duration,
        unread_retention: Duration,
    ) -> Self {
        Self {
            notifications,
            interval,
            read_retention,
            unread_retention,
        }
    }
}

#[async_trait]
impl CronJob for PruneOldNotifications {
    fn name(&self) -> &'static str {
        "notifications.prune_old"
    }

    fn schedule(&self) -> Schedule {
        Schedule::Every(self.interval)
    }

    async fn run(&self) -> CronResult<()> {
        let pruned = self
            .notifications
            .prune_stale(self.read_retention, self.unread_retention)
            .await?;

        if pruned > 0 {
            tracing::info!(pruned, "pruned old notifications");
        }

        Ok(())
    }
}
