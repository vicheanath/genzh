//! Persistence for the social graph.

use social_domain::social::{Block, Friendship, FriendshipStatus};
use social_domain::UserId;
use social_infrastructure::{DbPool, RepositoryError, RepositoryResult};

/// Friendships and blocks.
#[derive(Debug, Clone)]
pub struct SocialRepository {
    pool: DbPool,
}

impl SocialRepository {
    /// Wrap a pool.
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Find the friendship row for a pair, in either direction.
    pub async fn find_between(
        &self,
        a: UserId,
        b: UserId,
    ) -> RepositoryResult<Option<Friendship>> {
        sqlx::query_as(
            "SELECT requester_id, addressee_id, status, created_at, updated_at
             FROM friendships
             WHERE (requester_id = $1 AND addressee_id = $2)
                OR (requester_id = $2 AND addressee_id = $1)",
        )
        .bind(a)
        .bind(b)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Create a friend request.
    pub async fn request(
        &self,
        requester_id: UserId,
        addressee_id: UserId,
    ) -> RepositoryResult<Friendship> {
        sqlx::query_as(
            "INSERT INTO friendships (requester_id, addressee_id, status)
             VALUES ($1, $2, 'pending')
             RETURNING requester_id, addressee_id, status, created_at, updated_at",
        )
        .bind(requester_id)
        .bind(addressee_id)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Move a friendship to a new state.
    pub async fn set_status(
        &self,
        requester_id: UserId,
        addressee_id: UserId,
        status: FriendshipStatus,
    ) -> RepositoryResult<Friendship> {
        sqlx::query_as(
            "UPDATE friendships SET status = $3, updated_at = now()
             WHERE requester_id = $1 AND addressee_id = $2
             RETURNING requester_id, addressee_id, status, created_at, updated_at",
        )
        .bind(requester_id)
        .bind(addressee_id)
        .bind(status)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(RepositoryError::NotFound("friendship"))
    }

    /// Delete a friendship row entirely.
    pub async fn remove(&self, a: UserId, b: UserId) -> RepositoryResult<bool> {
        let result = sqlx::query(
            "DELETE FROM friendships
             WHERE (requester_id = $1 AND addressee_id = $2)
                OR (requester_id = $2 AND addressee_id = $1)",
        )
        .bind(a)
        .bind(b)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Friendships involving a user, in a given state.
    pub async fn list_by_status(
        &self,
        user_id: UserId,
        status: FriendshipStatus,
    ) -> RepositoryResult<Vec<Friendship>> {
        sqlx::query_as(
            "SELECT requester_id, addressee_id, status, created_at, updated_at
             FROM friendships
             WHERE (requester_id = $1 OR addressee_id = $1) AND status = $2
             ORDER BY updated_at DESC",
        )
        .bind(user_id)
        .bind(status)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Block a user. Idempotent.
    pub async fn block(&self, blocker_id: UserId, blocked_id: UserId) -> RepositoryResult<Block> {
        sqlx::query_as(
            "INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
             ON CONFLICT (blocker_id, blocked_id) DO UPDATE SET blocker_id = EXCLUDED.blocker_id
             RETURNING blocker_id, blocked_id, created_at",
        )
        .bind(blocker_id)
        .bind(blocked_id)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Unblock a user.
    pub async fn unblock(
        &self,
        blocker_id: UserId,
        blocked_id: UserId,
    ) -> RepositoryResult<bool> {
        let result =
            sqlx::query("DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2")
                .bind(blocker_id)
                .bind(blocked_id)
                .execute(&self.pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Is there a block in *either* direction?
    ///
    /// Blocks are stored one-directionally but almost always need to be
    /// checked symmetrically: neither party should be able to reach the other.
    pub async fn blocked_either_way(&self, a: UserId, b: UserId) -> RepositoryResult<bool> {
        let row: (bool,) = sqlx::query_as(
            "SELECT EXISTS (
                SELECT 1 FROM blocks
                WHERE (blocker_id = $1 AND blocked_id = $2)
                   OR (blocker_id = $2 AND blocked_id = $1)
             )",
        )
        .bind(a)
        .bind(b)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }
}
