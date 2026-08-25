//! System health, PostgreSQL pool metrics, and runtime telemetry.

use genzh_infrastructure::{DbPool, RepositoryError, ServiceResult};
use serde::{Deserialize, Serialize};

/// System health status and pool metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemHealthTelemetry {
    pub database_status: String,
    pub pool_size: u32,
    pub pool_idle_connections: u32,
    pub uptime_seconds: u64,
    pub server_timestamp: genzh_domain::Timestamp,
}

/// Service exposing operational telemetry.
#[derive(Clone)]
pub struct SystemTelemetryService {
    pool: DbPool,
    start_time: std::time::Instant,
}

impl SystemTelemetryService {
    pub fn new(pool: DbPool) -> Self {
        Self {
            pool,
            start_time: std::time::Instant::now(),
        }
    }

    /// Inspect database health and connection pool telemetry.
    pub async fn get_health(&self) -> ServiceResult<SystemHealthTelemetry> {
        let (db_ok,): (bool,) = sqlx::query_as("SELECT true")
            .fetch_one(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        Ok(SystemHealthTelemetry {
            database_status: if db_ok { "healthy".into() } else { "degraded".into() },
            pool_size: self.pool.size(),
            pool_idle_connections: self.pool.num_idle() as u32,
            uptime_seconds: self.start_time.elapsed().as_secs(),
            server_timestamp: chrono::Utc::now(),
        })
    }
}
