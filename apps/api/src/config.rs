//! Configuration, entirely from the environment.
//!
//! Two rules are enforced here rather than left to a deployment checklist:
//!
//! * secrets have **no defaults** — a missing `JWT_SECRET` fails startup
//!   rather than silently signing tokens with a well-known string;
//! * the two token secrets must **differ** — the media plane and the user
//!   plane are separate trust domains, and sharing a key would let a
//!   compromised media server mint user sessions.

use std::env::VarError;
use std::net::SocketAddr;
use std::time::Duration;

use genzh_media_core::ice::IceConfig;
use genzh_media_core::token::DEFAULT_TOKEN_TTL_SECONDS;

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

    /// Secret shared with the media servers. **Not** `jwt_secret`.
    pub media_token_secret: String,
    /// Media-token lifetime.
    pub media_token_ttl_seconds: i64,
    /// Comma-separated media server WebSocket URLs.
    pub media_server_urls: String,

    /// ICE servers handed to clients.
    pub ice: IceConfig,

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
    ///
    /// Nothing depends on this being prompt — an expired session is already
    /// refused on presentation, so this only reclaims rows.
    pub session_prune_interval: Duration,

    /// How often room participants are checked for staleness.
    pub room_prune_interval: Duration,

    /// How long a participant may go unheard from before they are presumed
    /// gone. Must comfortably exceed the client heartbeat, or a slow network
    /// will evict people who are still in the call.
    pub participant_stale_after: Duration,

    /// How long a room must sit empty before it is ended.
    ///
    /// Longer than [`Self::room_prune_interval`] on purpose: a room is empty
    /// for a moment every time the last person leaves and another arrives, and
    /// ending it on the first sweep that sees zero would close calls people are
    /// still walking back into.
    pub room_empty_grace: Duration,

    /// How often the in-process rate-limit and flood maps are swept.
    pub store_sweep_interval: Duration,
}

impl CronConfig {
    fn from_env() -> Result<Self, ConfigError> {
        Ok(Self {
            session_prune_interval: seconds("CRON_SESSION_PRUNE_SECONDS", 3600)?,
            room_prune_interval: seconds("CRON_ROOM_PRUNE_SECONDS", 60)?,
            participant_stale_after: seconds("ROOM_PARTICIPANT_STALE_SECONDS", 300)?,
            room_empty_grace: seconds("ROOM_EMPTY_GRACE_SECONDS", 600)?,
            store_sweep_interval: seconds("CRON_STORE_SWEEP_SECONDS", 300)?,
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
        let media_token_secret = require("MEDIA_TOKEN_SECRET")?;

        // A shared secret would collapse two trust domains into one.
        if jwt_secret == media_token_secret {
            return Err(ConfigError::Invalid {
                name: "MEDIA_TOKEN_SECRET",
                reason: "must differ from JWT_SECRET".to_owned(),
            });
        }
        for (name, secret) in [
            ("JWT_SECRET", &jwt_secret),
            ("MEDIA_TOKEN_SECRET", &media_token_secret),
        ] {
            if secret.len() < 32 {
                return Err(ConfigError::Invalid {
                    name,
                    reason: "must be at least 32 characters".to_owned(),
                });
            }
        }

        let bind: SocketAddr = optional("API_BIND")
            .unwrap_or_else(|| "0.0.0.0:8080".to_owned())
            .parse()
            .map_err(|error| ConfigError::Invalid {
                name: "API_BIND",
                reason: format!("{error}"),
            })?;

        let ice = IceConfig::from_parts(
            optional("STUN_URL").as_deref(),
            optional("TURN_URL").as_deref(),
            optional("TURN_USERNAME").as_deref(),
            optional("TURN_PASSWORD").as_deref(),
            flag("ICE_RELAY_ONLY", false),
        )
        .map_err(|error| ConfigError::Invalid {
            name: "STUN_URL/TURN_URL",
            reason: error.to_string(),
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

            media_token_secret,
            media_token_ttl_seconds: number("MEDIA_TOKEN_TTL_SECONDS", DEFAULT_TOKEN_TTL_SECONDS)?,
            media_server_urls: optional("MEDIA_SERVER_URL")
                .unwrap_or_else(|| "ws://127.0.0.1:8081/ws/media".to_owned()),

            ice,

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

            app_env: {
                let env = optional("APP_ENV")
                    .or_else(|| optional("ENVIRONMENT"))
                    .unwrap_or_else(|| "development".to_owned());
                env
            },
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
