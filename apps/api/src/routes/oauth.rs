//! OAuth handlers for Google and Discord login and registration.

use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Json, Redirect, Response};
use genzh_auth::OAuthUserInput;
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult};
use crate::routes::auth::session_context;
use crate::state::AppState;

/// Configuration details returned to the frontend.
#[derive(Debug, Serialize)]
pub struct AuthConfigResponse {
    /// Environment ("development", "production", etc.)
    pub app_env: String,
    /// Whether password registration is enabled.
    pub allow_password_signup: bool,
    /// Which OAuth providers are configured.
    pub oauth_providers: OAuthProvidersConfig,
}

/// Available OAuth providers.
#[derive(Debug, Serialize)]
pub struct OAuthProvidersConfig {
    pub google: bool,
    pub discord: bool,
}

/// Query parameters passed back to the OAuth redirect callback.
#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// `GET /api/v1/auth/config`
pub async fn config(State(state): State<AppState>) -> Json<AuthConfigResponse> {
    Json(AuthConfigResponse {
        app_env: state.config.app_env.clone(),
        allow_password_signup: state.config.allow_password_signup,
        oauth_providers: OAuthProvidersConfig {
            google: state.config.google_client_id.is_some(),
            discord: state.config.discord_client_id.is_some(),
        },
    })
}

/// `GET /api/v1/auth/oauth/{provider}/authorize`
pub async fn authorize(
    State(state): State<AppState>,
    Path(provider): Path<String>,
) -> ApiResult<Response> {
    let csrf_state = uuid::Uuid::new_v4().to_string();
    let url = match provider.as_str() {
        "google" => {
            let client_id = state
                .config
                .google_client_id
                .as_deref()
                .ok_or_else(|| ApiError::BadRequest("Google OAuth is not configured".to_owned()))?;
            let redirect_uri = state
                .config
                .google_redirect_uri
                .clone()
                .unwrap_or_else(|| format!("{}/api/v1/auth/oauth/google/callback", state.config.frontend_url));

            format!(
                "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={}&redirect_uri={}&scope=openid%20email%20profile&state={}&access_type=online",
                urlencoding::encode(client_id),
                urlencoding::encode(&redirect_uri),
                urlencoding::encode(&csrf_state),
            )
        }
        "discord" => {
            let client_id = state
                .config
                .discord_client_id
                .as_deref()
                .ok_or_else(|| ApiError::BadRequest("Discord OAuth is not configured".to_owned()))?;
            let redirect_uri = state
                .config
                .discord_redirect_uri
                .clone()
                .unwrap_or_else(|| format!("{}/api/v1/auth/oauth/discord/callback", state.config.frontend_url));

            format!(
                "https://discord.com/oauth2/authorize?response_type=code&client_id={}&redirect_uri={}&scope=identify%20email&state={}",
                urlencoding::encode(client_id),
                urlencoding::encode(&redirect_uri),
                urlencoding::encode(&csrf_state),
            )
        }
        _ => return Err(ApiError::BadRequest(format!("Unsupported OAuth provider: {provider}"))),
    };

    Ok(Redirect::temporary(&url).into_response())
}

/// `GET /api/v1/auth/oauth/{provider}/callback`
pub async fn callback(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    headers: HeaderMap,
    Query(query): Query<CallbackQuery>,
) -> ApiResult<Response> {
    if let Some(err) = query.error {
        let desc = query.error_description.unwrap_or(err);
        tracing::warn!(error = %desc, "OAuth authorization error");
        let target = format!(
            "{}/login?error={}",
            state.config.frontend_url,
            urlencoding::encode(&desc)
        );
        return Ok(Redirect::temporary(&target).into_response());
    }

    let Some(code) = query.code else {
        return Err(ApiError::BadRequest("Missing authorization code".to_owned()));
    };

    let user_info = match provider.as_str() {
        "google" => fetch_google_user(&state, &code).await?,
        "discord" => fetch_discord_user(&state, &code).await?,
        _ => return Err(ApiError::BadRequest(format!("Unsupported OAuth provider: {provider}"))),
    };

    let context = session_context(&headers);
    let (_user, tokens) = state
        .auth
        .login_or_register_oauth(user_info, context)
        .await?;

    let redirect_url = format!(
        "{}/oauth/callback#access_token={}&refresh_token={}",
        state.config.frontend_url,
        urlencoding::encode(&tokens.access_token),
        urlencoding::encode(&tokens.refresh_token),
    );

    Ok(Redirect::temporary(&redirect_url).into_response())
}

#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    sub: String,
    email: Option<String>,
    #[serde(default)]
    email_verified: Option<bool>,
    name: Option<String>,
    picture: Option<String>,
}

