//! Session lifetime: issuing a pair, rotating it, and ending it.
//!
//! Split out of `AuthService` because it changes for its own reasons. Nothing
//! here knows how somebody proved who they are — a password, an OAuth provider,
//! or something not yet written — and every one of those paths finishes by
//! asking for a session, so the rules about refresh-token reuse live in one
//! place instead of being a third of the file that also does registration.

use chrono::Utc;
use genzh_domain::{SessionId, UserId};

use crate::error::{AuthError, AuthResult};
use crate::jwt::{JwtService, TokenPair, hash_refresh_token};
use crate::repository::{SessionRepository, UserRepository};

/// Where a session was created from, recorded for the "your devices" screen.
#[derive(Debug, Clone, Default)]
pub struct SessionContext {
    /// `User-Agent` header.
    pub user_agent: Option<String>,
    /// Client address.
    pub ip_address: Option<String>,
}

/// Issues, rotates and revokes sessions.
#[derive(Debug, Clone)]
pub struct SessionManager {
    users: UserRepository,
    sessions: SessionRepository,
    jwt: std::sync::Arc<JwtService>,
}

impl SessionManager {
    pub(crate) fn new(
        users: UserRepository,
        sessions: SessionRepository,
        jwt: std::sync::Arc<JwtService>,
    ) -> Self {
        Self {
            users,
            sessions,
            jwt,
        }
    }

    /// The token signer, for callers that verify an access token themselves.
    pub fn jwt(&self) -> &JwtService {
        &self.jwt
    }

    /// Record a new session and hand back the pair that proves it.
    pub async fn start(&self, user_id: UserId, context: SessionContext) -> AuthResult<TokenPair> {
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
        self.start(session.user_id, context).await
    }

    /// End a session.
    ///
    /// Silent about whether the token was known: logging out is not a place to
    /// leak which tokens exist.
    pub async fn end(&self, refresh_token: &str) -> AuthResult<()> {
        let hash = hash_refresh_token(refresh_token);
        if let Some(session) = self.sessions.find_by_token_hash(&hash).await? {
            self.sessions.revoke(session.id).await?;
        }
        Ok(())
    }
}
