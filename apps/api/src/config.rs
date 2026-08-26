//! Configuration, entirely from the environment.
//!
//! A rule enforced here rather than left to a deployment checklist: secrets
//! have **no defaults** — a missing `JWT_SECRET` or `LIVEKIT_API_SECRET`
//! fails startup rather than silently signing tokens with a well-known
//! string.

use std::env::VarError;
use std::net::SocketAddr;
use std::time::Duration;

/// Default lifetime of a LiveKit access token, in seconds.
///
/// Long enough that a reconnect after a brief network blip does not need a
/// fresh join, short enough that a permission change is reflected on the next
/// one.
const DEFAULT_LIVEKIT_TOKEN_TTL_SECONDS: i64 = 3600;

/// Everything the API needs to start.
#[derive(Debug, Clone)]
pub struct Config {
    /// Address to listen on.
    pub bind: SocketAddr,
    /// PostgreSQL connection string.
    pub database_url: String,
    /// Pool size.
    pub database_max_connections: u32,
    /// Whether to apply migrations at startup.
    pub run_migrations: bool,

    /// Secret for user-facing access tokens.
    pub jwt_secret: String,
    /// Access-token issuer.
    pub jwt_issuer: String,
    /// Access-token audience.
    pub jwt_audience: String,
    /// Access-token lifetime.
    pub access_ttl_seconds: i64,
    /// Refresh-token lifetime.
    pub refresh_ttl_seconds: i64,

    /// LiveKit project API key.
    pub livekit_api_key: String,
    /// LiveKit project API secret. Signs every access token this process
    /// issues.
    pub livekit_api_secret: String,
    /// WebSocket URL a *browser* dials to reach LiveKit — not necessarily the
    /// address this process would use internally.
    pub livekit_url: String,
    /// LiveKit access-token lifetime, in seconds.
    pub livekit_token_ttl_seconds: i64,

    /// Maximum request body, in bytes.
    pub max_body_bytes: usize,
    /// Request timeout, in seconds.
    pub request_timeout_seconds: u64,
    /// Allowed CORS origins; `*` for any.
    pub cors_allowed_origins: String,
    /// Requests per minute per client address.
    pub rate_limit_per_minute: u32,
    /// Requests per minute per client address on `/auth/*`.
    pub auth_rate_limit_per_minute: u32,

    /// Messages one account may post to one room per burst window.
    pub message_burst_limit: u32,
    /// The burst window, in seconds.
    pub message_burst_window_seconds: u64,
    /// How long an identical message is remembered, in seconds.
    pub message_repeat_window_seconds: u64,
    /// How many identical messages within that window are tolerated.
    pub message_repeat_limit: u32,

    /// Deployment environment: "development", "production", "test".
    pub app_env: String,
    /// Whether password-based registration is allowed.
    pub allow_password_signup: bool,
    /// Frontend application base URL for OAuth callbacks.
    pub frontend_url: String,

    /// Google OAuth configuration.
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub google_redirect_uri: Option<String>,

    /// Discord OAuth configuration.
    pub discord_client_id: Option<String>,
    pub discord_client_secret: Option<String>,
    pub discord_redirect_uri: Option<String>,

    /// How often the background maintenance jobs run.
    pub cron: CronConfig,
}

/// Timings for the recurring maintenance jobs.
///
/// Grouped rather than flattened into [`Config`] because they are read by one
/// caller — the job wiring — and because the two *pairs* below only make sense
/// together: a sweep interval means nothing without the staleness threshold it
/// is sweeping against.
#[derive(Debug, Clone)]
pub struct CronConfig {
    /// How often expired refresh sessions are deleted.
    pub session_prune_interval: Duration,

    /// How often the in-process rate-limit and flood maps are swept.
    pub store_sweep_interval: Duration,

    /// How often expired ephemeral rooms are ended.
    pub ephemeral_room_expire_interval: Duration,

    /// How often empty playground rooms are reaped, and how long one may sit
    /// empty before it counts as over.
    pub playground_reap_interval: Duration,
    pub playground_empty_grace: Duration,

