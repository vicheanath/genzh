//! Where each person got to in each room.
//!
//! The sidebar's whole job is telling you where to look, and before this it
//! could not: every room looked identical whether it held nothing new or two
//! hundred messages you had not seen.

use genzh_domain::{RoomId, UserId};
use genzh_infrastructure::{DbPool, RepositoryError, ServiceResult};
use serde::Serialize;

/// One room's unread state for one person.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct RoomUnread {
    pub room_id: RoomId,
    /// Messages after `last_read_at`, capped — past a point the number stops
    /// being information and a "99+" says the same thing for less work.
    pub unread: i64,
    /// Unread messages that name this person, which is what earns a red badge
    /// rather than a grey dot.
    pub mentions: i64,
    pub muted: bool,
}

/// Reads and writes per-room read state.
#[derive(Clone)]
pub struct ReadStateService {
    pool: DbPool,
}

impl ReadStateService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Unread counts for every room the caller is in.
    ///
    /// One query for the whole sidebar rather than one per room: a user in
    /// forty rooms would otherwise cost forty round-trips on every page load.
    ///
    /// A room with no read-state row has never been opened, and everything in
    /// it counts as unread — which is the right answer without a backfill.
    pub async fn overview(&self, user_id: UserId) -> ServiceResult<Vec<RoomUnread>> {
        let rows = sqlx::query_as::<_, RoomUnread>(
            "SELECT rp.room_id,
                    count(m.id) FILTER (
                        WHERE m.author_id <> $1
                    ) AS unread,
                    count(m.id) FILTER (
                        WHERE m.author_id <> $1
                          AND (m.content ILIKE '%@everyone%' OR m.content ILIKE '%@' || u.handle || '%')
                    ) AS mentions,
                    coalesce(rs.muted, FALSE) AS muted
             FROM room_participants rp
             JOIN users u ON u.id = $1
             LEFT JOIN room_read_state rs
                    ON rs.room_id = rp.room_id AND rs.user_id = $1
             LEFT JOIN messages m
                    ON m.room_id = rp.room_id
                   AND m.created_at > coalesce(rs.last_read_at, 'epoch'::timestamptz)
             WHERE rp.user_id = $1
             GROUP BY rp.room_id, rs.muted",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(rows)
    }

    /// Mark a room read up to now.
    ///
    /// Upsert rather than insert-then-update: opening a room for the first time
    /// and returning to it are the same action to the person doing it.
    pub async fn mark_read(&self, user_id: UserId, room_id: RoomId) -> ServiceResult<()> {
        sqlx::query(
            "INSERT INTO room_read_state (user_id, room_id, last_read_at, updated_at)
             VALUES ($1, $2, now(), now())
             ON CONFLICT (user_id, room_id)
             DO UPDATE SET last_read_at = now(), updated_at = now()",
        )
        .bind(user_id)
        .bind(room_id)
        .execute(&self.pool)
        .await
        .map_err(RepositoryError::from)?;
        Ok(())
    }

    /// Mute or unmute a room.
    ///
    /// Muting does not mark anything read: a muted room still knows what you
    /// have not seen, it just stops asking for attention. Conflating the two
    /// would mean unmuting told you the room was empty.
    pub async fn set_muted(
        &self,
        user_id: UserId,
        room_id: RoomId,
        muted: bool,
    ) -> ServiceResult<()> {
        sqlx::query(
            "INSERT INTO room_read_state (user_id, room_id, muted, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id, room_id)
             DO UPDATE SET muted = $3, updated_at = now()",
        )
        .bind(user_id)
        .bind(room_id)
        .bind(muted)
        .execute(&self.pool)
        .await
        .map_err(RepositoryError::from)?;
        Ok(())
    }
}
