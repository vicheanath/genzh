//! Storage for notifications.

use genzh_domain::notification::{Notification, NotificationKind};
use genzh_domain::{MessageId, NotificationId, RoomId, Timestamp, UserId};
use genzh_infrastructure::{DbPool, RepositoryError, RepositoryResult};

/// A page of notifications, newest first.
#[derive(Debug, Clone)]
pub struct NotificationPage {
    pub notifications: Vec<Notification>,
    /// Cursor for the next page, or `None` at the end of the list.
    pub next_before: Option<Timestamp>,
}

/// Reads and writes for the `notifications` table.
#[derive(Debug, Clone)]
pub struct NotificationRepository {
    pool: DbPool,
}

// The column list is written out at each call site rather than shared through a
// constant: sqlx only accepts static SQL, and a `format!`ed query is rejected as
// unauditable however safe the pieces are.

impl NotificationRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Record one notification.
    ///
    /// Returns `None` when it already existed — the unique index on
    /// (user, message, kind) makes a repeat a no-op rather than a duplicate,
    /// so an edit that re-saves the same message does not re-notify.
    pub async fn create(
        &self,
        id: NotificationId,
        user_id: UserId,
        kind: NotificationKind,
        actor_id: Option<UserId>,
        room_id: Option<RoomId>,
        message_id: Option<MessageId>,
        preview: Option<&str>,
    ) -> RepositoryResult<Option<Notification>> {
        sqlx::query_as(
            "INSERT INTO notifications (id, user_id, kind, actor_id, room_id, message_id, preview)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING
             RETURNING id, user_id, kind, actor_id, room_id, message_id, preview, read_at,
                       created_at",
        )
            .bind(id)
            .bind(user_id)
            .bind(kind.key())
            .bind(actor_id)
            .bind(room_id)
            .bind(message_id)
            .bind(preview)
            .fetch_optional(&self.pool)
            .await
            .map_err(RepositoryError::from)
    }

    /// This user's notifications, newest first.
    pub async fn list(
        &self,
        user_id: UserId,
        before: Option<Timestamp>,
        limit: i64,
    ) -> RepositoryResult<NotificationPage> {
        // One extra row is fetched to decide whether another page exists,
        // rather than a second COUNT query.
        let fetch = limit + 1;

        let mut rows: Vec<Notification> = sqlx::query_as(
            "SELECT id, user_id, kind, actor_id, room_id, message_id, preview, read_at, created_at
             FROM notifications
             WHERE user_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2)
             ORDER BY created_at DESC
             LIMIT $3",
        )
            .bind(user_id)
            .bind(before)
            .bind(fetch)
            .fetch_all(&self.pool)
            .await?;

        let next_before = if rows.len() as i64 > limit {
            rows.truncate(limit as usize);
            rows.last().map(|row| row.created_at)
        } else {
            None
        };

        Ok(NotificationPage {
            notifications: rows,
            next_before,
        })
    }

    /// How many are unread. This is the badge.
    pub async fn unread_count(&self, user_id: UserId) -> RepositoryResult<i64> {
        let row: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL",
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }

    /// Mark one notification read. Scoped to the owner, so an id alone is not
    /// enough to touch somebody else's row.
    pub async fn mark_read(
        &self,
        user_id: UserId,
        id: NotificationId,
    ) -> RepositoryResult<bool> {
        let result = sqlx::query(
            "UPDATE notifications SET read_at = now()
             WHERE id = $1 AND user_id = $2 AND read_at IS NULL",
        )
        .bind(id)
        .bind(user_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Mark everything read. Returns how many rows changed.
    pub async fn mark_all_read(&self, user_id: UserId) -> RepositoryResult<u64> {
        let result = sqlx::query(
            "UPDATE notifications SET read_at = now()
             WHERE user_id = $1 AND read_at IS NULL",
        )
        .bind(user_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }
}