    /// How often expired community invites are deleted.
    pub invite_prune_interval: Duration,

    /// How often old notifications are pruned.
    pub notification_prune_interval: Duration,
    pub notification_read_retention: Duration,
    pub notification_unread_retention: Duration,

    /// How often expired IP bans are pruned.
    pub security_prune_interval: Duration,

    /// How often stale resolved tickets are auto-closed.
    pub support_cleanup_interval: Duration,
    pub support_stale_after: Duration,
}

impl CronConfig {
    fn from_env() -> Result<Self, ConfigError> {
        Ok(Self {
            session_prune_interval: seconds("CRON_SESSION_PRUNE_SECONDS", 3600)?,
            store_sweep_interval: seconds("CRON_STORE_SWEEP_SECONDS", 300)?,

            ephemeral_room_expire_interval: seconds("CRON_EPHEMERAL_ROOM_EXPIRE_SECONDS", 30)?,

            playground_reap_interval: seconds("CRON_PLAYGROUND_REAP_SECONDS", 60)?,
            playground_empty_grace: seconds(
                "CRON_PLAYGROUND_EMPTY_GRACE_SECONDS",
                genzh_domain::room::PLAYGROUND_EMPTY_GRACE_SECONDS as u64,
            )?,

            invite_prune_interval: seconds("CRON_INVITE_PRUNE_SECONDS", 3600)?,

            notification_prune_interval: seconds("CRON_NOTIFICATION_PRUNE_SECONDS", 86400)?,
            notification_read_retention: seconds("CRON_NOTIFICATION_READ_RETENTION_SECONDS", 30 * 86400)?,
            notification_unread_retention: seconds("CRON_NOTIFICATION_UNREAD_RETENTION_SECONDS", 90 * 86400)?,

            security_prune_interval: seconds("CRON_SECURITY_PRUNE_SECONDS", 300)?,

            support_cleanup_interval: seconds("CRON_SUPPORT_CLEANUP_SECONDS", 21600)?,
            support_stale_after: seconds("CRON_SUPPORT_STALE_SECONDS", 14 * 86400)?,
        })
    }
}


/// A configuration value that is missing or unusable.
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    /// A required variable is not set.
    #[error("{0} must be set")]
    Missing(&'static str),
    /// A variable is set but cannot be parsed.
    #[error("{name} is invalid: {reason}")]
    Invalid {
        /// Variable name.
        name: &'static str,
        /// Why it was rejected.
        reason: String,
    },
}

