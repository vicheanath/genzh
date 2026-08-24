//! Sign in with Discord.

use genzh_auth::OAuthUserInput;
use serde::Deserialize;

use crate::config::Config;
use crate::error::ApiResult;

use super::{Credentials, OAuthProvider, default_redirect_uri, parse};

pub(super) struct Discord;

#[derive(Debug, Deserialize)]
struct Profile {
    id: String,
    username: String,
    global_name: Option<String>,
    email: Option<String>,
    #[serde(default)]
    verified: Option<bool>,
    avatar: Option<String>,
}

impl OAuthProvider for Discord {
    fn key(&self) -> &'static str {
        "discord"
    }

    fn display_name(&self) -> &'static str {
        "Discord"
    }

    fn credentials(&self, config: &Config) -> Option<Credentials> {
        Some(Credentials {
            client_id: config.discord_client_id.clone()?,
            client_secret: config.discord_client_secret.clone(),
            redirect_uri: config
                .discord_redirect_uri
                .clone()
                .unwrap_or_else(|| default_redirect_uri(config, self.key())),
        })
    }

    fn authorize_url(&self, credentials: &Credentials, csrf_state: &str) -> String {
        format!(
            "https://discord.com/oauth2/authorize?response_type=code&client_id={}&redirect_uri={}&scope=identify%20email&state={}",
            urlencoding::encode(&credentials.client_id),
            urlencoding::encode(&credentials.redirect_uri),
            urlencoding::encode(csrf_state),
        )
    }

    fn token_endpoint(&self) -> &'static str {
        "https://discord.com/api/oauth2/token"
    }

    fn userinfo_endpoint(&self) -> &'static str {
        "https://discord.com/api/users/@me"
    }

    fn parse_profile(&self, profile: serde_json::Value) -> ApiResult<OAuthUserInput> {
        let profile: Profile = parse(profile, self.display_name())?;

        // Discord serves avatars from a CDN path built out of the account id
        // and the image hash; the profile carries only the hash.
        let avatar_url = profile
            .avatar
            .map(|hash| format!("https://cdn.discordapp.com/avatars/{}/{}.png", profile.id, hash));

        Ok(OAuthUserInput {
            provider: self.key().to_owned(),
            provider_user_id: profile.id,
            email: profile
                .verified
                .unwrap_or(false)
                .then_some(profile.email)
                .flatten(),
            suggested_handle: Some(profile.username),
            display_name: profile.global_name,
            avatar_url,
        })
    }
}
