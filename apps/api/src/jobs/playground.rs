//! Ending throwaway rooms that everybody has left.
//!
//! The playground half of the product promises rooms you leave rather than
//! rooms you keep. Two things end one: its duration running out, which
//! [`ExpireEphemeralRooms`] handles, and the last person walking out, which is
//! this.
//!
//! Note what this job deliberately does *not* do: it never touches
//! `room_participants`. Stale participant rows — a lid closed mid-call, a
//! process killed — are left to the room's TTL, because every playground room
//! now has one. Reaping participants across the whole table is a separate
//! decision that has been made and stands.
//!
//! [`ExpireEphemeralRooms`]: super::ExpireEphemeralRooms

use std::time::Duration;

use async_trait::async_trait;
use genzh_cron::{CronJob, CronResult, Schedule};
use genzh_room::RoomService;

/// Ends standalone public rooms that have sat empty past the grace period.
pub struct ReapEmptyPlaygroundRooms {
    rooms: RoomService,
    interval: Duration,
    grace: Duration,
}

impl ReapEmptyPlaygroundRooms {
    pub fn new(rooms: RoomService, interval: Duration, grace: Duration) -> Self {
        Self {
            rooms,
            interval,
            grace,
        }
    }
}

#[async_trait]
impl CronJob for ReapEmptyPlaygroundRooms {
    fn name(&self) -> &'static str {
        "rooms.reap_empty_playground"
    }

    fn schedule(&self) -> Schedule {
        Schedule::Every(self.interval)
    }

    async fn run(&self) -> CronResult<()> {
        let ended = self.rooms.end_empty_playground_rooms(self.grace).await?;

        if ended > 0 {
            tracing::info!(ended, "ended empty playground rooms");
        }

        Ok(())
    }
}
