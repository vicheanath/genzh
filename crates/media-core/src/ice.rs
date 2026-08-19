//! ICE (STUN/TURN) configuration.
//!
//! Credentials come from the environment, never from source. The API hands the
//! resolved list to clients as part of the media-join response so a client
//! never has to be redeployed to change TURN providers.

use serde::{Deserialize, Serialize};

use crate::error::{MediaCoreError, MediaCoreResult};

/// A single STUN or TURN server, in the shape browsers expect for
/// `RTCConfiguration.iceServers`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct IceServer {
    /// One or more `stun:`/`turn:`/`turns:` URLs.
    pub urls: Vec<String>,
    /// TURN username, omitted for STUN.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    /// TURN credential, omitted for STUN.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential: Option<String>,
}

impl IceServer {
    /// A credential-free STUN server.
    pub fn stun(url: impl Into<String>) -> MediaCoreResult<Self> {
        let url = url.into();
        validate_ice_url(&url)?;
        Ok(Self {
            urls: vec![url],
            username: None,
            credential: None,
        })
    }

    /// A TURN server with long-term credentials.
    pub fn turn(
        url: impl Into<String>,
        username: impl Into<String>,
        credential: impl Into<String>,
    ) -> MediaCoreResult<Self> {
        let url = url.into();
        validate_ice_url(&url)?;
        Ok(Self {
            urls: vec![url],
            username: Some(username.into()),
            credential: Some(credential.into()),
        })
    }

    /// Does this entry point at a relay, by URL scheme?
    pub fn is_turn(&self) -> bool {
        self.urls
            .iter()
            .any(|u| u.starts_with("turn:") || u.starts_with("turns:"))
    }

    /// Is this entry a relay we can actually authenticate against?
    ///
    /// A `turn:` URL without credentials parses fine and will be handed to the
    /// client, where it silently fails allocation. Distinguishing the two is
    /// what makes [`IceConfig::has_relay`] a meaningful readiness signal.
    pub fn is_usable_relay(&self) -> bool {
        self.is_turn()
            && self.username.as_deref().is_some_and(|u| !u.is_empty())
            && self.credential.as_deref().is_some_and(|c| !c.is_empty())
    }
}

/// How aggressively a client should fall back to relaying.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum IceTransportPolicy {
    /// Try host and server-reflexive candidates first, relay last.
    #[default]
    All,
    /// Only use TURN. Useful for restricted networks and for testing that the
    /// relay path works at all.
    Relay,
}

/// The ICE configuration the API returns to clients.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IceConfig {
    /// Servers, in priority order.
    pub ice_servers: Vec<IceServer>,
    /// Candidate policy.
    #[serde(default)]
    pub ice_transport_policy: IceTransportPolicy,
}

impl IceConfig {
    /// Assemble a configuration from raw environment values.
    ///
    /// Missing values are simply skipped: a deployment with no TURN server is
    /// valid (it just cannot traverse symmetric NATs), and a deployment with no
    /// STUN server at all is valid on a LAN.
    pub fn from_parts(
        stun_url: Option<&str>,
        turn_url: Option<&str>,
        turn_username: Option<&str>,
        turn_password: Option<&str>,
        relay_only: bool,
    ) -> MediaCoreResult<Self> {
        let mut ice_servers = Vec::new();

        if let Some(url) = stun_url.filter(|u| !u.is_empty()) {
            ice_servers.push(IceServer::stun(url)?);
        }

        match (
            turn_url.filter(|u| !u.is_empty()),
            turn_username,
            turn_password,
        ) {
            (Some(url), Some(user), Some(pass)) if !user.is_empty() => {
                ice_servers.push(IceServer::turn(url, user, pass)?);
            }
            (Some(url), _, _) => {
                // A TURN URL without credentials is almost always a
                // misconfiguration; keep it but make the omission visible.
                tracing::warn!(turn_url = %url, "TURN_URL set without credentials; relay will fail");
                ice_servers.push(IceServer::stun(url)?);
            }
            _ => {}
        }

        Ok(Self {
            ice_servers,
            ice_transport_policy: if relay_only {
                IceTransportPolicy::Relay
            } else {
                IceTransportPolicy::All
            },
        })
    }

    /// True when at least one *authenticable* relay is configured.
    pub fn has_relay(&self) -> bool {
        self.ice_servers.iter().any(IceServer::is_usable_relay)
    }
}

fn validate_ice_url(url: &str) -> MediaCoreResult<()> {
    const SCHEMES: [&str; 4] = ["stun:", "stuns:", "turn:", "turns:"];
    if SCHEMES.iter().any(|s| url.starts_with(s)) && url.len() > 5 {
        Ok(())
    } else {
        Err(MediaCoreError::InvalidIceUrl(url.to_owned()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_ice_schemes_are_accepted() {
        assert!(IceServer::stun("stun:stun.example.net:3478").is_ok());
        assert!(IceServer::turn("turns:turn.example.net:5349", "u", "p").is_ok());
        assert!(IceServer::stun("https://example.net").is_err());
        assert!(IceServer::stun("stun:").is_err());
    }

    #[test]
    fn a_full_configuration_exposes_a_relay() {
        let cfg = IceConfig::from_parts(
            Some("stun:stun.example.net:3478"),
            Some("turn:turn.example.net:3478"),
            Some("relay-user"),
            Some("relay-pass"),
            false,
        )
        .unwrap();

        assert_eq!(cfg.ice_servers.len(), 2);
        assert!(cfg.has_relay());
        assert_eq!(cfg.ice_transport_policy, IceTransportPolicy::All);
    }

    #[test]
    fn missing_turn_credentials_downgrade_rather_than_fail() {
        let cfg =
            IceConfig::from_parts(None, Some("turn:turn.example.net:3478"), None, None, false)
                .unwrap();
        assert_eq!(cfg.ice_servers.len(), 1);
        assert!(
            !cfg.has_relay(),
            "an entry without credentials is not a usable relay"
        );
    }

    #[test]
    fn an_empty_environment_yields_an_empty_but_valid_config() {
        let cfg = IceConfig::from_parts(None, None, None, None, false).unwrap();
        assert!(cfg.ice_servers.is_empty());
        assert!(!cfg.has_relay());
    }

    #[test]
    fn relay_only_is_representable() {
        let cfg = IceConfig::from_parts(
            Some("stun:stun.example.net:3478"),
            Some("turn:turn.example.net:3478"),
            Some("u"),
            Some("p"),
            true,
        )
        .unwrap();
        assert_eq!(cfg.ice_transport_policy, IceTransportPolicy::Relay);
    }
}
