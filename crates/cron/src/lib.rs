//! Recurring background work, for any service that has some.
//!
//! Long-running services accumulate maintenance that no request pays for:
//! expired sessions nobody will refresh, participant rows for people whose
//! laptop lid closed mid-call, in-memory buckets keyed by addresses that have
//! not been seen in hours. None of it belongs on a request path — the caller
//! who happens to arrive first should not pay for everyone else's cleanup — and
//! all of it has to happen anyway.
//!
//! Three pieces, split along what changes them:
//!
//! - [`job`] — what a job *is*: a name, a [`Schedule`], and something to run.
//!   The jobs themselves live in the applications that own the work, because a
//!   job about auth sessions belongs beside auth, not beside a timer.
//! - [`metrics`] — what each job has *done*: run counts, durations, last error.
//!   Read by the admin telemetry screen, which has no interest in scheduling.
//! - [`scheduler`] — when a job runs, delegated to [`tokio_cron_scheduler`].
//!
//! Its own crate rather than a module of `genzh-infrastructure` because both
//! binaries need it and only one of them may have a database driver: the media
//! plane holds no credentials and links no sqlx, and depending on the
//! infrastructure crate to get a timer would have handed it both.
//!
//! ```ignore
//! let scheduler = CronScheduler::new().await?;
//! scheduler.register(Arc::new(PruneSessionsJob::new(auth))).await?;
//! scheduler.start().await?;
//! // ... serve ...
//! scheduler.shutdown().await?;
//! ```

pub mod job;
pub mod metrics;
pub mod scheduler;

pub use job::{BoxFuture, CronError, CronJob, CronResult, FnJob, Schedule};
pub use metrics::{CronMetrics, JobStats};
pub use scheduler::{CronScheduler, CronSchedulerError, CronSchedulerResult};
