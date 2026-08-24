//! Signing somebody in with an account they hold somewhere else.
//!
//! Three ways this can go, tried in order, and each one is a function below:
//! the provider account is already linked to somebody here; it is not, but a
//! verified e-mail matches an account that is; or neither, and there is a new
//! account to provision.
//!
//! They were one function of a hundred and seventy lines. The order they are
//! tried in *is* the policy — matching on e-mail before provisioning is what
//! stops a second account appearing every time somebody switches provider —
//! and it was impossible to see.

use chrono::Utc;
use genzh_domain::user::{self, User};
use genzh_domain::UserId;
use genzh_infrastructure::RepositoryError;

use crate::error::{AuthError, AuthResult};
use crate::handle;
use crate::jwt::TokenPair;
use crate::repository::UserRepository;
use crate::service::{AuthenticatedUser, map_registration_error};
use crate::sessions::{SessionContext, SessionManager};

/// User information retrieved from an external OAuth provider.
#[derive(Debug, Clone)]
pub struct OAuthUserInput {
    /// Provider identifier, e.g. "google" or "discord".
    pub provider: String,
    /// Unique subject or user ID from the provider.
    pub provider_user_id: String,
    /// Verified e-mail address from the provider, if provided.
    pub email: Option<String>,
    /// Suggested handle / username from the provider.
    pub suggested_handle: Option<String>,
    /// Full or display name from the provider.
    pub display_name: Option<String>,
    /// Avatar URL from the provider.
    pub avatar_url: Option<String>,
}

/// How many times a colliding handle is retried before giving up on the base.
const HANDLE_ATTEMPTS: u8 = 10;

/// Sign in through a provider, provisioning an account if this is the first time.
pub(crate) async fn login_or_register(
    users: &UserRepository,
    sessions: &SessionManager,
    input: OAuthUserInput,
    context: SessionContext,
) -> AuthResult<(AuthenticatedUser, TokenPair)> {
    let user = match linked_account(users, &input).await? {
        Some(user) => user,
        None => match matching_email(users, &input).await? {
            Some(user) => user,
            None => return provision(users, sessions, input, context).await,
        },
    };

    let profile = users
        .find_profile(user.id)
        .await?
        .ok_or(RepositoryError::NotFound("profile"))?;
    let tokens = sessions.start(user.id, context).await?;

    Ok((AuthenticatedUser { user, profile }, tokens))
}

/// The account this provider identity is already attached to.
async fn linked_account(
    users: &UserRepository,
    input: &OAuthUserInput,
) -> AuthResult<Option<User>> {
    let Some(link) = users
        .find_oauth_account(&input.provider, &input.provider_user_id)
        .await?
    else {
        return Ok(None);
    };

    let user = users
        .find_by_id(link.user_id)
        .await?
        .ok_or(RepositoryError::NotFound("user"))?;

    active(user).map(Some)
}

/// An existing account reachable by the verified e-mail, which we then link.
///
/// Only a *verified* address gets here — the providers drop unverified ones
/// before this — because linking on an unverified address would let anybody who
/// can claim an e-mail at a provider walk into the account that owns it.
///
/// An address that will not normalise is treated as no address at all rather
/// than as an error: the sign-in still succeeds, as a new account.
async fn matching_email(
    users: &UserRepository,
    input: &OAuthUserInput,
) -> AuthResult<Option<User>> {
    let Some(email) = input
        .email
        .as_deref()
        .and_then(|raw| user::normalize_email(raw).ok())
    else {
        return Ok(None);
    };

    let Some(user) = users.find_by_identifier(&email).await? else {
        return Ok(None);
    };
    let user = active(user)?;

    users
        .link_oauth_account(
            user.id,
            &input.provider,
            &input.provider_user_id,
            Some(&email),
        )
        .await?;

    Ok(Some(user))
}

/// Create an account for somebody this app has not seen before.
async fn provision(
    users: &UserRepository,
    sessions: &SessionManager,
    input: OAuthUserInput,
    context: SessionContext,
) -> AuthResult<(AuthenticatedUser, TokenPair)> {
    let handle = unique_handle(users, &input).await?;

    // An account has to have an e-mail, and a provider is entitled to withhold
    // one. The placeholder is deliberately at a domain nobody can receive mail
    // at, so it can never collide with a real address somebody later verifies.
    let email = match input
        .email
        .as_deref()
        .and_then(|raw| user::normalize_email(raw).ok())
    {
        Some(email) => email,
        None => format!(
            "{}_{}@oauth.genzh.local",
            input.provider, input.provider_user_id
        ),
    };

    let display_name = input
        .display_name
        .as_deref()
        .and_then(|name| user::validate_display_name(name).ok())
        .unwrap_or_else(|| handle.clone());

    let now = Utc::now();
    let candidate = User {
        id: UserId::new(),
        handle,
        email: email.clone(),
        // No password: this account can only ever be reached through the
        // provider until its owner sets one.
        password_hash: None,
        is_active: true,
        created_at: now,
        updated_at: now,
    };

    let (created, profile, _) = users
        .create_oauth(
            &candidate,
            &display_name,
            input.avatar_url.as_deref(),
            &input.provider,
            &input.provider_user_id,
            Some(&email),
        )
        .await
        .map_err(map_registration_error)?;

    let tokens = sessions.start(created.id, context).await?;

    Ok((
        AuthenticatedUser {
            user: created,
            profile,
        },
        tokens,
    ))
}

/// Find a handle nobody has taken, starting from the one we would prefer.
///
/// The suffix is random rather than sequential so two people signing up at once
/// do not both walk the same ladder, and after [`HANDLE_ATTEMPTS`] tries it
/// stops guessing and takes a random one — a popular first name should not cost
/// a hundred round trips.
async fn unique_handle(users: &UserRepository, input: &OAuthUserInput) -> AuthResult<String> {
    let base = handle::preferred(
        input.suggested_handle.as_deref(),
        input.email.as_deref(),
        &input.provider,
        &input.provider_user_id,
    );

    let mut candidate = base.clone();
    for _ in 0..HANDLE_ATTEMPTS {
        if users.find_by_identifier(&candidate).await?.is_none() {
            return Ok(candidate);
        }
        candidate = handle::with_suffix(&base, &format!("{}", rand::random::<u16>() % 10000));
    }

    Ok(handle::random())
}

/// Refuse a deactivated account, whichever route reached it.
fn active(user: User) -> AuthResult<User> {
    if user.is_active {
        Ok(user)
    } else {
        Err(AuthError::AccountInactive)
    }
}
