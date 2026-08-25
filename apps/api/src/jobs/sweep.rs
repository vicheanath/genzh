//! Reclaiming in-process maps that only grow while traffic arrives.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use genzh_cron::{CronJob, CronResult, Schedule};
use genzh_infrastructure::Sweep;

/// Sweeps every volatile store that has entries worth expiring.
///
/// Holds `Arc<dyn Sweep>` rather than the concrete limiters: the job's whole
/// interest in a store is that it can be asked to let go of things, and taking
/// the trait is what keeps the in-memory implementations from being named
/// anywhere except the wiring. Pointing them at a shared store later changes
/// what this receives and not what it does — for a Redis-backed limiter that is
/// a no-op sweep, which the default implementation already provides.
pub struct SweepVolatileStores {
    stores: Vec<Arc<dyn Sweep>>,
    interval: Duration,
}

impl SweepVolatileStores {
    /// Sweep `stores` every `interval`.
    pub fn new(stores: Vec<Arc<dyn Sweep>>, interval: Duration) -> Self {
        Self { stores, interval }
    }
}

#[async_trait]
impl CronJob for SweepVolatileStores {
    fn name(&self) -> &'static str {
        "stores.sweep_volatile"
    }

    fn schedule(&self) -> Schedule {
        Schedule::Every(self.interval)
    }

    async fn run(&self) -> CronResult<()> {
        for store in &self.stores {
            let reclaimed = store.sweep_stale();
            if reclaimed > 0 {
                tracing::debug!(store = store.label(), reclaimed, "swept volatile store");
            }
        }

        Ok(())
    }
}
