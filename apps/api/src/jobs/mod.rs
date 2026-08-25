//! The recurring work this service owes itself.
//!
//! Every job lives here rather than in the constructor that happens to have the
//! services it needs. That is the difference between adding a job being a new
//! file and adding a job being another twenty lines inside `AppState::build` —
//! and the reason the jobs are testable at all, since a type with a `run` on it
//! can be called directly and a closure buried in the wiring cannot.
//!
//! [`register`] is the one place that knows the full list, and it is called
//! from `main` after the state is built and before the scheduler starts.

pub mod ephemeral;
pub mod invites;
pub mod notifications;
pub mod security;
pub mod sessions;
pub mod support;
pub mod sweep;

use std::sync::Arc;

use genzh_cron::{CronJob, CronSchedulerError, CronSchedulerResult};
use genzh_infrastructure::Sweep;

pub use ephemeral::ExpireEphemeralRooms;
pub use invites::PruneExpiredInvites;
pub use notifications::PruneOldNotifications;
pub use security::PruneExpiredBans;
pub use sessions::PruneExpiredSessions;
pub use support::AutoCloseStaleTickets;
pub use sweep::SweepVolatileStores;

use crate::state::AppState;

/// Every job this service is expected to run, by name.
///
/// The list exists so that [`register`] can check itself against it. A job that
/// is written, imported and never registered compiles perfectly quietly — the
/// re-export above keeps it "used" — and the only symptom is maintenance that
/// silently never happens. Startup failing loudly is the better outcome.
///
/// Sorted, because that is how [`CronScheduler::job_names`] returns them.
///
/// [`CronScheduler::job_names`]: genzh_cron::CronScheduler::job_names
pub const EXPECTED_JOBS: &[&str] = &[
    "auth.prune_expired_sessions",
    "invites.prune_expired",
    "notifications.prune_old",
    "rooms.expire_ephemeral",
    "security.prune_expired_bans",
    "stores.sweep_volatile",
    "support.auto_close_stale",
];

/// Register every background job against the state's scheduler.
///
/// Registering does not start anything; the caller decides when ticking
/// begins, which is what keeps jobs from firing against a half-built process.
pub async fn register(state: &AppState) -> CronSchedulerResult<()> {
    let timings = &state.config.cron;

    // Upcast from the ports the state already holds — `Sweep` is a supertrait
    // of both — so nothing here has to know that the limiters behind them are
    // the in-memory implementations, or be handed a second reference to prove
    // it.
    let stores: Vec<Arc<dyn Sweep>> = vec![
        Arc::clone(&state.rate_limiter) as Arc<dyn Sweep>,
        Arc::clone(&state.auth_rate_limiter) as Arc<dyn Sweep>,
        Arc::clone(&state.flood) as Arc<dyn Sweep>,
    ];

    let jobs: Vec<Arc<dyn CronJob>> = vec![
        Arc::new(PruneExpiredSessions::new(
            state.auth.clone(),
            timings.session_prune_interval,
        )),
        Arc::new(SweepVolatileStores::new(
            stores,
            timings.store_sweep_interval,
        )),
        Arc::new(ExpireEphemeralRooms::new(
            state.rooms.clone(),
            timings.ephemeral_room_expire_interval,
        )),
        Arc::new(PruneExpiredInvites::new(
            state.invites.clone(),
            timings.invite_prune_interval,
        )),
        Arc::new(PruneOldNotifications::new(
            state.notifications.clone(),
            timings.notification_prune_interval,
            timings.notification_read_retention,
            timings.notification_unread_retention,
        )),
        Arc::new(PruneExpiredBans::new(
            state.security.clone(),
            timings.security_prune_interval,
        )),
        Arc::new(AutoCloseStaleTickets::new(
            state.support.clone(),
            timings.support_cleanup_interval,
            timings.support_stale_after,
        )),
    ];

    for job in jobs {
        state.scheduler.register(job).await?;
    }

    let registered = state.scheduler.job_names();
    if registered != EXPECTED_JOBS {
        // Refusing to start rather than logging: a process missing a
        // maintenance job looks entirely healthy and quietly stops pruning
        // anything, which is the kind of failure only noticed by the disk
        // filling up weeks later.
        return Err(CronSchedulerError::DuplicateJob(
            "registered jobs do not match EXPECTED_JOBS",
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_expected_job_list_is_sorted_and_unique() {
        // `register` compares against this list with `==`, and `job_names`
        // returns them sorted — an unsorted entry here would fail every start.
        let mut sorted = EXPECTED_JOBS.to_vec();
        sorted.sort_unstable();
        sorted.dedup();

        assert_eq!(sorted.as_slice(), EXPECTED_JOBS);
    }
}