impl Config {
    /// Read the configuration from the process environment.
    pub fn from_env() -> Result<Self, ConfigError> {
        let jwt_secret = require("JWT_SECRET")?;
        if jwt_secret.len() < 32 {
            return Err(ConfigError::Invalid {
                name: "JWT_SECRET",
                reason: "must be at least 32 characters".to_owned(),
            });
        }

        let livekit_api_key = require("LIVEKIT_API_KEY")?;
        let livekit_api_secret = require("LIVEKIT_API_SECRET")?;
        let livekit_url = require("LIVEKIT_URL")?;

        let bind: SocketAddr = optional("API_BIND")
            .unwrap_or_else(|| "0.0.0.0:8080".to_owned())
            .parse()
            .map_err(|error| ConfigError::Invalid {
                name: "API_BIND",
                reason: format!("{error}"),
            })?;

        Ok(Self {
            bind,
            database_url: require("DATABASE_URL")?,
            database_max_connections: number("DATABASE_MAX_CONNECTIONS", 10)?,
            run_migrations: flag("RUN_MIGRATIONS", true),

            jwt_secret,
            jwt_issuer: optional("JWT_ISSUER").unwrap_or_else(|| "social.api".to_owned()),
            jwt_audience: optional("JWT_AUDIENCE").unwrap_or_else(|| "social.client".to_owned()),
            access_ttl_seconds: number("ACCESS_TOKEN_TTL_SECONDS", 900)?,
            refresh_ttl_seconds: number("REFRESH_TOKEN_TTL_SECONDS", 30 * 24 * 3600)?,

            livekit_api_key,
            livekit_api_secret,
            livekit_url,
            livekit_token_ttl_seconds: number(
                "LIVEKIT_TOKEN_TTL_SECONDS",
                DEFAULT_LIVEKIT_TOKEN_TTL_SECONDS,
            )?,

            max_body_bytes: number("MAX_BODY_BYTES", 256 * 1024)?,
            request_timeout_seconds: number("REQUEST_TIMEOUT_SECONDS", 30)?,
            cors_allowed_origins: optional("CORS_ALLOWED_ORIGINS").unwrap_or_default(),
            rate_limit_per_minute: number("RATE_LIMIT_PER_MINUTE", 600)?,
            auth_rate_limit_per_minute: number("AUTH_RATE_LIMIT_PER_MINUTE", 20)?,

            // Faster than anybody types, slower than anything automated
            // bothers to be. Configurable because a room full of a game's
            // spectators and a support channel want different answers.
            message_burst_limit: number("MESSAGE_BURST_LIMIT", 10)?,
            message_burst_window_seconds: number("MESSAGE_BURST_WINDOW_SECONDS", 10)?,
            message_repeat_window_seconds: number("MESSAGE_REPEAT_WINDOW_SECONDS", 30)?,
            message_repeat_limit: number("MESSAGE_REPEAT_LIMIT", 3)?,

            app_env: optional("APP_ENV")
                .or_else(|| optional("ENVIRONMENT"))
                .unwrap_or_else(|| "development".to_owned()),
            allow_password_signup: {
                let env = optional("APP_ENV")
                    .or_else(|| optional("ENVIRONMENT"))
                    .unwrap_or_else(|| "development".to_owned());
                let default_allow = !env.eq_ignore_ascii_case("production");
                flag("ALLOW_PASSWORD_SIGNUP", default_allow)
            },
            frontend_url: optional("FRONTEND_URL")
                .unwrap_or_else(|| "http://localhost:5173".to_owned()),

            google_client_id: optional("GOOGLE_CLIENT_ID"),
            google_client_secret: optional("GOOGLE_CLIENT_SECRET"),
            google_redirect_uri: optional("GOOGLE_REDIRECT_URI"),

            discord_client_id: optional("DISCORD_CLIENT_ID"),
            discord_client_secret: optional("DISCORD_CLIENT_SECRET"),
            discord_redirect_uri: optional("DISCORD_REDIRECT_URI"),

            cron: CronConfig::from_env()?,
        })
    }
}

fn require(name: &'static str) -> Result<String, ConfigError> {
    match std::env::var(name) {
        Ok(value) if !value.trim().is_empty() => Ok(value),
        Ok(_) | Err(VarError::NotPresent) => Err(ConfigError::Missing(name)),
        Err(VarError::NotUnicode(_)) => Err(ConfigError::Invalid {
            name,
            reason: "not valid unicode".to_owned(),
        }),
    }
}

fn optional(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|v| !v.is_empty())
}

/// A duration read as a whole number of seconds.
///
/// Zero is rejected rather than accepted as "disabled": a zero-second schedule
/// is a job that runs in a tight loop, which is the opposite of what anybody
/// setting it to zero meant.
fn seconds(name: &'static str, default: u64) -> Result<Duration, ConfigError> {
    let value = number(name, default)?;
    if value == 0 {
        return Err(ConfigError::Invalid {
            name,
            reason: "must be greater than zero".to_owned(),
        });
    }
    Ok(Duration::from_secs(value))
}

fn number<T>(name: &'static str, default: T) -> Result<T, ConfigError>
where
    T: std::str::FromStr,
    T::Err: std::fmt::Display,
{
    match optional(name) {
        None => Ok(default),
        Some(raw) => raw.parse().map_err(|error: T::Err| ConfigError::Invalid {
            name,
            reason: error.to_string(),
        }),
    }
}

fn flag(name: &str, default: bool) -> bool {
    match optional(name).map(|v| v.to_ascii_lowercase()) {
        Some(value) => matches!(value.as_str(), "1" | "true" | "yes" | "on"),
        None => default,
    }
}
