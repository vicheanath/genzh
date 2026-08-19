//! The media plane: WebSocket signalling and a selective forwarding unit.
//!
//! This process holds no database credentials, knows nothing about accounts or
//! communities, and cannot create a user. Its entire authority comes from a
//! short-lived token signed by the API, which it verifies locally.

mod auth;
mod config;
mod error;
mod signaling;
mod state;

use std::process::ExitCode;

use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use serde::Serialize;
use tokio::net::TcpListener;
use tokio::signal;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::prelude::*;

use crate::config::Config;
use crate::state::MediaState;

#[tokio::main]
async fn main() -> ExitCode {
    let _ = dotenvy::dotenv();
    init_tracing();

    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(%error, "media server failed to start");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> anyhow::Result<()> {
    let config = Config::from_env()?;
    let bind = config.bind;

    tracing::info!(
        codecs = config.codecs.codecs().len(),
        ice_servers = config.ice.ice_servers.len(),
        relay_available = config.ice.has_relay(),
        vad = ?config.vad_mode,
        "media server configuration loaded"
    );

    let state = MediaState::build(config)?;

    let app = Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/ws/media", get(signaling::ws_handler))
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state.clone());

    let listener = TcpListener::bind(bind).await?;
    tracing::info!(%bind, "media server listening");

    axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await?;

    // Close every peer connection rather than letting the process exit with
    // sockets open; clients then see a clean disconnect instead of a timeout.
    tracing::info!("closing media rooms");
    state.rooms.shutdown().await;
    tracing::info!("media server stopped");

    Ok(())
}

/// Liveness payload.
#[derive(Debug, Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

/// Readiness payload, doubling as a cheap capacity view.
#[derive(Debug, Serialize)]
struct Readiness {
    status: &'static str,
    rooms: usize,
    participants: usize,
    relay_available: bool,
}

/// `GET /health`
async fn health() -> axum::Json<Health> {
    axum::Json(Health { status: "ok", service: "media", version: env!("CARGO_PKG_VERSION") })
}

/// `GET /ready`
///
/// The media server has no external dependency to check — that is the point of
/// the token design — so readiness is really "did we start". The counters ride
/// along because an operator asking whether a node is ready almost always
/// wants to know what it is carrying.
async fn ready(State(state): State<MediaState>) -> (StatusCode, axum::Json<Readiness>) {
    (
        StatusCode::OK,
        axum::Json(Readiness {
            status: "ready",
            rooms: state.rooms.room_count().await,
            participants: state.rooms.participant_count().await,
            relay_available: state.config.ice.has_relay(),
        }),
    )
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,media=debug,social_media_room=debug"));

    let registry = tracing_subscriber::registry().with(filter);

    if std::env::var("LOG_FORMAT").is_ok_and(|value| value.eq_ignore_ascii_case("json")) {
        registry.with(tracing_subscriber::fmt::layer().json()).init();
    } else {
        registry.with(tracing_subscriber::fmt::layer()).init();
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut stream) => {
                stream.recv().await;
            }
            Err(error) => tracing::error!(%error, "cannot listen for SIGTERM"),
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("received ctrl-c, shutting down"),
        _ = terminate => tracing::info!("received SIGTERM, shutting down"),
    }
}
