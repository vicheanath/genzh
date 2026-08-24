//! Sign in with Google.

use genzh_auth::OAuthUserInput;
use serde::Deserialize;

use crate::config::Config;
use crate::error::ApiResult;

use super::{Credentials, OAuthProvider, default_redirect_uri, parse};

pub(super) struct Google;

#[derive(Debug, Deserialize)]
struct Profile {
    sub: String,
    email: Option<String>,
    #[serde(default)]
    email_verified: Option<bool>,
    name: Option<String>,
    picture: Option<String>,
}

impl OAuthProvider for Google {
    fn key(&self) -> &'static str {
        "google"
    }

    fn display_name(&self) -> &'static str {
        "Google"
    }

    fn credentials(&self, config: &Config) -> Option<Credentials> {
        Some(Credentials {
            client_id: config.google_client_id.clone()?,
            client_secret: config.google_client_secret.clone(),
            redirect_uri: config
                .google_redirect_uri
                .clone()
                .unwrap_or_else(|| default_redirect_uri(config, self.key())),
        })
    }

    fn authorize_url(&self, credentials: &Credentials, csrf_state: &str) -> String {
        format!(
            "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={}&redirect_uri={}&scope=openid%20email%20profile&state={}&access_type=online",
            urlencoding::encode(&credentials.client_id),
            urlencoding::encode(&credentials.redirect_uri),
            urlencoding::encode(csrf_state),
        )
    }

    fn token_endpoint(&self) -> &'static str {
        "https://oauth2.googleapis.com/token"
    }

    fn userinfo_endpoint(&self) -> &'static str {
        "https://openidconnect.googleapis.com/v1/userinfo"
    }

    fn parse_profile(&self, profile: serde_json::Value) -> ApiResult<OAuthUserInput> {
        let profile: Profile = parse(profile, self.display_name())?;

        Ok(OAuthUserInput {
            provider: self.key().to_owned(),
            provider_user_id: profile.sub,
            // An unverified address is dropped rather than trusted: it is the
            // key an account would be matched on, and Google will happily
            // report one it has not checked.
            email: profile
                .email_verified
                .unwrap_or(false)
                .then_some(profile.email)
                .flatten(),
            suggested_handle: None,
            display_name: profile.name,
            avatar_url: profile.picture,
        })
    }
}
