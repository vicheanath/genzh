//! Media server configuration.
//!
//! Notice what is absent: no `DATABASE_URL`, no `JWT_SECRET`. The media plane
//! has no database credentials and cannot mint user sessions. Its entire trust
//! input is `MEDIA_TOKEN_SECRET`, shared with the API.

use std::env::VarError;
use std::net::SocketAddr;
use std::time::Duration;

use genzh_media_core::codec::CodecRegistry;
use genzh_media_core::ice::IceConfig;
use genzh_media_core::vad::VadMode;

/// Everything the media server needs to start.
#[derive(Debug, Clone)]
pub struct Config {
    /// Address for the signalling HTTP/WebSocket listener.
    pub bind: SocketAddr,
    /// Shared secret for verifying media tokens.
    pub media_token_secret: String,
    /// Issuer the API stamps on tokens; anything else is rejected.
    pub token_issuer: String,
    /// Codecs to negotiate.
    pub codecs: CodecRegistry,
    /// ICE servers used by this server's own peer connections.
    pub ice: IceConfig,
    /// Local addresses to bind UDP sockets on.
    ///
    /// `0.0.0.0:0` lets the OS choose a port per connection. A deployment
    /// behind a firewall usually wants a pinned range instead, and NAT
    /// deployments need `MEDIA_PUBLIC_IP` so the right candidate is advertised.
    pub udp_addrs: Vec<String>,
    /// Voice-activity detection mode.
    pub vad_mode: VadMode,
    /// Negotiated id of the `ssrc-audio-level` RTP header extension.
    pub audio_level_ext_id: u8,
    /// Auto-subscribe policy for new participants.
    pub auto_subscribe_video: bool,
    /// Participant cap per room, enforced regardless of what the API believed.
    pub room_capacity: usize,
    /// How many people's audio a room forwards at once. `0` disables the limit.
    ///
    /// Inert below this many participants, so it only ever affects rooms large
    /// enough for everyone-hears-everyone to be wasteful.
    pub speaker_limit: usize,

    /// How often abandoned rooms and dead peer connections are swept up.
    ///
    /// Shorter than the API's equivalent because what leaks here is sockets and
    /// forwarding tasks rather than rows, and because the sweep is cheap: it
    /// walks rooms this process already holds and touches nothing off-box.
    pub prune_interval: Duration,
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
        let media_token_secret = require("MEDIA_TOKEN_SECRET")?;
        if media_token_secret.len() < 32 {
            return Err(ConfigError::Invalid {
                name: "MEDIA_TOKEN_SECRET",
                reason: "must be at least 32 characters".to_owned(),
            });
        }

        let bind: SocketAddr = optional("MEDIA_BIND")
            .unwrap_or_else(|| "0.0.0.0:8081".to_owned())
            .parse()
            .map_err(|error| ConfigError::Invalid {
                name: "MEDIA_BIND",
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

        let codecs = CodecRegistry::from_allow_list(optional("MEDIA_CODECS").as_deref());
        if !codecs.has_audio() {
            return Err(ConfigError::Invalid {
                name: "MEDIA_CODECS",
                reason: "at least one audio codec is required".to_owned(),
            });
        }

        Ok(Self {
            bind,
            media_token_secret,
            token_issuer: optional("JWT_ISSUER").unwrap_or_else(|| "social.api".to_owned()),
            codecs,
            ice,
            udp_addrs: udp_addrs(),
            vad_mode: VadMode::from_env_value(optional("MEDIA_VAD_MODE").as_deref()),
            audio_level_ext_id: number("MEDIA_AUDIO_LEVEL_EXT_ID", 1)?,
            auto_subscribe_video: flag("MEDIA_AUTO_SUBSCRIBE_VIDEO", false),
            room_capacity: number(
                "MEDIA_ROOM_CAPACITY",
                genzh_media_signaling::limits::MAX_PARTICIPANTS_PER_ROOM,
            )?,
            speaker_limit: number(
                "MEDIA_SPEAKER_LIMIT",
                genzh_media_room::DEFAULT_SPEAKER_LIMIT,
            )?,
            prune_interval: seconds("MEDIA_PRUNE_INTERVAL_SECONDS", 30)?,
        })
    }
}

/// A duration read as a whole number of seconds.
///
/// Zero is rejected rather than read as "disabled": a zero-second schedule is a
/// job that spins, which is not what anybody setting it to zero meant.
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

/// Which local addresses the SFU binds UDP sockets on.
///
/// `MEDIA_UDP_BIND` overrides; otherwise every interface with an
/// OS-chosen port.
fn udp_addrs() -> Vec<String> {
    match optional("MEDIA_UDP_BIND") {
        Some(value) => value
            .split(',')
            .map(str::trim)
            .filter(|addr| !addr.is_empty())
            .map(str::to_owned)
            .collect(),
        None => vec!["0.0.0.0:0".to_owned()],
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
