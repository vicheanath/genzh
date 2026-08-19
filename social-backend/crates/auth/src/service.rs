//! The authentication application service.
//!
//! Handlers call these methods; they contain no HTTP types and no SQL.

use chrono::Utc;
use social_domain::user::{self, Profile, User};
use social_domain::{SessionId, UserId};
use social_infrastructure::{DbPool, RepositoryError};

use crate::error::{AuthError, AuthResult};
use crate::jwt::{CurrentUser, JwtService, TokenPair, hash_refresh_token};
use crate::password;
use crate::repository::{SessionRepository, UserRepository};

/// Registration input, already deserialised but not yet validated.
#[derive(Debug, Clone)]
pub struct RegisterInput {
    /// Desired handle.
    pub handle: String,
    /// E-mail address.
    pub email: String,
    /// Plaintext password. Hashed immediately and never stored.
    pub password: String,
    /// Display name; defaults to the handle when absent.
    pub display_name: Option<String>,
}

/// Login input.
#[derive(Debug, Clone)]
pub struct LoginInput {
    /// Handle or e-mail.
    pub identifier: String,
    /// Plaintext password.
    pub password: String,
}

/// Where a session was created from, recorded for the "your devices" screen.
#[derive(Debug, Clone, Default)]
pub struct SessionContext {
    /// `User-Agent` header.
    pub user_agent: Option<String>,
    /// Client address.
    pub ip_address: Option<String>,
}

/// An authenticated identity plus its public profile.
#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    /// The account.
    pub user: User,
    /// The profile.
    pub profile: Profile,
}

/// Registration, login, refresh and logout.
#[derive(Debug, Clone)]
pub struct AuthService {
    users: UserRepository,
    sessions: SessionRepository,
    jwt: std::sync::Arc<JwtService>,
}

impl AuthService {
    /// Assemble the service from a pool and a configured [`JwtService`].
    pub fn new(pool: DbPool, jwt: std::sync::Arc<JwtService>) -> Self {
        Self {
            users: UserRepository::new(pool.clone()),
            sessions: SessionRepository::new(pool),
            jwt,
        }
    }

    /// Create an account and log it straight in.
    pub async fn register(
        &self,
        input: RegisterInput,
        context: SessionContext,
    ) -> AuthResult<(AuthenticatedUser, TokenPair)> {
        let handle = user::normalize_handle(&input.handle)?;
        let email = user::normalize_email(&input.email)?;
        user::validate_password(&input.password)?;

        let display_name = match input.display_name.as_deref() {
            Some(name) => user::validate_display_name(name)?,
            None => handle.clone(),
        };

        let password_hash = password::hash(input.password).await?;

        let now = Utc::now();
        let candidate = User {
            id: UserId::new(),
            handle,
            email,
            password_hash,
            is_active: true,
            created_at: now,
            updated_at: now,
        };

        let (created, profile) =
            self.users.create(&candidate, &display_name).await.map_err(map_registration_error)?;

        let tokens = self.start_session(created.id, context).await?;
        Ok((AuthenticatedUser { user: created, profile }, tokens))
    }

    /// Exchange credentials for a token pair.
    pub async fn login(
        &self,
        input: LoginInput,
        context: SessionContext,
    ) -> AuthResult<(AuthenticatedUser, TokenPair)> {
        let identifier = input.identifier.trim().to_lowercase();

        let Some(user) = self.users.find_by_identifier(&identifier).await? else {
            // Spend the same work as a real verification so response time does
            // not reveal whether the account exists.
            password::verify_dummy(input.password).await;
            return Err(AuthError::InvalidCredentials);
        };

        if !password::verify(input.password, user.password_hash.clone()).await {
            return Err(AuthError::InvalidCredentials);
        }

        if !user.is_active {
            return Err(AuthError::AccountInactive);
        }

        let profile = self
            .users
            .find_profile(user.id)
            .await?
            .ok_or(RepositoryError::NotFound("profile"))?;

        let tokens = self.start_session(user.id, context).await?;
        Ok((AuthenticatedUser { user, profile }, tokens))
    }

