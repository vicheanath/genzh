//! Running registered jobs on time.
//!
//! # Why this wraps a crate instead of a loop
//!
//! A `tokio::time::interval` in a `select!` is about fifteen lines and gets a
//! service to its first release. What it does not get you is a cron expression,
//! a catch-up policy for a tick missed while the process was busy, or one place
//! to ask what the background work has been doing — and each of those arrives
//! as another hand-written loop somewhere else in the tree, each with its own
//! shutdown bug. [`tokio_cron_scheduler`] already solves the timing, so this
//! module solves only the part that is ours: turning a [`CronJob`] into
//! something it can run, and recording what happened when it did.
//!
//! So the wrapper is deliberately thin, and deliberately not absent. Callers
//! depend on [`CronJob`] — a trait this workspace owns — rather than on
//! `Job::new_repeated_async`, which means replacing the scheduler underneath is
//! a change to this file and to nothing else.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use parking_lot::RwLock;
use tokio_cron_scheduler::{Job, JobScheduler, JobSchedulerError};

use crate::job::{CronJob, CronResult, FnJob, Schedule};
use crate::metrics::{CronMetrics, JobStats};

/// Something went wrong scheduling — not running — a job.
#[derive(Debug, thiserror::Error)]
pub enum CronSchedulerError {
    /// The scheduler underneath refused.
    #[error("cron scheduler failed: {0}")]
    Backend(#[from] JobSchedulerError),

    /// Two jobs claimed the same name.
    ///
    /// Rejected rather than silently accepted because the name is the key
    /// statistics are recorded under: a duplicate would report two jobs' runs
    /// as one job's, which is worse than not starting.
    #[error("a cron job named {0} is already registered")]
    DuplicateJob(&'static str),
}

/// Result alias for scheduling operations.
pub type CronSchedulerResult<T> = Result<T, CronSchedulerError>;

/// Runs [`CronJob`]s on their schedules and records how they went.
pub struct CronScheduler {
    inner: JobScheduler,
    jobs: RwLock<HashMap<&'static str, Arc<dyn CronJob>>>,
    metrics: Arc<CronMetrics>,
}

impl std::fmt::Debug for CronScheduler {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CronScheduler")
            .field("jobs", &self.jobs.read().keys().collect::<Vec<_>>())
            .finish_non_exhaustive()
    }
}

impl CronScheduler {
    /// Build a scheduler with nothing registered on it.
    pub async fn new() -> CronSchedulerResult<Self> {
        Ok(Self {
            inner: JobScheduler::new().await?,
            jobs: RwLock::new(HashMap::new()),
            metrics: Arc::new(CronMetrics::new()),
        })
    }

    /// Register a job. Takes effect at the next tick after [`Self::start`].
    ///
    /// Registering after starting is allowed and is how a job that depends on
    /// something built later gets added without reordering the wiring.
    pub async fn register(&self, job: Arc<dyn CronJob>) -> CronSchedulerResult<()> {
        let name = job.name();
        if self.jobs.read().contains_key(name) {
            return Err(CronSchedulerError::DuplicateJob(name));
        }

        let schedule = job.schedule();
        let metrics = Arc::clone(&self.metrics);
        let runner = Arc::clone(&job);

        // Rebuilt per tick rather than captured once, because the scheduler
        // hands the closure out repeatedly and each run needs its own future.
        let tick = move |_id, _scheduler| {
            let job = Arc::clone(&runner);
            let metrics = Arc::clone(&metrics);
            Box::pin(async move {
                execute(job, metrics).await;
            }) as crate::job::BoxFuture<'static, ()>
        };

        let scheduled = match &schedule {
            Schedule::Every(period) => Job::new_repeated_async(*period, tick)?,
            Schedule::Cron(expression) => Job::new_cron_job_async(expression.as_str(), tick)?,
        };

        self.inner.add(scheduled).await?;
        self.metrics.track(name);
        self.jobs.write().insert(name, job);

        tracing::info!(job = name, ?schedule, "cron job registered");
        Ok(())
    }

    /// Register a closure as a job. See [`FnJob`].
    pub async fn register_fn<F, Fut>(
        &self,
        name: &'static str,
        schedule: Schedule,
        run: F,
    ) -> CronSchedulerResult<()>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = CronResult<()>> + Send + 'static,
    {
        self.register(Arc::new(FnJob::new(name, schedule, run)))
            .await
    }

    /// Begin ticking. Returns as soon as the background worker is running.
    pub async fn start(&self) -> CronSchedulerResult<()> {
        self.inner.start().await?;
        tracing::info!(jobs = self.jobs.read().len(), "cron scheduler started");
        Ok(())
    }

    /// Stop ticking and let in-flight jobs finish.
    ///
    /// Takes `&self` rather than `self` because the scheduler is shared through
    /// an `Arc` for the lifetime of the process; shutdown is the one thing that
    /// happens to it from outside that shared ownership.
    pub async fn shutdown(&self) -> CronSchedulerResult<()> {
        let mut inner = self.inner.clone();
        inner.shutdown().await?;
        tracing::info!("cron scheduler stopped");
        Ok(())
    }

