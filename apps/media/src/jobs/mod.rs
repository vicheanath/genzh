//! The recurring work the media plane owes itself.
//!
//! One job today. It lives in a module anyway, for the same reason the API's
//! do: a job is a type with a `run` on it that a test can call, and the twenty
//! lines of `select!` this replaces were neither testable nor reusable.

pub mod prune;

use std::sync::Arc;

use genzh_cron::{CronScheduler, CronSchedulerResult};

pub use prune::PruneAbandonedRooms;

use crate::state::MediaState;

/// Register every background job this process runs.
///
/// The scheduler is passed in rather than held on [`MediaState`]: nothing that
/// serves a request has any business with it, and the media plane has no admin
/// surface that would want to read job statistics.
pub async fn register(scheduler: &CronScheduler, state: &MediaState) -> CronSchedulerResult<()> {
    scheduler
        .register(Arc::new(PruneAbandonedRooms::new(
            Arc::clone(&state.rooms),
            state.config.prune_interval,
        )))
        .await
}
