//! Expiring temporary/ephemeral rooms whose duration has passed.

use std::time::Duration;

use async_trait::async_trait;
use genzh_cron::{CronJob, CronResult, Schedule};
use genzh_room::RoomService;

/// Automatically closes and ends ephemeral rooms whose duration has expired.
pub struct ExpireEphemeralRooms {
    rooms: RoomService,
    interval: Duration,
}

impl ExpireEphemeralRooms {
    pub fn new(rooms: RoomService, interval: Duration) -> Self {
        Self { rooms, interval }
    }
}

#[async_trait]
impl CronJob for ExpireEphemeralRooms {
    fn name(&self) -> &'static str {
        "rooms.expire_ephemeral"
    }

    fn schedule(&self) -> Schedule {
        Schedule::Every(self.interval)
    }

    async fn run(&self) -> CronResult<()> {
        let expired = self.rooms.expire_ephemeral_rooms().await?;

        if expired > 0 {
            tracing::info!(expired, "expired ephemeral rooms");
        }

        Ok(())
    }
}