    /// Run one job right now, outside its schedule, and report what it returned.
    ///
    /// `None` if no job by that name is registered. Statistics are recorded the
    /// same way a scheduled run would be, so a manual trigger from the admin
    /// console shows up in the same place.
    pub async fn run_now(&self, name: &str) -> Option<CronResult<()>> {
        let job = self.jobs.read().get(name).map(Arc::clone)?;
        Some(run_recorded(job, &self.metrics).await)
    }

    /// The names of every registered job.
    pub fn job_names(&self) -> Vec<&'static str> {
        let mut names: Vec<&'static str> = self.jobs.read().keys().copied().collect();
        names.sort_unstable();
        names
    }

    /// Statistics for every registered job.
    pub fn stats(&self) -> HashMap<&'static str, JobStats> {
        self.metrics.snapshot()
    }

    /// Statistics for one job, if it is registered.
    pub fn job_stats(&self, name: &str) -> Option<JobStats> {
        self.metrics.get(name)
    }
}

/// Run a job, record the outcome, and log it. Never propagates the failure:
/// one bad pass must not take the ticker down with it.
async fn execute(job: Arc<dyn CronJob>, metrics: Arc<CronMetrics>) {
    let name = job.name();
    tracing::debug!(job = name, "cron job starting");

    match run_recorded(job, &metrics).await {
        Ok(()) => tracing::debug!(job = name, "cron job finished"),
        Err(error) => tracing::error!(job = name, %error, "cron job failed"),
    }
}

/// Execute one pass and write the timing and outcome to `metrics`.
async fn run_recorded(job: Arc<dyn CronJob>, metrics: &CronMetrics) -> CronResult<()> {
    let name = job.name();
    let started = Instant::now();
    let outcome = job.run().await;
    let elapsed = started.elapsed();

    match &outcome {
        Ok(()) => metrics.record_success(name, elapsed),
        Err(error) => metrics.record_failure(name, elapsed, error.to_string()),
    }

    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::job::CronResult;
    use async_trait::async_trait;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    struct Counting {
        runs: Arc<AtomicUsize>,
        fail: bool,
    }

    #[async_trait]
    impl CronJob for Counting {
        fn name(&self) -> &'static str {
            "counting"
        }

        fn schedule(&self) -> Schedule {
            Schedule::Every(Duration::from_millis(100))
        }

        async fn run(&self) -> CronResult<()> {
            self.runs.fetch_add(1, Ordering::SeqCst);
            if self.fail {
                return Err("deliberate".into());
            }
            Ok(())
        }
    }

    #[tokio::test]
    async fn run_now_executes_the_job_and_records_it() {
        let scheduler = CronScheduler::new().await.expect("scheduler");
        let runs = Arc::new(AtomicUsize::new(0));

        scheduler
            .register(Arc::new(Counting {
                runs: Arc::clone(&runs),
                fail: false,
            }))
            .await
            .expect("register");

        assert!(scheduler.run_now("counting").await.expect("found").is_ok());
        assert_eq!(runs.load(Ordering::SeqCst), 1);

        let stats = scheduler.job_stats("counting").expect("tracked");
        assert_eq!(stats.successes, 1);
        assert!(stats.last_run_at.is_some());
    }

    #[tokio::test]
    async fn a_failing_job_is_recorded_rather_than_propagated() {
        let scheduler = CronScheduler::new().await.expect("scheduler");

        scheduler
            .register(Arc::new(Counting {
                runs: Arc::new(AtomicUsize::new(0)),
                fail: true,
            }))
            .await
            .expect("register");

        assert!(scheduler.run_now("counting").await.expect("found").is_err());

        let stats = scheduler.job_stats("counting").expect("tracked");
        assert_eq!(stats.failures, 1);
        assert_eq!(stats.last_error.as_deref(), Some("deliberate"));
    }

    #[tokio::test]
    async fn an_unknown_job_is_not_run() {
        let scheduler = CronScheduler::new().await.expect("scheduler");
        assert!(scheduler.run_now("nothing").await.is_none());
    }

    #[tokio::test]
    async fn a_duplicate_name_is_refused() {
        let scheduler = CronScheduler::new().await.expect("scheduler");
        let job = || {
            Arc::new(Counting {
                runs: Arc::new(AtomicUsize::new(0)),
                fail: false,
            })
        };

        scheduler.register(job()).await.expect("first");
        let second = scheduler.register(job()).await;

        assert!(matches!(
            second,
            Err(CronSchedulerError::DuplicateJob("counting"))
        ));
        assert_eq!(scheduler.job_names(), vec!["counting"]);
    }

    #[tokio::test]
    async fn a_registered_job_ticks_until_shutdown() {
        let scheduler = CronScheduler::new().await.expect("scheduler");
        let runs = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&runs);

        scheduler
            .register_fn(
                "closure",
                Schedule::Every(Duration::from_millis(100)),
                move || {
                    let counter = Arc::clone(&counter);
                    async move {
                        counter.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    }
                },
            )
            .await
            .expect("register");

        scheduler.start().await.expect("start");
        tokio::time::sleep(Duration::from_millis(900)).await;
        scheduler.shutdown().await.expect("shutdown");

        let after_shutdown = runs.load(Ordering::SeqCst);
        assert!(after_shutdown >= 1, "job never ran");

        tokio::time::sleep(Duration::from_millis(400)).await;
        assert_eq!(
            runs.load(Ordering::SeqCst),
            after_shutdown,
            "job kept running after shutdown"
        );
    }
}
