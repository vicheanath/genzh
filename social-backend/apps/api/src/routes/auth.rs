//! Registration, login, refresh, logout and `/me`.

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::http::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use social_auth::{LoginInput, RegisterInput, SessionContext, TokenPair};
use social_domain::user::Profile;

use crate::extract::ApiJson;
use crate::error::ApiResult;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// `POST /api/v1/auth/register` body.
#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    /// Desired handle.
    pub handle: String,
    /// E-mail address.
    pub email: String,
    /// Plaintext password.
    pub password: String,
    /// Optional display name.
    #[serde(default)]
    pub display_name: Option<String>,
}

/// `POST /api/v1/auth/login` body.
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    /// Handle or e-mail.
    pub identifier: String,
    /// Plaintext password.
    pub password: String,
}

/// A body carrying only a refresh token.
#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    /// The refresh token.
    pub refresh_token: String,
}

/// The public view of an account.
#[derive(Debug, Serialize)]
pub struct UserResponse {
    /// Account id.
    pub id: social_domain::UserId,
    /// Handle.
    pub handle: String,
    /// E-mail. Only ever returned to the account's own owner.
    pub email: String,
    /// Public profile.
    pub profile: Profile,
}

/// A successful authentication.
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    /// The account.
    pub user: UserResponse,
    /// Its tokens.
    #[serde(flatten)]
    pub tokens: TokenPair,
}

/// `POST /api/v1/auth/register`
pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    ApiJson(body): ApiJson<RegisterRequest>,
) -> ApiResult<Json<AuthResponse>> {
    let (user, tokens) = state
        .auth
        .register(
            RegisterInput {
                handle: body.handle,
                email: body.email,
                password: body.password,
                display_name: body.display_name,
            },
            session_context(&headers),
        )
        .await?;

    Ok(Json(AuthResponse {
        user: UserResponse {
            id: user.user.id,
            handle: user.user.handle,
            email: user.user.email,
            profile: user.profile,
        },
        tokens,
    }))
}

/// `POST /api/v1/auth/login`
pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    ApiJson(body): ApiJson<LoginRequest>,
) -> ApiResult<Json<AuthResponse>> {
    let (user, tokens) = state
        .auth
        .login(
            LoginInput { identifier: body.identifier, password: body.password },
            session_context(&headers),
        )
        .await?;

    Ok(Json(AuthResponse {
        user: UserResponse {
            id: user.user.id,
            handle: user.user.handle,
            email: user.user.email,
            profile: user.profile,
        },
        tokens,
    }))
}

/// `POST /api/v1/auth/refresh`
pub async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    ApiJson(body): ApiJson<RefreshRequest>,
) -> ApiResult<Json<TokenPair>> {
    let tokens = state.auth.refresh(&body.refresh_token, session_context(&headers)).await?;
    Ok(Json(tokens))
}

/// `POST /api/v1/auth/logout`
///
/// Always succeeds, whether or not the token was known: reporting "no such
/// session" would let an attacker probe for live tokens.
pub async fn logout(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<RefreshRequest>,
) -> ApiResult<axum::http::StatusCode> {
    state.auth.logout(&body.refresh_token).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// `GET /api/v1/me`
pub async fn me(
    State(state): State<AppState>,
    caller: CurrentUser,
) -> ApiResult<Json<UserResponse>> {
    let user = state.auth.current_user(caller.user_id).await?;
    Ok(Json(UserResponse {
        id: user.user.id,
        handle: user.user.handle,
        email: user.user.email,
        profile: user.profile,
    }))
}

/// `PATCH /api/v1/me` body.
#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    /// New display name.
    #[serde(default)]
    pub display_name: Option<String>,
    /// New bio.
    #[serde(default)]
    pub bio: Option<String>,
    /// New avatar image.
    #[serde(default)]
    pub avatar_url: Option<String>,
    /// New animated avatar effect key.
    #[serde(default)]
    pub avatar_effect: Option<String>,
    /// New accent colour.
    #[serde(default)]
    pub accent_color: Option<String>,
}

/// `PATCH /api/v1/me`
pub async fn update_profile(
    State(state): State<AppState>,
    caller: CurrentUser,
    ApiJson(body): ApiJson<UpdateProfileRequest>,
) -> ApiResult<Json<Profile>> {
    if let Some(name) = body.display_name.as_deref() {
        social_domain::user::validate_display_name(name)?;
    }

    let profile = state
        .auth
        .users()
        .update_profile(
            caller.user_id,
            body.display_name.as_deref(),
            body.bio.as_deref(),
            body.avatar_url.as_deref(),
            body.avatar_effect.as_deref(),
            body.accent_color.as_deref(),
        )
        .await
        .map_err(social_infrastructure::ServiceError::Repository)?;

    Ok(Json(profile))
}

/// Capture where a session was created from.
fn session_context(headers: &HeaderMap) -> SessionContext {
    SessionContext {
        user_agent: headers
            .get(USER_AGENT)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.chars().take(256).collect()),
        // The socket address is not trustworthy behind a proxy and
        // `X-Forwarded-For` is client-controlled unless the proxy is trusted,
        // so this is left for the deployment to fill in deliberately.
        ip_address: None,
    }
}
