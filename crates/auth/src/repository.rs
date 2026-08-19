//! Persistence for accounts, profiles and sessions.
//!
//! Queries are runtime-checked (`query_as`, not `query_as!`) so the workspace
//! builds without a database — see `social-infrastructure`.

use chrono::{DateTime, Utc};
use genzh_domain::user::{Profile, User};
use genzh_domain::{SessionId, UserId};
use genzh_infrastructure::{DbPool, RepositoryError, RepositoryResult};

/// A stored refresh-token session.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Session {
    /// Primary key.
    pub id: SessionId,
    /// Owning account.
    pub user_id: UserId,
    /// SHA-256 of the refresh token.
    pub refresh_token_hash: String,
    /// Client user agent, for the "your sessions" screen.
    pub user_agent: Option<String>,
    /// Client address at login time.
    pub ip_address: Option<String>,
    /// When the refresh token stops working.
    pub expires_at: DateTime<Utc>,
    /// Set when the session was logged out or rotated away.
    pub revoked_at: Option<DateTime<Utc>>,
    /// Creation time.
    pub created_at: DateTime<Utc>,
}

impl Session {
    /// Can this session still be exchanged for a new token pair?
    pub fn is_usable(&self, now: DateTime<Utc>) -> bool {
        self.revoked_at.is_none() && self.expires_at > now
    }
}

/// Accounts and profiles.
#[derive(Debug, Clone)]
pub struct UserRepository {
    pool: DbPool,
}

impl UserRepository {
    /// Wrap a pool.
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Create an account and its profile atomically.
    ///
    /// One transaction, because an account without a profile is not a state
    /// any other part of the system knows how to render.
    pub async fn create(
        &self,
        user: &User,
        display_name: &str,
    ) -> RepositoryResult<(User, Profile)> {
        let mut tx = self.pool.begin().await?;

        let created: User = sqlx::query_as(
            "INSERT INTO users (id, handle, email, password_hash, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
             RETURNING id, handle, email, password_hash, is_active, created_at, updated_at",
        )
        .bind(user.id)
        .bind(&user.handle)
        .bind(&user.email)
        .bind(&user.password_hash)
        .fetch_one(&mut *tx)
        .await?;

        let profile: Profile = sqlx::query_as(
            "INSERT INTO profiles (user_id, display_name)
             VALUES ($1, $2)
             RETURNING user_id, display_name, bio, avatar_url, avatar_effect, accent_color,
                       created_at, updated_at",
        )
        .bind(user.id)
        .bind(display_name)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok((created, profile))
    }

    /// Find an account by id.
    pub async fn find_by_id(&self, user_id: UserId) -> RepositoryResult<Option<User>> {
        sqlx::query_as(
            "SELECT id, handle, email, password_hash, is_active, created_at, updated_at
             FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Find an account by handle *or* e-mail.
    ///
    /// Login accepts either, so this is one indexed query rather than two.
    pub async fn find_by_identifier(&self, identifier: &str) -> RepositoryResult<Option<User>> {
        sqlx::query_as(
            "SELECT id, handle, email, password_hash, is_active, created_at, updated_at
             FROM users WHERE handle = $1 OR email = $1",
        )
        .bind(identifier)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Fetch a profile.
    pub async fn find_profile(&self, user_id: UserId) -> RepositoryResult<Option<Profile>> {
        sqlx::query_as(
            "SELECT user_id, display_name, bio, avatar_url, avatar_effect, accent_color,
                    created_at, updated_at
             FROM profiles WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Update the mutable parts of a profile.
    ///
    /// `COALESCE` keeps this a partial update: a field the client did not send
    /// is left alone rather than blanked.
    pub async fn update_profile(
        &self,
        user_id: UserId,
        display_name: Option<&str>,
        bio: Option<&str>,
        avatar_url: Option<&str>,
        avatar_effect: Option<&str>,
        accent_color: Option<&str>,
    ) -> RepositoryResult<Profile> {
        sqlx::query_as(
            "UPDATE profiles SET
                display_name  = COALESCE($2, display_name),
                bio           = COALESCE($3, bio),
                avatar_url    = COALESCE($4, avatar_url),
                avatar_effect = COALESCE($5, avatar_effect),
                accent_color  = COALESCE($6, accent_color),
                updated_at    = now()
             WHERE user_id = $1
             RETURNING user_id, display_name, bio, avatar_url, avatar_effect, accent_color,
                       created_at, updated_at",
        )
        .bind(user_id)
        .bind(display_name)
        .bind(bio)
        .bind(avatar_url)
        .bind(avatar_effect)
        .bind(accent_color)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(RepositoryError::NotFound("profile"))
    }
}

/// Refresh-token sessions.
#[derive(Debug, Clone)]
pub struct SessionRepository {
    pool: DbPool,
}

impl SessionRepository {
    /// Wrap a pool.
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Store a new session.
    pub async fn create(
        &self,
        id: SessionId,
        user_id: UserId,
        refresh_token_hash: &str,
        user_agent: Option<&str>,
        ip_address: Option<&str>,
        expires_at: DateTime<Utc>,
    ) -> RepositoryResult<Session> {
        sqlx::query_as(
            "INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip_address, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, user_id, refresh_token_hash, user_agent, ip_address, expires_at,
                       revoked_at, created_at",
        )
        .bind(id)
        .bind(user_id)
        .bind(refresh_token_hash)
        .bind(user_agent)
        .bind(ip_address)
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Look a session up by the hash of its refresh token.
    pub async fn find_by_token_hash(&self, hash: &str) -> RepositoryResult<Option<Session>> {
        sqlx::query_as(
            "SELECT id, user_id, refresh_token_hash, user_agent, ip_address, expires_at,
                    revoked_at, created_at
             FROM sessions WHERE refresh_token_hash = $1",
        )
        .bind(hash)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Revoke one session.
    ///
    /// Returns whether it was live, so a replayed refresh token can be told
    /// apart from a first use.
    pub async fn revoke(&self, id: SessionId) -> RepositoryResult<bool> {
        let result = sqlx::query(
            "UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Revoke every live session for an account.
    ///
    /// Used when a refresh token is replayed, which means either the client is
    /// buggy or a token leaked; either way the safe response is to end them all.
    pub async fn revoke_all_for_user(&self, user_id: UserId) -> RepositoryResult<u64> {
        let result = sqlx::query(
            "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        )
        .bind(user_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Delete sessions that expired more than a day ago.
    pub async fn delete_expired(&self) -> RepositoryResult<u64> {
        let result =
            sqlx::query("DELETE FROM sessions WHERE expires_at < now() - INTERVAL '1 day'")
                .execute(&self.pool)
                .await?;
        Ok(result.rows_affected())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn session(revoked: bool, expires_in: Duration) -> Session {
        let now = Utc::now();
        Session {
            id: SessionId::new(),
            user_id: UserId::new(),
            refresh_token_hash: "deadbeef".into(),
            user_agent: None,
            ip_address: None,
            expires_at: now + expires_in,
            revoked_at: revoked.then_some(now),
            created_at: now,
        }
    }

    #[test]
    fn a_live_session_is_usable() {
        assert!(session(false, Duration::days(30)).is_usable(Utc::now()));
    }

    #[test]
    fn a_revoked_session_is_not_usable_even_before_expiry() {
        assert!(!session(true, Duration::days(30)).is_usable(Utc::now()));
    }

    #[test]
    fn an_expired_session_is_not_usable() {
        assert!(!session(false, Duration::seconds(-1)).is_usable(Utc::now()));
    }
}
