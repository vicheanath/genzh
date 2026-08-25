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
use genzh_media_room::stats::ServerReport;

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

    // The two planes never talk to each other on the join path, so neither can
    // detect a secret mismatch on its own. Printing a fingerprint on both means
    // "do these agree?" is answered by comparing two log lines instead of by
    // watching every join fail with an unexplained rejection.
    tracing::info!(
        secret_fingerprint = %state.verifier.fingerprint(),
        token_issuer = %state.config.token_issuer,
        "verifying media tokens — this fingerprint must match the API's"
    );

    let app = Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/stats", get(stats))
        .route("/ws/media", get(signaling::ws_handler))
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state.clone());

    let listener = TcpListener::bind(bind).await?;
    tracing::info!(%bind, "media server listening");

    // Periodic cron job to clean up unused SFU resources (empty rooms and disconnected participants).
    let (cleanup_shutdown_tx, mut cleanup_shutdown_rx) = tokio::sync::watch::channel(false);
    let cleanup_rooms = state.rooms.clone();
    let cleanup_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        interval.tick().await; // skip initial immediate tick
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let report = cleanup_rooms.prune().await;
                    if report.rooms_removed > 0 || report.participants_removed > 0 {
                        tracing::info!(
                            rooms_removed = report.rooms_removed,
                            participants_removed = report.participants_removed,
                            "sfu cleanup completed"
                        );
                    }
                }
                Ok(()) = cleanup_shutdown_rx.changed() => {
                    if *cleanup_shutdown_rx.borrow() {
                        tracing::debug!("sfu cleanup cron task stopped");
                        break;
                    }
                }
            }
        }
    });

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    let _ = cleanup_shutdown_tx.send(true);
    let _ = cleanup_task.await;

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
    axum::Json(Health {
        status: "ok",
        service: "media",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// `GET /stats`
///
/// What every room on this node is carrying, down to the counters on each
/// track. Unauthenticated like the other operational endpoints — it exposes no
/// media and no account data, only ids and packet counts — and expected to sit
/// behind whatever fronts the node, exactly as `/ready` does.
async fn stats(State(state): State<MediaState>) -> axum::Json<ServerReport> {
    axum::Json(state.rooms.report().await)
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
        .unwrap_or_else(|_| EnvFilter::new("info,media=debug,genzh_media_room=debug"));

    let registry = tracing_subscriber::registry().with(filter);

    if std::env::var("LOG_FORMAT").is_ok_and(|value| value.eq_ignore_ascii_case("json")) {
        registry
            .with(tracing_subscriber::fmt::layer().json())
            .init();
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
