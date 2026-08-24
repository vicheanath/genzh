//! The authentication application service.
//!
//! Handlers call these methods; they contain no HTTP types and no SQL.
//!
//! What is left here is credentials and identity: proving who somebody is with
//! a password, and answering questions about who somebody is. The two things
//! that used to sit alongside it have moved out, because they change for their
//! own reasons — [`crate::sessions`] owns the lifetime of a token pair, and
//! [`crate::oauth`] owns signing in through a provider. Both are reachable
//! through this service, so callers still have one place to go.

use chrono::Utc;
use genzh_domain::user::{self, Profile, User};
use genzh_domain::{UserId};
use genzh_infrastructure::{DbPool, RepositoryError};

use crate::error::{AuthError, AuthResult};
use crate::jwt::{CurrentUser, JwtService, TokenPair};
use crate::oauth::{self, OAuthUserInput};
use crate::password;
use crate::repository::{SessionRepository, UserRepository};
use crate::sessions::{SessionContext, SessionManager};

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

/// A partial profile edit.
///
/// A struct rather than six positional `Option<&str>`s, which is what this was:
/// `update_profile(id, None, Some(bio), None, None, colour)` is a call nobody
/// can read, and swapping two of the six is a bug the compiler cannot see.
/// Absent fields are left alone.
#[derive(Debug, Clone, Default)]
pub struct UpdateProfile<'a> {
    /// New display name.
    pub display_name: Option<&'a str>,
    /// New bio.
    pub bio: Option<&'a str>,
    /// New avatar image URL.
    pub avatar_url: Option<&'a str>,
    /// New animated avatar effect key.
    pub avatar_effect: Option<&'a str>,
    /// New accent colour.
    pub accent_color: Option<&'a str>,
}

/// An authenticated identity plus its public profile.
#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    /// The account.
    pub user: User,
    /// The profile.
    pub profile: Profile,
}

/// Credentials, identity, and the way in to the rest of authentication.
///
/// The repositories are private. They were reachable through a `users()`
/// accessor "for profile endpoints", and the endpoints then reached past the
/// service for everything else on it — so a handler that wanted one display
/// name depended on the whole storage surface. The narrow methods below are
/// what those callers actually needed.
#[derive(Debug, Clone)]
pub struct AuthService {
    users: UserRepository,
    sessions: SessionManager,
}

impl AuthService {
    /// Access the JWT service.
    pub fn jwt(&self) -> &JwtService {
        self.sessions.jwt()
    }

    /// Sessions, for callers that manage one directly.
    pub fn sessions(&self) -> &SessionManager {
        &self.sessions
    }

    /// Assemble the service from a pool and a configured [`JwtService`].
    pub fn new(pool: DbPool, jwt: std::sync::Arc<JwtService>) -> Self {
        let users = UserRepository::new(pool.clone());
        Self {
            sessions: SessionManager::new(users.clone(), SessionRepository::new(pool), jwt),
            users,
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
            password_hash: Some(password_hash),
            is_active: true,
            created_at: now,
            updated_at: now,
        };

        let (created, profile) = self
            .users
            .create(&candidate, &display_name)
            .await
            .map_err(map_registration_error)?;

        let tokens = self.sessions.start(created.id, context).await?;
        Ok((
            AuthenticatedUser {
                user: created,
                profile,
            },
            tokens,
        ))
    }

