//! Evicting participants who left without saying so.

use std::time::Duration;

use async_trait::async_trait;
use genzh_cron::{CronJob, CronResult, Schedule};
use genzh_room::RoomService;

/// Drops participants who stopped sending heartbeats, and ends the rooms that
/// leaves empty.
///
/// The clean path — somebody presses leave — already maintains all of this. The
/// unclean ones do not: a closed laptop lid, a dropped connection, a crashed
/// tab. Each leaves a participant row that makes a room look occupied, which is
/// what puts an empty room at the top of the discovery list.
pub struct PruneStaleParticipants {
    rooms: RoomService,
    interval: Duration,
    stale_after: Duration,
    empty_grace: Duration,
}

impl PruneStaleParticipants {
    /// Sweep every `interval`, evicting participants unheard from for
    /// `stale_after` and ending rooms empty for longer than `empty_grace`.
    pub fn new(
        rooms: RoomService,
        interval: Duration,
        stale_after: Duration,
        empty_grace: Duration,
    ) -> Self {
        Self {
            rooms,
            interval,
            stale_after,
            empty_grace,
        }
    }
}

#[async_trait]
impl CronJob for PruneStaleParticipants {
    fn name(&self) -> &'static str {
        "rooms.prune_stale_participants"
    }

    fn schedule(&self) -> Schedule {
        Schedule::Every(self.interval)
    }

    async fn run(&self) -> CronResult<()> {
        let outcome = self
            .rooms
            .prune_stale_participants(self.stale_after, self.empty_grace)
            .await?;

        if !outcome.is_empty() {
            tracing::info!(
                participants_removed = outcome.participants_removed,
                rooms_ended = outcome.rooms_ended,
                "pruned stale room participants"
            );
        }

        Ok(())
    }
}
