//! Reclaiming rooms whose participants never said goodbye.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use genzh_cron::{CronJob, CronResult, Schedule};
use genzh_media_room::MediaRoomManager;

/// Closes peer connections that are already dead and destroys the rooms that
/// leaves empty.
///
/// A participant who leaves properly is cleaned up on the way out. One whose
/// connection failed is not: nothing arrives to say so, and the room stays in
/// the registry holding its forwarding tasks open. On a media server that is
/// not a leaked row, it is leaked sockets.
pub struct PruneAbandonedRooms {
    rooms: Arc<MediaRoomManager>,
    interval: Duration,
}

impl PruneAbandonedRooms {
    /// Sweep every `interval`.
    pub fn new(rooms: Arc<MediaRoomManager>, interval: Duration) -> Self {
        Self { rooms, interval }
    }
}

#[async_trait]
impl CronJob for PruneAbandonedRooms {
    fn name(&self) -> &'static str {
        "sfu.prune_abandoned_rooms"
    }

    fn schedule(&self) -> Schedule {
        Schedule::Every(self.interval)
    }

    async fn run(&self) -> CronResult<()> {
        let report = self.rooms.prune().await;

        if !report.is_empty() {
            tracing::info!(
                rooms_removed = report.rooms_removed,
                participants_removed = report.participants_removed,
                "pruned abandoned media rooms"
            );
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use genzh_media_room::room::RoomConfig;

    #[tokio::test]
    async fn a_sweep_of_an_idle_server_succeeds_and_reclaims_nothing() {
        let job = PruneAbandonedRooms::new(
            MediaRoomManager::new(RoomConfig::default()),
            Duration::from_secs(30),
        );

        assert!(job.run().await.is_ok());
        assert_eq!(job.rooms.room_count().await, 0);
    }
}
