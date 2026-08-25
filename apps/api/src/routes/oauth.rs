//! OAuth sign-in endpoints.
//!
//! Three handlers, none of which name a provider: which ones exist, and what
//! each one does differently, lives in [`crate::oauth`]. Adding a provider does
//! not touch this file.

use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Json, Redirect, Response};
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult};
use crate::oauth;
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
///
/// One flag per provider rather than a list, because that is the shape clients
/// already read. A new provider adds a field here, which is the one place
/// outside `crate::oauth` that has to hear about it — the wire format is a
/// published contract and cannot quietly become an array.
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
    let configured = |key: &str| {
        oauth::provider(key).is_some_and(|provider| provider.credentials(&state.config).is_some())
    };

    Json(AuthConfigResponse {
        app_env: state.config.app_env.clone(),
        allow_password_signup: state.config.allow_password_signup,
        oauth_providers: OAuthProvidersConfig {
            google: configured("google"),
            discord: configured("discord"),
        },
    })
}

/// `GET /api/v1/auth/oauth/{provider}/authorize`
pub async fn authorize(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> ApiResult<Response> {
    let provider = provider_or_error(&key)?;
    let credentials = provider.require_credentials(&state.config)?;
    let csrf_state = uuid::Uuid::new_v4().to_string();

    let url = provider.authorize_url(&credentials, &csrf_state);
    Ok(Redirect::temporary(&url).into_response())
}

/// `GET /api/v1/auth/oauth/{provider}/callback`
pub async fn callback(
    State(state): State<AppState>,
    Path(key): Path<String>,
    headers: HeaderMap,
    Query(query): Query<CallbackQuery>,
) -> ApiResult<Response> {
    let provider = provider_or_error(&key)?;

    // The user said no, or the provider refused. Either way this is not an API
    // error: the browser is mid-redirect and needs somewhere to land.
    if let Some(err) = query.error {
        let desc = query.error_description.unwrap_or(err);
        tracing::warn!(error = %desc, provider = %key, "OAuth authorization error");
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

    let user_info = oauth::exchange_code(provider, &state.config, &code).await?;

    let context = session_context(&headers);
    let (user, tokens) = state
        .auth
        .login_or_register_oauth(user_info, context)
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(user.user.id),
            genzh_domain::audit::AuditAction::UserOAuthLogin,
            format!("User @{} signed in via {}", user.user.handle, key),
        )
        .by(&user.user.handle)
        .about("user", user.user.id.as_uuid()),
    ).await;

    let redirect_url = format!(
        "{}/oauth/callback#access_token={}&refresh_token={}",
        state.config.frontend_url,
        urlencoding::encode(&tokens.access_token),
        urlencoding::encode(&tokens.refresh_token),
    );

    Ok(Redirect::temporary(&redirect_url).into_response())
}

fn provider_or_error(key: &str) -> ApiResult<&'static dyn oauth::OAuthProvider> {
    oauth::provider(key)
        .ok_or_else(|| ApiError::BadRequest(format!("Unsupported OAuth provider: {key}")))
}
