//! What each job has been doing.
//!
//! Separate from the scheduler because it changes for its own reasons: what a
//! run *cost* is a different question from when the next one fires, and the
//! admin telemetry screen reads this without caring that a scheduler exists.

use std::collections::HashMap;
use std::time::Duration;

use chrono::{DateTime, Utc};
use parking_lot::RwLock;

/// What one job's history looks like right now.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct JobStats {
    /// How many times the job has been executed.
    pub total_runs: u64,
    /// How many of those returned `Ok`.
    pub successes: u64,
    /// How many of those returned `Err`.
    pub failures: u64,
    /// When the most recent run finished.
    ///
    /// A wall-clock timestamp rather than an `Instant` so it can be rendered:
    /// an `Instant` is only comparable to another one from the same process,
    /// which is no use to an operator reading a dashboard.
    pub last_run_at: Option<DateTime<Utc>>,
    /// How long the most recent run took.
    pub last_duration: Option<Duration>,
    /// What the most recent run failed with; cleared by the next success.
    pub last_error: Option<String>,
}

impl JobStats {
    /// Whether the most recent run failed.
    pub fn is_failing(&self) -> bool {
        self.last_error.is_some()
    }
}

/// Records the outcome of every job execution.
#[derive(Debug, Default)]
pub struct CronMetrics {
    stats: RwLock<HashMap<&'static str, JobStats>>,
}

impl CronMetrics {
    /// An empty recorder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Start tracking `name`, so a registered job that has not run yet still
    /// appears in a snapshot with zeroes rather than being absent from it.
    pub fn track(&self, name: &'static str) {
        self.stats.write().entry(name).or_default();
    }

    /// Record a run that succeeded.
    pub fn record_success(&self, name: &'static str, elapsed: Duration) {
        self.record(name, elapsed, None);
    }

    /// Record a run that failed, with the message it failed with.
    pub fn record_failure(&self, name: &'static str, elapsed: Duration, error: String) {
        self.record(name, elapsed, Some(error));
    }

    fn record(&self, name: &'static str, elapsed: Duration, error: Option<String>) {
        let mut stats = self.stats.write();
        let entry = stats.entry(name).or_default();

        entry.total_runs += 1;
        entry.last_run_at = Some(Utc::now());
        entry.last_duration = Some(elapsed);

        match error {
            None => {
                entry.successes += 1;
                entry.last_error = None;
            }
            Some(message) => {
                entry.failures += 1;
                entry.last_error = Some(message);
            }
        }
    }

    /// Every job's statistics, as of now.
    pub fn snapshot(&self) -> HashMap<&'static str, JobStats> {
        self.stats.read().clone()
    }

    /// One job's statistics, if it is tracked.
    pub fn get(&self, name: &str) -> Option<JobStats> {
        self.stats.read().get(name).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn success_clears_the_previous_error() {
        let metrics = CronMetrics::new();
        metrics.record_failure("job", Duration::from_millis(1), "boom".into());
        metrics.record_success("job", Duration::from_millis(2));

        let stats = metrics.get("job").expect("tracked");
        assert_eq!(stats.total_runs, 2);
        assert_eq!(stats.successes, 1);
        assert_eq!(stats.failures, 1);
        assert!(!stats.is_failing());
    }

    #[test]
    fn tracking_a_job_makes_it_visible_before_it_runs() {
        let metrics = CronMetrics::new();
        metrics.track("job");

        assert_eq!(metrics.get("job"), Some(JobStats::default()));
        assert!(metrics.snapshot().contains_key("job"));
    }
}
