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
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};

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

/// How long [`CronScheduler::shutdown`] waits for work already running.
///
/// Bounded rather than unlimited: a job wedged on a hung connection must not
/// hold the process open forever. Exceeding it is logged and shutdown proceeds,
/// which is the honest trade — a warning an operator can see beats a service
/// that will not stop.
const DRAIN_TIMEOUT: Duration = Duration::from_secs(5);

/// Whether the schedule is still running, and how much work is in flight.
///
/// Exists because [`JobScheduler::shutdown`] does neither of the things its
/// name suggests: it sets a flag and returns, without stopping the ticker
/// synchronously or waiting for jobs already dispatched. A job can therefore
/// still start — and finish — after `shutdown().await` has returned, which for
/// a job holding a database handle means running against a pool the process is
/// busy closing. It is not theoretical; it is what made the shutdown test here
/// fail under load.
///
/// This turns the claim into a real barrier: `stopped` refuses new scheduled
/// runs, and `in_flight` is what [`CronScheduler::shutdown`] waits on.
#[derive(Debug, Default)]
struct RunState {
    stopped: AtomicBool,
    in_flight: AtomicUsize,
}

/// Runs [`CronJob`]s on their schedules and records how they went.
pub struct CronScheduler {
    inner: JobScheduler,
    jobs: RwLock<HashMap<&'static str, Arc<dyn CronJob>>>,
    metrics: Arc<CronMetrics>,
    state: Arc<RunState>,
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
            state: Arc::new(RunState::default()),
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
        let state = Arc::clone(&self.state);

