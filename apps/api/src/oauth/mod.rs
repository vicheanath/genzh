//! Signing in through somebody else's identity provider.
//!
//! Every provider works the same way — send the user off with a client id, get
//! a code back, trade the code for a token, use the token to read a profile —
//! and that shared flow lives here, once, in [`exchange_code`]. What differs is
//! only ever four things: where the three endpoints are, what the profile JSON
//! looks like, and which field in it counts as a verified e-mail.
//!
//! That is what [`OAuthProvider`] asks for, and nothing more. Adding a provider
//! is a new file and one line in [`PROVIDERS`]; no handler, no route and no
//! config response has to learn about it. Before this, "google" and "discord"
//! were spelled out in a `match` in three separate places and their two
//! `fetch_*_user` functions were eighty-five duplicated lines apiece, so a third
//! provider meant a third copy and four edits.

mod discord;
mod google;

use genzh_auth::OAuthUserInput;
use serde::Deserialize;

use crate::config::Config;
use crate::error::{ApiError, ApiResult};

/// Every provider this API can sign somebody in with.
///
/// The registry, and the only list of them in the process.
pub const PROVIDERS: &[&dyn OAuthProvider] = &[&google::Google, &discord::Discord];

/// Look a provider up by the key that appears in the URL.
pub fn provider(key: &str) -> Option<&'static dyn OAuthProvider> {
    PROVIDERS.iter().copied().find(|p| p.key() == key)
}

/// What one provider needs from the configuration.
///
/// `client_secret` is absent for the authorize step, which never needs it — a
/// redirect that leaked the secret would be a serious bug, so it is not carried
/// down that path at all.
#[derive(Debug, Clone)]
pub struct Credentials {
    pub client_id: String,
    pub client_secret: Option<String>,
    pub redirect_uri: String,
}

/// One OAuth provider, as this API needs it.
///
/// Object-safe on purpose: the registry above is a table of them, so nothing
/// that uses a provider is generic over which one it is.
pub trait OAuthProvider: Send + Sync {
    /// The key in `/auth/oauth/{provider}/…`, and in the stored account row.
    fn key(&self) -> &'static str;

    /// Human name, for messages a person will read.
    fn display_name(&self) -> &'static str;

    /// Pull this provider's credentials out of the configuration.
    ///
    /// `None` means the deployment did not configure it, which is not an error
    /// until somebody tries to use it.
    fn credentials(&self, config: &Config) -> Option<Credentials>;

    /// Where to send the browser to ask the user for consent.
    fn authorize_url(&self, credentials: &Credentials, csrf_state: &str) -> String;

    /// Where a code is traded for an access token.
    fn token_endpoint(&self) -> &'static str;

    /// Where an access token buys a profile.
    fn userinfo_endpoint(&self) -> &'static str;

    /// Turn this provider's profile JSON into the shape the auth service takes.
    ///
    /// Providers differ on what a trustworthy e-mail is — Google reports
    /// `email_verified`, Discord reports `verified` — so deciding whether to
    /// pass the address on is part of this, not of the shared flow.
    fn parse_profile(&self, profile: serde_json::Value) -> ApiResult<OAuthUserInput>;

    /// This provider's credentials, or a message naming what is missing.
    ///
    /// Provided rather than required: every provider answers it the same way,
    /// out of [`Self::credentials`].
    fn require_credentials(&self, config: &Config) -> ApiResult<Credentials> {
        self.credentials(config).ok_or_else(|| {
            ApiError::BadRequest(format!("{} OAuth is not configured", self.display_name()))
        })
    }
}

/// The default redirect back to this API, when the deployment has not set one.
pub fn default_redirect_uri(config: &Config, key: &str) -> String {
    format!(
        "{}/api/v1/auth/oauth/{}/callback",
        config.frontend_url, key
    )
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

/// Trade an authorization code for the user behind it.
///
/// The whole provider-independent half of the dance: two requests, four ways to
/// fail, and one shape at the end. Failures are logged with the provider's
/// response and reported to the caller as one flat sentence — what a token
/// endpoint says about a bad code is for the log, not for the browser.
pub async fn exchange_code(
    provider: &dyn OAuthProvider,
    config: &Config,
    code: &str,
) -> ApiResult<OAuthUserInput> {
    let credentials = provider.require_credentials(config)?;
    let client_secret = credentials.client_secret.as_deref().ok_or_else(|| {
        ApiError::BadRequest(format!(
            "{} OAuth secret is not configured",
            provider.display_name()
        ))
    })?;

    let http = reqwest::Client::new();
    let name = provider.display_name();

    let token: TokenResponse = post_form(
        &http,
        provider.token_endpoint(),
        &[
            ("code", code),
            ("client_id", &credentials.client_id),
            ("client_secret", client_secret),
            ("redirect_uri", &credentials.redirect_uri),
            ("grant_type", "authorization_code"),
        ],
        name,
        "token",
    )
    .await?;

    let profile = get_json(
        &http,
        provider.userinfo_endpoint(),
        &token.access_token,
        name,
        "userinfo",
    )
    .await?;

    provider.parse_profile(profile)
}

async fn post_form<T: serde::de::DeserializeOwned>(
    http: &reqwest::Client,
    url: &str,
    form: &[(&str, &str)],
    provider: &str,
    step: &str,
) -> ApiResult<T> {
    let response = http.post(url).form(form).send().await.map_err(|error| {
        tracing::error!(%error, provider, step, "OAuth request failed");
        ApiError::BadRequest(format!("{provider} authentication failed"))
    })?;

    read_json(response, provider, step).await
}

async fn get_json(
    http: &reqwest::Client,
    url: &str,
    access_token: &str,
    provider: &str,
    step: &str,
) -> ApiResult<serde_json::Value> {
    let response = http
        .get(url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| {
            tracing::error!(%error, provider, step, "OAuth request failed");
            ApiError::BadRequest(format!("{provider} authentication failed"))
        })?;

    read_json(response, provider, step).await
}

async fn read_json<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
    provider: &str,
    step: &str,
) -> ApiResult<T> {
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        tracing::error!(%status, %body, provider, step, "OAuth endpoint returned an error");
        return Err(ApiError::BadRequest(format!(
            "{provider} authentication failed"
        )));
    }

    response.json().await.map_err(|error| {
        tracing::error!(%error, provider, step, "could not parse an OAuth response");
        ApiError::BadRequest(format!("{provider} authentication failed"))
    })
}

/// Read a provider's profile JSON into its own typed shape.
pub(crate) fn parse<T: serde::de::DeserializeOwned>(
    profile: serde_json::Value,
    provider: &str,
) -> ApiResult<T> {
    serde_json::from_value(profile).map_err(|error| {
        tracing::error!(%error, provider, "unexpected OAuth profile shape");
        ApiError::BadRequest(format!("Could not read your {provider} profile"))
    })
}
