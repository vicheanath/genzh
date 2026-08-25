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

pub mod sessions;
pub mod sweep;

use std::sync::Arc;

use genzh_cron::CronSchedulerResult;
use genzh_infrastructure::Sweep;

pub use sessions::PruneExpiredSessions;
pub use sweep::SweepVolatileStores;

use crate::state::AppState;

/// Register every background job against the state's scheduler.
///
/// Registering does not start anything; the caller decides when ticking
/// begins, which is what keeps jobs from firing against a half-built process.
pub async fn register(state: &AppState) -> CronSchedulerResult<()> {
    let timings = &state.config.cron;

    state
        .scheduler
        .register(Arc::new(PruneExpiredSessions::new(
            state.auth.clone(),
            timings.session_prune_interval,
        )))
        .await?;

    // Upcast from the ports the state already holds — `Sweep` is a supertrait
    // of both — so nothing here has to know that the limiters behind them are
    // the in-memory implementations, or be handed a second reference to prove
    // it.
    let stores: Vec<Arc<dyn Sweep>> = vec![
        Arc::clone(&state.rate_limiter) as Arc<dyn Sweep>,
        Arc::clone(&state.auth_rate_limiter) as Arc<dyn Sweep>,
        Arc::clone(&state.flood) as Arc<dyn Sweep>,
    ];

    state
        .scheduler
        .register(Arc::new(SweepVolatileStores::new(
            stores,
            timings.store_sweep_interval,
        )))
        .await?;

    Ok(())
}
