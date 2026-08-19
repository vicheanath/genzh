//! Persistence for messages and reactions.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use genzh_domain::message::{Message, MessageReaction, ReactionSummary};
use genzh_domain::{MessageId, RoomId, UserId};
use genzh_infrastructure::{DbPool, RepositoryError, RepositoryResult};
use uuid::Uuid;

/// One page of history.
#[derive(Debug, Clone)]
pub struct MessagePage {
    /// Messages, newest first.
    pub messages: Vec<Message>,
    /// Cursor for the next (older) page, when more exist.
    pub next_before: Option<DateTime<Utc>>,
}

/// Messages and reactions.
#[derive(Debug, Clone)]
pub struct MessageRepository {
    pool: DbPool,
}

impl MessageRepository {
    /// Wrap a pool.
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Insert a message.
    pub async fn create(&self, message: &Message) -> RepositoryResult<Message> {
        sqlx::query_as(
            "INSERT INTO messages (id, room_id, author_id, content, is_anonymous)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, room_id, author_id, content, is_anonymous, edited_at, created_at",
        )
        .bind(message.id)
        .bind(message.room_id)
        .bind(message.author_id)
        .bind(&message.content)
        .bind(message.is_anonymous)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Fetch one message.
    pub async fn find(&self, id: MessageId) -> RepositoryResult<Option<Message>> {
        sqlx::query_as(
            "SELECT id, room_id, author_id, content, is_anonymous, edited_at, created_at
             FROM messages WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Read history, newest first.
    ///
    /// Keyset pagination on `created_at` rather than `OFFSET`: offsets get
    /// slower as a room gets busier, and they skip or repeat rows when new
    /// messages arrive mid-scroll — which is exactly what happens in a live
    /// chat.
    pub async fn list(
        &self,
        room_id: RoomId,
        before: Option<DateTime<Utc>>,
        limit: i64,
    ) -> RepositoryResult<MessagePage> {
        // Fetch one extra row to learn whether another page exists, without a
        // second COUNT query.
        let fetch = limit + 1;

        let mut messages: Vec<Message> = match before {
            Some(before) => {
                sqlx::query_as(
                    "SELECT id, room_id, author_id, content, is_anonymous, edited_at, created_at
                     FROM messages WHERE room_id = $1 AND created_at < $2
                     ORDER BY created_at DESC, id DESC LIMIT $3",
                )
                .bind(room_id)
                .bind(before)
                .bind(fetch)
                .fetch_all(&self.pool)
                .await?
            }
            None => {
                sqlx::query_as(
                    "SELECT id, room_id, author_id, content, is_anonymous, edited_at, created_at
                     FROM messages WHERE room_id = $1
                     ORDER BY created_at DESC, id DESC LIMIT $2",
                )
                .bind(room_id)
                .bind(fetch)
                .fetch_all(&self.pool)
                .await?
            }
        };

        let next_before = if messages.len() as i64 > limit {
            messages.truncate(limit as usize);
            messages.last().map(|message| message.created_at)
        } else {
            None
        };

        Ok(MessagePage {
            messages,
            next_before,
        })
    }

    /// Edit a message's body.
    pub async fn update_content(&self, id: MessageId, content: &str) -> RepositoryResult<Message> {
        sqlx::query_as(
            "UPDATE messages SET content = $2, edited_at = now() WHERE id = $1
             RETURNING id, room_id, author_id, content, edited_at, created_at",
        )
        .bind(id)
        .bind(content)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(RepositoryError::NotFound("message"))
    }

    /// Delete a message. Reactions cascade.
    pub async fn delete(&self, id: MessageId) -> RepositoryResult<bool> {
        let result = sqlx::query("DELETE FROM messages WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Add a reaction. Idempotent: reacting twice is one reaction.
    pub async fn add_reaction(
        &self,
        message_id: MessageId,
        user_id: UserId,
        reaction: &str,
    ) -> RepositoryResult<Option<MessageReaction>> {
        sqlx::query_as(
            "INSERT INTO message_reactions (message_id, user_id, reaction)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING
             RETURNING message_id, user_id, reaction, created_at",
        )
        .bind(message_id)
        .bind(user_id)
        .bind(reaction)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Remove a reaction.
    pub async fn remove_reaction(
        &self,
        message_id: MessageId,
        user_id: UserId,
        reaction: &str,
    ) -> RepositoryResult<bool> {
        let result = sqlx::query(
            "DELETE FROM message_reactions
             WHERE message_id = $1 AND user_id = $2 AND reaction = $3",
        )
        .bind(message_id)
        .bind(user_id)
        .bind(reaction)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Reaction counts for one message, as `viewer` sees them.
    pub async fn reaction_summaries(
        &self,
        message_id: MessageId,
        viewer: UserId,
    ) -> RepositoryResult<Vec<ReactionSummary>> {
        sqlx::query_as(
            "SELECT reaction, COUNT(*) AS count, bool_or(user_id = $2) AS me
             FROM message_reactions
             WHERE message_id = $1
             GROUP BY reaction
             ORDER BY count DESC, reaction ASC",
        )
        .bind(message_id)
        .bind(viewer)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Reaction counts for a whole page of messages, in one query.
    ///
    /// A page of fifty messages must not become fifty aggregate queries, so the
    /// grouping happens in the database and the rows are bucketed by message on
    /// the way out. Messages with no reactions simply have no key.
    pub async fn reaction_summaries_for(
        &self,
        message_ids: &[MessageId],
        viewer: UserId,
    ) -> RepositoryResult<HashMap<MessageId, Vec<ReactionSummary>>> {
        if message_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Bound as `Vec<Uuid>` rather than `Vec<MessageId>`: the newtype is
        // transparent for a scalar, but the array element type is what the
        // driver has to name here.
        let ids: Vec<Uuid> = message_ids.iter().map(MessageId::as_uuid).collect();

        let rows: Vec<GroupedReaction> = sqlx::query_as(
            "SELECT message_id, reaction, COUNT(*) AS count, bool_or(user_id = $2) AS me
             FROM message_reactions
             WHERE message_id = ANY($1)
             GROUP BY message_id, reaction
             ORDER BY count DESC, reaction ASC",
        )
        .bind(&ids)
        .bind(viewer)
        .fetch_all(&self.pool)
        .await?;

        let mut grouped: HashMap<MessageId, Vec<ReactionSummary>> = HashMap::new();
        for row in rows {
            grouped
                .entry(MessageId(row.message_id))
                .or_default()
                .push(ReactionSummary {
                    reaction: row.reaction,
                    count: row.count,
                    me: row.me,
                });
        }
        Ok(grouped)
    }
}

/// One `GROUP BY message_id, reaction` row, before bucketing.
#[derive(Debug, sqlx::FromRow)]
struct GroupedReaction {
    message_id: Uuid,
    reaction: String,
    count: i64,
    me: bool,
}
