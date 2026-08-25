//! What a recurring job is, independent of what runs it.
//!
//! Nothing in this file knows about timers, tasks or the scheduler crate
//! underneath. A job says what it is called, how often it wants to run, and
//! what to do — and that is the whole contract, which is why the jobs
//! themselves live in the applications that own the work rather than here.

use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use async_trait::async_trait;

/// Whatever a job failed with.
///
/// Boxed rather than an enum: the scheduler logs the message and moves on, and
/// a shared error type would force every crate that owns a job to make its
/// errors convertible into one that lives here.
pub type CronError = Box<dyn std::error::Error + Send + Sync>;

/// Result alias for one pass of a job.
pub type CronResult<T> = Result<T, CronError>;

/// A pinned boxed future, for job adapters that have to name one.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// When a job runs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Schedule {
    /// A fixed delay between runs, starting one delay after the scheduler does.
    ///
    /// What maintenance sweeps want: the interesting property is "not longer
    /// than this since the last one", not the wall-clock time it happens at.
    Every(Duration),

    /// A six-field cron expression in UTC — `sec min hour dom month dow`.
    ///
    /// For work that has to land at a time a human chose: a nightly compaction
    /// that should run while nobody is awake, not merely every 24 hours from
    /// whenever the process last restarted.
    Cron(String),
}

impl Schedule {
    /// Run every `secs` seconds.
    pub const fn every_secs(secs: u64) -> Self {
        Self::Every(Duration::from_secs(secs))
    }

    /// Run every `mins` minutes.
    pub const fn every_mins(mins: u64) -> Self {
        Self::Every(Duration::from_secs(mins * 60))
    }

    /// Run on a six-field UTC cron expression.
    pub fn cron(expression: impl Into<String>) -> Self {
        Self::Cron(expression.into())
    }
}

/// A unit of recurring background work.
#[async_trait]
pub trait CronJob: Send + Sync + 'static {
    /// Stable identifier, used as the key for logs and statistics.
    ///
    /// `&'static str` because it names a job that exists in the source, not one
    /// configured at runtime; that also makes it free to use as a map key.
    fn name(&self) -> &'static str;

    /// How often this job wants to run.
    fn schedule(&self) -> Schedule;

    /// Do the work once.
    ///
    /// Returning `Err` is recorded and logged; it never stops the job from
    /// being tried again on the next tick. A job that must not repeat after
    /// failing has to say so itself.
    async fn run(&self) -> CronResult<()>;
}

/// Adapts a closure to [`CronJob`].
///
/// The scheduler has one way to run a job, and this is how a caller with a
/// closure rather than a type gets to use it — the alternative, a second
/// registration path inside the scheduler, would be a second thing to keep
/// correct. Real jobs should implement [`CronJob`] directly; this is for tests
/// and for one-liners not worth a type.
pub struct FnJob<F> {
    name: &'static str,
    schedule: Schedule,
    run: F,
}

impl<F, Fut> FnJob<F>
where
    F: Fn() -> Fut + Send + Sync + 'static,
    Fut: Future<Output = CronResult<()>> + Send + 'static,
{
    /// Wrap `run` as a job called `name` on `schedule`.
    pub fn new(name: &'static str, schedule: Schedule, run: F) -> Self {
        Self {
            name,
            schedule,
            run,
        }
    }
}

#[async_trait]
impl<F, Fut> CronJob for FnJob<F>
where
    F: Fn() -> Fut + Send + Sync + 'static,
    Fut: Future<Output = CronResult<()>> + Send + 'static,
{
    fn name(&self) -> &'static str {
        self.name
    }

    fn schedule(&self) -> Schedule {
        self.schedule.clone()
    }

    async fn run(&self) -> CronResult<()> {
        (self.run)().await
    }
}