    /// Sign in or register via an OAuth provider.
    ///
    /// The policy — link, then match on a verified e-mail, then provision — is
    /// in [`crate::oauth`].
    pub async fn login_or_register_oauth(
        &self,
        input: OAuthUserInput,
        context: SessionContext,
    ) -> AuthResult<(AuthenticatedUser, TokenPair)> {
        oauth::login_or_register(&self.users, &self.sessions, input, context).await
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

        let Some(password_hash) = user.password_hash.clone() else {
            // Account was created with OAuth without a password
            password::verify_dummy(input.password).await;
            return Err(AuthError::InvalidCredentials);
        };

        if !password::verify(input.password, password_hash).await {
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

        let tokens = self.sessions.start(user.id, context).await?;
        Ok((AuthenticatedUser { user, profile }, tokens))
    }

    /// Rotate a refresh token.
    ///
    /// Reuse detection and revocation live in [`SessionManager::refresh`].
    pub async fn refresh(
        &self,
        refresh_token: &str,
        context: SessionContext,
    ) -> AuthResult<TokenPair> {
        self.sessions.refresh(refresh_token, context).await
    }

    /// End a session.
    pub async fn logout(&self, refresh_token: &str) -> AuthResult<()> {
        self.sessions.end(refresh_token).await
    }

    /// Resolve the caller from a bearer token.
    pub fn authenticate(&self, access_token: &str) -> AuthResult<CurrentUser> {
        self.jwt().authenticate(access_token)
    }

    /// Load the account and profile behind an authenticated request.
    pub async fn current_user(&self, user_id: UserId) -> AuthResult<AuthenticatedUser> {
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AuthError::InvalidToken)?;
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

    /// The account and profile behind an id, for showing one user to another.
    ///
    /// Distinct from [`Self::current_user`], which is about *this* request's
    /// caller and refuses a deactivated account. Looking somebody up is not
    /// authenticating as them: a deactivated author still has a name on the
    /// messages they already posted, and blanking those is not this method's
    /// call to make.
    pub async fn identity(&self, user_id: UserId) -> AuthResult<Option<AuthenticatedUser>> {
        let Some(user) = self.users.find_by_id(user_id).await? else {
            return Ok(None);
        };
        let Some(profile) = self.users.find_profile(user_id).await? else {
            return Ok(None);
        };
        Ok(Some(AuthenticatedUser { user, profile }))
    }

    /// One public profile.
    pub async fn profile(&self, user_id: UserId) -> AuthResult<Option<Profile>> {
        Ok(self.users.find_profile(user_id).await?)
    }

    /// Resolve `@handle` mentions to the accounts they name.
    ///
    /// Handles that match nobody are simply absent from the result — a mention
    /// of a name that does not exist is a piece of text, not an error.
    pub async fn ids_by_handles(&self, handles: &[String]) -> AuthResult<Vec<(String, UserId)>> {
        Ok(self.users.find_ids_by_handles(handles).await?)
    }

    /// Find an account by handle or e-mail.
    pub async fn find_by_identifier(&self, identifier: &str) -> AuthResult<Option<User>> {
        Ok(self.users.find_by_identifier(identifier).await?)
    }

    /// Apply a partial profile edit.
    pub async fn update_profile(
        &self,
        user_id: UserId,
        input: UpdateProfile<'_>,
    ) -> AuthResult<Profile> {
        Ok(self
            .users
            .update_profile(
                user_id,
                input.display_name,
                input.bio,
                input.avatar_url,
                input.avatar_effect,
                input.accent_color,
            )
            .await?)
    }

}

/// Turn a unique-index violation into the field the user actually needs to fix.
pub(crate) fn map_registration_error(error: RepositoryError) -> AuthError {
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
        let handle_taken = RepositoryError::Conflict {
            constraint: "users_handle_key".to_owned(),
        };
        assert!(matches!(
            map_registration_error(handle_taken),
            AuthError::AlreadyRegistered("handle")
        ));

        let email_taken = RepositoryError::Conflict {
            constraint: "users_email_key".to_owned(),
        };
        assert!(matches!(
            map_registration_error(email_taken),
            AuthError::AlreadyRegistered("email")
        ));
    }

    #[test]
    fn an_unrelated_conflict_is_not_reported_as_a_taken_handle() {
        let other = RepositoryError::Conflict {
            constraint: "sessions_refresh_token_hash_key".to_owned(),
        };
        assert!(matches!(
            map_registration_error(other),
            AuthError::Repository(_)
        ));
    }

    #[test]
    fn wrong_credentials_and_unknown_accounts_are_indistinguishable() {
        // Both paths in `login` return the same variant, and the variant has no
        // payload that could differentiate them.
        assert_eq!(AuthError::InvalidCredentials.code(), "INVALID_CREDENTIALS");
        assert_eq!(
            AuthError::InvalidCredentials.to_string(),
            "invalid credentials"
        );
    }
}
