//! The control-plane HTTP API.
//!
//! Owns accounts, communities, rooms, permissions and messages — and authorises
//! media sessions without ever carrying media. See the workspace README for how
//! the two planes fit together.

use std::process::ExitCode;

use tokio::net::TcpListener;
use tokio::signal;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::prelude::*;

use api::config::Config;
use api::router;
use api::state::AppState;

#[tokio::main]
async fn main() -> ExitCode {
    // A missing .env is normal in production, where the environment is
    // populated by the orchestrator.
    let _ = dotenvy::dotenv();
    init_tracing();

    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(%error, "api failed to start");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> anyhow::Result<()> {
    let config = Config::from_env()?;
    let bind = config.bind;
    let run_migrations = config.run_migrations;

    let state = AppState::build(config).await?;

    if run_migrations {
        tracing::info!("applying database migrations");
        social_infrastructure::run_migrations(&state.pool).await?;
    }

    let app = router::build(state);
    let listener = TcpListener::bind(bind).await?;

    tracing::info!(%bind, "api listening");

    // `ConnectInfo` is what the rate limiter keys on.
    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("api stopped");
    Ok(())
}

/// Structured logging.
///
/// JSON when `LOG_FORMAT=json`, human-readable otherwise. Every line carries
/// the request span's fields, which is what makes `request_id` searchable.
fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,api=debug,tower_http=debug"));

    let registry = tracing_subscriber::registry().with(filter);

    if std::env::var("LOG_FORMAT").is_ok_and(|value| value.eq_ignore_ascii_case("json")) {
        registry.with(tracing_subscriber::fmt::layer().json()).init();
    } else {
        registry.with(tracing_subscriber::fmt::layer()).init();
    }
}

/// Wait for SIGTERM or Ctrl-C so in-flight requests can finish.
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
