//! Storage for notifications.

use genzh_domain::notification::{Notification, NotificationKind};
use genzh_domain::{MessageId, NotificationId, RoomId, Timestamp, UserId};
use genzh_infrastructure::{DbPool, RepositoryError, RepositoryResult};

/// What a producer hands over. Everything except the id and the timestamp,
/// which are the store's to assign.
#[derive(Debug, Clone)]
pub struct NewNotification {
    pub user_id: UserId,
    pub kind: NotificationKind,
    pub actor_id: Option<UserId>,
    pub room_id: Option<RoomId>,
    pub message_id: Option<MessageId>,
    pub preview: Option<String>,
}

impl NewNotification {
    /// A notification about something one person did to another.
    pub fn from_actor(user_id: UserId, kind: NotificationKind, actor_id: UserId) -> Self {
        Self {
            user_id,
            kind,
            actor_id: Some(actor_id),
            room_id: None,
            message_id: None,
            preview: None,
        }
    }

    /// Attach the message this notification is about.
    pub fn about_message(
        mut self,
        room_id: RoomId,
        message_id: MessageId,
        preview: String,
    ) -> Self {
        self.room_id = Some(room_id);
        self.message_id = Some(message_id);
        self.preview = Some(preview);
        self
    }
}

/// What recording a notification did.
///
/// The caller cares about the difference for one reason: a folded row is
/// already counted in the unread badge, so a client told about it must update
/// the row it holds rather than add one and count it again.
#[derive(Debug, Clone)]
pub enum Recorded {
    /// A new row: this person is being told about this conversation for the
    /// first time since they last looked at it.
    Created(Notification),
    /// An open row grew by one. They were already going to be told; now the row
    /// stands for one more message.
    Folded(Notification),
    /// Nothing was written, because this exact event was already recorded.
    Known,
}

impl Recorded {
    /// The stored row, when something was written.
    pub fn notification(self) -> Option<Notification> {
        match self {
            Self::Created(notification) | Self::Folded(notification) => Some(notification),
            Self::Known => None,
        }
    }

    /// Is this the first the recipient hears of this conversation?
    pub fn is_new(&self) -> bool {
        matches!(self, Self::Created(_))
    }
}

/// A page of notifications, most recently active first.
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

    /// Record one notification, folding it into an open row where there is one.
    ///
    /// Two statements rather than one, and in this order for a reason. The
    /// insert is tried first because the common case — the first message of a
    /// conversation — is one round trip and no read. When it conflicts, the
    /// database has just told us that a row already stands for this: either the
    /// open row for this conversation (fold into it) or a row for this exact
    /// message (a retry; do nothing). The update distinguishes them, and its
    /// `NOT EXISTS` is what keeps a re-delivery of an already-recorded message
    /// from inflating the count.
    ///
    /// Both branches lean on the unique indexes rather than on a read-then-write,
    /// so two messages arriving at once cannot open two rows for one
    /// conversation.
    pub async fn record(
        &self,
        id: NotificationId,
        new: &NewNotification,
    ) -> RepositoryResult<Recorded> {
        let created: Option<Notification> = sqlx::query_as(
            "INSERT INTO notifications (id, user_id, kind, actor_id, room_id, message_id, preview)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING
             RETURNING id, user_id, kind, actor_id, room_id, message_id, preview, count, read_at,
                       created_at, updated_at",
        )
        .bind(id)
        .bind(new.user_id)
        .bind(new.kind.key())
        .bind(new.actor_id)
        .bind(new.room_id)
        .bind(new.message_id)
        .bind(new.preview.as_deref())
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        if let Some(notification) = created {
            return Ok(Recorded::Created(notification));
        }

        // Nothing to fold into: a friend request is one event, and a second is
        // a second fact rather than more of the first.
        if new.room_id.is_none() || !new.kind.folds() {
            return Ok(Recorded::Known);
        }

        let folded: Option<Notification> = sqlx::query_as(
            "UPDATE notifications
                SET count = count + 1,
                    -- The newest message is what the row should open at, and
                    -- the newest excerpt is what it should read.
                    message_id = coalesce($4, message_id),
                    preview = coalesce($5, preview),
                    updated_at = now()
              WHERE user_id = $1
                AND kind = $2
                AND room_id = $3
                AND actor_id IS NOT DISTINCT FROM $6
                AND read_at IS NULL
                AND NOT EXISTS (
                    SELECT 1
                      FROM notifications already
                     WHERE already.user_id = $1
                       AND already.kind = $2
                       AND already.message_id = $4
                )
             RETURNING id, user_id, kind, actor_id, room_id, message_id, preview, count, read_at,
                       created_at, updated_at",
        )
        .bind(new.user_id)
        .bind(new.kind.key())
        .bind(new.room_id)
        .bind(new.message_id)
        .bind(new.preview.as_deref())
        .bind(new.actor_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(match folded {
            Some(notification) => Recorded::Folded(notification),
            None => Recorded::Known,
        })
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

        // Ordered and paged by `updated_at`, not `created_at`: a conversation
        // that has just had a message folded into it belongs at the top, and
        // sorting by when it first appeared would bury it under newer rows.
        let mut rows: Vec<Notification> = sqlx::query_as(
            "SELECT id, user_id, kind, actor_id, room_id, message_id, preview, count, read_at,
                    created_at, updated_at
             FROM notifications
             WHERE user_id = $1 AND ($2::timestamptz IS NULL OR updated_at < $2)
             ORDER BY updated_at DESC
             LIMIT $3",
        )
            .bind(user_id)
            .bind(before)
            .bind(fetch)
            .fetch_all(&self.pool)
            .await?;

        let next_before = if rows.len() as i64 > limit {
            rows.truncate(limit as usize);
            rows.last().map(|row| row.updated_at)
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

    /// Prune read notifications older than `read_age` and unread notifications older than `unread_age`.
    pub async fn prune_stale(
        &self,
        read_age: std::time::Duration,
        unread_age: std::time::Duration,
    ) -> RepositoryResult<u64> {
        let read_secs = read_age.as_secs() as i64;
        let unread_secs = unread_age.as_secs() as i64;

        let result = sqlx::query(
            "DELETE FROM notifications
              WHERE (read_at IS NOT NULL AND read_at < now() - make_interval(secs => $1))
                 OR (read_at IS NULL AND created_at < now() - make_interval(secs => $2))",
        )
        .bind(read_secs)
        .bind(unread_secs)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }
}