    /// Rotate a refresh token.
    ///
    /// The old session is revoked and a new one issued, so a stolen refresh
    /// token is usable at most once. Presenting an already-revoked token is
    /// treated as evidence of theft and ends every session for that account.
    pub async fn refresh(
        &self,
        refresh_token: &str,
        context: SessionContext,
    ) -> AuthResult<TokenPair> {
        let hash = hash_refresh_token(refresh_token);
        let session = self
            .sessions
            .find_by_token_hash(&hash)
            .await?
            .ok_or(AuthError::InvalidSession)?;

        if session.revoked_at.is_some() {
            tracing::warn!(
                user_id = %session.user_id,
                session_id = %session.id,
                "refresh token reuse detected; revoking all sessions"
            );
            self.sessions.revoke_all_for_user(session.user_id).await?;
            return Err(AuthError::InvalidSession);
        }

        if !session.is_usable(Utc::now()) {
            return Err(AuthError::InvalidSession);
        }

        let user = self
            .users
            .find_by_id(session.user_id)
            .await?
            .ok_or(AuthError::InvalidSession)?;
        if !user.is_active {
            return Err(AuthError::AccountInactive);
        }

        self.sessions.revoke(session.id).await?;
        self.start_session(session.user_id, context).await
    }

    /// End a session.
    ///
    /// Silent about whether the token was known: logging out is not a place to
    /// leak which tokens exist.
    pub async fn logout(&self, refresh_token: &str) -> AuthResult<()> {
        let hash = hash_refresh_token(refresh_token);
        if let Some(session) = self.sessions.find_by_token_hash(&hash).await? {
            self.sessions.revoke(session.id).await?;
        }
        Ok(())
    }

    /// Resolve the caller from a bearer token.
    pub fn authenticate(&self, access_token: &str) -> AuthResult<CurrentUser> {
        self.jwt.authenticate(access_token)
    }

    /// Load the account and profile behind an authenticated request.
    pub async fn current_user(&self, user_id: UserId) -> AuthResult<AuthenticatedUser> {
        let user = self.users.find_by_id(user_id).await?.ok_or(AuthError::InvalidToken)?;
        if !user.is_active {
            return Err(AuthError::AccountInactive);
        }
        let profile = self
            .users
            .find_profile(user_id)
            .await?
            .ok_or(RepositoryError::NotFound("profile"))?;
        Ok(AuthenticatedUser { user, profile })
    }

    /// The underlying user repository, for profile endpoints.
    pub fn users(&self) -> &UserRepository {
        &self.users
    }

    async fn start_session(
        &self,
        user_id: UserId,
        context: SessionContext,
    ) -> AuthResult<TokenPair> {
        let session_id = SessionId::new();
        let refresh_token = self.jwt.issue_refresh();

        self.sessions
            .create(
                session_id,
                user_id,
                &hash_refresh_token(&refresh_token),
                context.user_agent.as_deref(),
                context.ip_address.as_deref(),
                self.jwt.refresh_expiry(),
            )
            .await?;

        let access_token = self.jwt.issue_access(user_id, session_id)?;

        Ok(TokenPair {
            access_token,
            refresh_token,
            expires_in: self.jwt.access_ttl_seconds(),
            token_type: "Bearer",
        })
    }
}

/// Turn a unique-index violation into the field the user actually needs to fix.
fn map_registration_error(error: RepositoryError) -> AuthError {
    if error.is_conflict_on("users_handle_key") {
        return AuthError::AlreadyRegistered("handle");
    }
    if error.is_conflict_on("users_email_key") {
        return AuthError::AlreadyRegistered("email");
    }
    AuthError::Repository(error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unique_violations_name_the_offending_field() {
        let handle_taken =
            RepositoryError::Conflict { constraint: "users_handle_key".to_owned() };
        assert!(matches!(
            map_registration_error(handle_taken),
            AuthError::AlreadyRegistered("handle")
        ));

        let email_taken = RepositoryError::Conflict { constraint: "users_email_key".to_owned() };
        assert!(matches!(
            map_registration_error(email_taken),
            AuthError::AlreadyRegistered("email")
        ));
    }

    #[test]
    fn an_unrelated_conflict_is_not_reported_as_a_taken_handle() {
        let other = RepositoryError::Conflict { constraint: "sessions_refresh_token_hash_key".to_owned() };
        assert!(matches!(map_registration_error(other), AuthError::Repository(_)));
    }

    #[test]
    fn wrong_credentials_and_unknown_accounts_are_indistinguishable() {
        // Both paths in `login` return the same variant, and the variant has no
        // payload that could differentiate them.
        assert_eq!(AuthError::InvalidCredentials.code(), "INVALID_CREDENTIALS");
        assert_eq!(AuthError::InvalidCredentials.to_string(), "invalid credentials");
    }
}