        // Rebuilt per tick rather than captured once, because the scheduler
        // hands the closure out repeatedly and each run needs its own future.
        let tick = move |_id, _scheduler| {
            let job = Arc::clone(&runner);
            let metrics = Arc::clone(&metrics);
            let state = Arc::clone(&state);
            Box::pin(async move {
                execute(job, metrics, state).await;
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

    /// Stop ticking and wait for in-flight jobs to finish.
    ///
    /// Once this returns, no scheduled job is running or will start — which is
    /// what makes it safe to close the database pool afterwards. See
    /// [`RunState`] for why that needs enforcing here rather than being
    /// inherited from the scheduler underneath.
    ///
    /// Takes `&self` rather than `self` because the scheduler is shared through
    /// an `Arc` for the lifetime of the process; shutdown is the one thing that
    /// happens to it from outside that shared ownership.
    pub async fn shutdown(&self) -> CronSchedulerResult<()> {
        // Ordered deliberately: refuse new runs *before* asking the scheduler
        // to stop. The reverse leaves a window where the ticker has not yet
        // seen its own flag and this one is not set either, and that is exactly
        // the dispatch that outlives shutdown.
        self.state.stopped.store(true, Ordering::SeqCst);

        let mut inner = self.inner.clone();
        inner.shutdown().await?;

        if self.drain().await {
            tracing::info!("cron scheduler stopped");
        } else {
            tracing::warn!(
                in_flight = self.state.in_flight.load(Ordering::SeqCst),
                timeout = ?DRAIN_TIMEOUT,
                "cron scheduler stopped with jobs still running"
            );
        }

        Ok(())
    }

    /// Wait for in-flight jobs, up to [`DRAIN_TIMEOUT`]. `false` on timeout.
    ///
    /// Polled rather than notified: the count is the only shared state, and a
    /// `Notify` would have to be woken from every job's exit path — more
    /// machinery to get wrong for a wait that happens once per process.
    async fn drain(&self) -> bool {
        let deadline = Instant::now() + DRAIN_TIMEOUT;

        while self.state.in_flight.load(Ordering::SeqCst) > 0 {
            if Instant::now() >= deadline {
                return false;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }

        true
    }

    /// Whether the schedule has been stopped.
    pub fn is_stopped(&self) -> bool {
        self.state.stopped.load(Ordering::SeqCst)
    }

    /// How many job runs are executing right now.
    pub fn in_flight(&self) -> usize {
        self.state.in_flight.load(Ordering::SeqCst)
    }

    /// Run one job right now, outside its schedule, and report what it returned.
    ///
    /// `None` if no job by that name is registered. Statistics are recorded the
    /// same way a scheduled run would be, so a manual trigger from the admin
    /// console shows up in the same place.
    pub async fn run_now(&self, name: &str) -> Option<CronResult<()>> {
        let job = self.jobs.read().get(name).map(Arc::clone)?;

        // Counted, but not gated on `stopped`: a run somebody explicitly asked
        // for should finish, and shutdown should wait for it. It is the
        // *schedule* that stops, not an outstanding request.
        let _guard = InFlight::enter(Arc::clone(&self.state));
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

/// Keeps the in-flight count correct across early returns and panics.
///
/// A bare increment/decrement pair would leak the count if a job panicked
/// between them, and a leaked count makes every later shutdown wait out the
/// full timeout.
struct InFlight(Arc<RunState>);

impl InFlight {
    fn enter(state: Arc<RunState>) -> Self {
        state.in_flight.fetch_add(1, Ordering::SeqCst);
        Self(state)
    }
}

impl Drop for InFlight {
    fn drop(&mut self) {
        self.0.in_flight.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Run a job, record the outcome, and log it. Never propagates the failure:
/// one bad pass must not take the ticker down with it.
async fn execute(job: Arc<dyn CronJob>, metrics: Arc<CronMetrics>, state: Arc<RunState>) {
    let name = job.name();

    if state.stopped.load(Ordering::SeqCst) {
        tracing::debug!(job = name, "cron job skipped: scheduler is stopping");
        return;
    }

    let guard = InFlight::enter(Arc::clone(&state));

    // Re-checked after claiming the slot. Without this there is a window —
    // flag reads false, then shutdown sets it and reads a zero count, then this
    // increments — where shutdown believes it drained and the job runs anyway.
    // Claiming first and re-reading closes it: either shutdown sees the count,
    // or this sees the flag.
    if state.stopped.load(Ordering::SeqCst) {
        drop(guard);
        tracing::debug!(job = name, "cron job skipped: scheduler stopped mid-dispatch");
        return;
    }

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

    /// Wait for `condition`, or give up after `limit`.
    ///
    /// Polled rather than slept-through. A fixed sleep has to be long enough
    /// for the slowest machine that will ever run it, which makes the suite
    /// slow everywhere and *still* flaky on a loaded CI box — this test failed
    /// exactly that way, passing alone and failing under a full parallel run.
    async fn within(limit: Duration, condition: impl Fn() -> bool) -> bool {
        let deadline = std::time::Instant::now() + limit;
        while std::time::Instant::now() < deadline {
            if condition() {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        condition()
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

        // Generous, because the assertion is "it ticks at all", not "it ticks
        // within 900ms" — the scheduler underneath wakes on its own cadence and
        // pinning that would be testing somebody else's implementation.
        assert!(
            within(Duration::from_secs(10), || runs.load(Ordering::SeqCst) > 0).await,
            "the job never ran"
        );

        scheduler.shutdown().await.expect("shutdown");

        // No settling period, deliberately. The guarantee under test is that
        // *once shutdown returns* nothing more runs — which is what makes it
        // safe to close the database pool on the next line of `main`. Sleeping
        // first would test a weaker claim and hide the very race this had.
        let baseline = runs.load(Ordering::SeqCst);
        assert_eq!(scheduler.in_flight(), 0, "shutdown returned with work running");
        assert!(scheduler.is_stopped());

        // Many tick intervals. The job fires every 100ms, so a ticker still
        // running would be caught several times over.
        tokio::time::sleep(Duration::from_millis(800)).await;
        assert_eq!(
            runs.load(Ordering::SeqCst),
            baseline,
            "a job ran after shutdown returned"
        );
    }

    #[tokio::test]
    async fn shutdown_waits_for_a_job_that_is_already_running() {
        // The other half of the guarantee: a job mid-flight is not abandoned,
        // it is waited for. Otherwise "nothing is running" would be true only
        // because the run was cut off partway through whatever it was writing.
        let scheduler = CronScheduler::new().await.expect("scheduler");
        let finished = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&finished);

        scheduler
            .register_fn("slow", Schedule::Every(Duration::from_millis(100)), move || {
                let counter = Arc::clone(&counter);
                async move {
                    tokio::time::sleep(Duration::from_millis(400)).await;
                    counter.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            })
            .await
            .expect("register");

        scheduler.start().await.expect("start");

        assert!(
            within(Duration::from_secs(10), || scheduler.in_flight() > 0).await,
            "the job never started"
        );

        scheduler.shutdown().await.expect("shutdown");

        assert_eq!(
            finished.load(Ordering::SeqCst),
            1,
            "shutdown returned before the running job finished"
        );
        assert_eq!(scheduler.in_flight(), 0);
    }
}
