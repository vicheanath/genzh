//! Connection pool and migrations.

use std::time::Duration;

use sqlx::postgres::{PgPool, PgPoolOptions};

use crate::error::{RepositoryError, RepositoryResult};

/// The pool type used throughout the control plane.
pub type DbPool = PgPool;

/// Pool tuning.
#[derive(Debug, Clone)]
pub struct PgConfig {
    /// `postgres://…` connection string.
    pub url: String,
    /// Maximum pooled connections.
    ///
    /// An async API can have far more in-flight requests than connections, and
    /// a pool larger than PostgreSQL's own `max_connections` just moves the
    /// queue somewhere less observable. Ten is a sane starting point for a
    /// single API instance.
    pub max_connections: u32,
    /// Minimum idle connections kept warm, so a quiet period does not turn the
    /// next request into a TLS handshake.
    pub min_connections: u32,
    /// How long to wait for a free connection before failing the request.
    pub acquire_timeout: Duration,
    /// Recycle connections after this long, which keeps a long-lived process
    /// from pinning connections across a database failover.
    pub max_lifetime: Duration,
}

impl PgConfig {
    /// Defaults around a connection string.
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            max_connections: 10,
            min_connections: 1,
            acquire_timeout: Duration::from_secs(5),
            max_lifetime: Duration::from_secs(30 * 60),
        }
    }
}

/// Open the pool.
///
/// Connections are established lazily: the API should start and report
/// unhealthy while the database comes up, rather than crash-looping and
/// obscuring the real problem. `GET /ready` is what reports the truth.
pub async fn connect(config: &PgConfig) -> RepositoryResult<DbPool> {
    PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .acquire_timeout(config.acquire_timeout)
        .max_lifetime(config.max_lifetime)
        .connect_lazy(&config.url)
        .map_err(RepositoryError::from)
}

/// Apply every pending migration.
///
/// Migrations are embedded in the binary at compile time, so a container image
/// carries its own schema and there is no separate migration artefact to keep
/// in step with the code.
pub async fn run_migrations(pool: &DbPool) -> RepositoryResult<()> {
    sqlx::migrate!("../../migrations")
        .run(pool)
        .await
        .map_err(|error| RepositoryError::Migration(error.to_string()))
}

/// Is the database reachable right now?
pub async fn ping(pool: &DbPool) -> bool {
    sqlx::query("SELECT 1").execute(pool).await.is_ok()
}