async fn fetch_google_user(state: &AppState, code: &str) -> ApiResult<OAuthUserInput> {
    let client_id = state
        .config
        .google_client_id
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("Google OAuth is not configured".to_owned()))?;
    let client_secret = state
        .config
        .google_client_secret
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("Google OAuth secret is not configured".to_owned()))?;
    let redirect_uri = state
        .config
        .google_redirect_uri
        .clone()
        .unwrap_or_else(|| format!("{}/api/v1/auth/oauth/google/callback", state.config.frontend_url));

    let client = reqwest::Client::new();
    let token_res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", &redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|err| {
            tracing::error!(%err, "failed to call google token endpoint");
            ApiError::BadRequest("Failed to exchange Google OAuth code".to_owned())
        })?;

    if !token_res.status().is_success() {
        let status = token_res.status();
        let body = token_res.text().await.unwrap_or_default();
        tracing::error!(%status, %body, "Google token endpoint returned non-200");
        return Err(ApiError::BadRequest("Google authentication failed".to_owned()));
    }

    let token_data: GoogleTokenResponse = token_res.json().await.map_err(|err| {
        tracing::error!(%err, "failed to parse google token response");
        ApiError::BadRequest("Failed to parse Google token response".to_owned())
    })?;

    let user_res = client
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(&token_data.access_token)
        .send()
        .await
        .map_err(|err| {
            tracing::error!(%err, "failed to call google userinfo endpoint");
            ApiError::BadRequest("Failed to retrieve Google user info".to_owned())
        })?;

    if !user_res.status().is_success() {
        let status = user_res.status();
        let body = user_res.text().await.unwrap_or_default();
        tracing::error!(%status, %body, "Google userinfo returned non-200");
        return Err(ApiError::BadRequest("Failed to fetch Google profile".to_owned()));
    }

    let user_info: GoogleUserInfo = user_res.json().await.map_err(|err| {
        tracing::error!(%err, "failed to parse google userinfo response");
        ApiError::BadRequest("Failed to parse Google profile".to_owned())
    })?;

    let email = if user_info.email_verified.unwrap_or(false) {
        user_info.email
    } else {
        None
    };

    Ok(OAuthUserInput {
        provider: "google".to_owned(),
        provider_user_id: user_info.sub,
        email,
        suggested_handle: None,
        display_name: user_info.name,
        avatar_url: user_info.picture,
    })
}

#[derive(Debug, Deserialize)]
struct DiscordTokenResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct DiscordUserInfo {
    id: String,
    username: String,
    global_name: Option<String>,
    email: Option<String>,
    #[serde(default)]
    verified: Option<bool>,
    avatar: Option<String>,
}

async fn fetch_discord_user(state: &AppState, code: &str) -> ApiResult<OAuthUserInput> {
    let client_id = state
        .config
        .discord_client_id
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("Discord OAuth is not configured".to_owned()))?;
    let client_secret = state
        .config
        .discord_client_secret
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("Discord OAuth secret is not configured".to_owned()))?;
    let redirect_uri = state
        .config
        .discord_redirect_uri
        .clone()
        .unwrap_or_else(|| format!("{}/api/v1/auth/oauth/discord/callback", state.config.frontend_url));

    let client = reqwest::Client::new();
    let token_res = client
        .post("https://discord.com/api/oauth2/token")
        .form(&[
            ("code", code),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", &redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|err| {
            tracing::error!(%err, "failed to call discord token endpoint");
            ApiError::BadRequest("Failed to exchange Discord OAuth code".to_owned())
        })?;

    if !token_res.status().is_success() {
        let status = token_res.status();
        let body = token_res.text().await.unwrap_or_default();
        tracing::error!(%status, %body, "Discord token endpoint returned non-200");
        return Err(ApiError::BadRequest("Discord authentication failed".to_owned()));
    }

    let token_data: DiscordTokenResponse = token_res.json().await.map_err(|err| {
        tracing::error!(%err, "failed to parse discord token response");
        ApiError::BadRequest("Failed to parse Discord token response".to_owned())
    })?;

    let user_res = client
        .get("https://discord.com/api/users/@me")
        .bearer_auth(&token_data.access_token)
        .send()
        .await
        .map_err(|err| {
            tracing::error!(%err, "failed to call discord userinfo endpoint");
            ApiError::BadRequest("Failed to retrieve Discord user info".to_owned())
        })?;

    if !user_res.status().is_success() {
        let status = user_res.status();
        let body = user_res.text().await.unwrap_or_default();
        tracing::error!(%status, %body, "Discord userinfo returned non-200");
        return Err(ApiError::BadRequest("Failed to fetch Discord profile".to_owned()));
    }

    let user_info: DiscordUserInfo = user_res.json().await.map_err(|err| {
        tracing::error!(%err, "failed to parse discord userinfo response");
        ApiError::BadRequest("Failed to parse Discord profile".to_owned())
    })?;

    let avatar_url = user_info.avatar.map(|hash| {
        format!("https://cdn.discordapp.com/avatars/{}/{}.png", user_info.id, hash)
    });

    let email = if user_info.verified.unwrap_or(false) {
        user_info.email
    } else {
        None
    };

    Ok(OAuthUserInput {
        provider: "discord".to_owned(),
        provider_user_id: user_info.id,
        email,
        suggested_handle: Some(user_info.username),
        display_name: user_info.global_name,
        avatar_url,
    })
}
