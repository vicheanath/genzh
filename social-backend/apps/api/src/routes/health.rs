//! Liveness and readiness.
//!
//! The distinction matters to an orchestrator:
//!
//! * `/health` — is the process alive? Never touches a dependency, so a slow
//!   database cannot get the container killed and restarted into the same slow
//!   database.
//! * `/ready` — should traffic be sent here? Checks the things a request
//!   actually needs.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Serialize;

use crate::state::AppState;

/// Liveness payload.
#[derive(Debug, Serialize)]
pub struct Health {
    /// Always `"ok"`.
    pub status: &'static str,
    /// Which service answered.
    pub service: &'static str,
    /// Build version.
    pub version: &'static str,
}

/// Readiness payload.
#[derive(Debug, Serialize)]
pub struct Readiness {
    /// `"ready"` or `"degraded"`.
    pub status: &'static str,
    /// Whether PostgreSQL answered.
    pub database: bool,
    /// Whether any media server is configured.
    pub media_servers: bool,
}

/// `GET /health`
pub async fn health() -> Json<Health> {
    Json(Health { status: "ok", service: "api", version: env!("CARGO_PKG_VERSION") })
}

/// `GET /ready`
pub async fn ready(State(state): State<AppState>) -> (StatusCode, Json<Readiness>) {
    let database = social_infrastructure::db::ping(&state.pool).await;
    let media_servers = state.media.has_media_servers();

    let ready = database && media_servers;
    let status = if ready { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };

    (
        status,
        Json(Readiness {
            status: if ready { "ready" } else { "degraded" },
            database,
            media_servers,
        }),
    )
}
