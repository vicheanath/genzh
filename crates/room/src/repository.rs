//! Persistence for rooms, anonymous identities, participants, and permission overrides.

use genzh_community::authorization::RoomOverride;
use genzh_domain::room::{
    Room, RoomAnonymousIdentity, RoomParticipant, RoomParticipantRole, RoomStatus, RoomType,
    RoomVisibility, generate_anonymous_identity,
};
use genzh_domain::{CommunityId, Permission, RoleId, RoomId, UserId};
use genzh_infrastructure::{DbPool, RepositoryError, RepositoryResult};

/// Row shape for the override query.
#[derive(Debug, sqlx::FromRow)]
struct OverrideRow {
    role_id: RoleId,
    permission_key: String,
    effect: PermissionEffect,
}

/// Whether an override grants or revokes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "permission_effect", rename_all = "snake_case")]
enum PermissionEffect {
    Allow,
    Deny,
}

/// Rooms Repository.
#[derive(Debug, Clone)]
pub struct RoomRepository {
    pool: DbPool,
}

impl RoomRepository {
    /// Wrap a pool.
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Insert a room.
    pub async fn create(&self, room: &Room) -> RepositoryResult<Room> {
        sqlx::query_as(
            "INSERT INTO rooms (
                id, community_id, owner_id, name, topic, category, room_type,
                visibility, status, is_anonymous, position, max_participants,
                current_participants, started_at, expires_at, ended_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id, community_id, owner_id, name, topic, category, room_type,
                       visibility, status, is_anonymous, position, max_participants,
                       current_participants, started_at, expires_at, ended_at,
                       created_at, updated_at",
        )
        .bind(room.id)
        .bind(room.community_id)
        .bind(room.owner_id)
        .bind(&room.name)
        .bind(&room.topic)
        .bind(&room.category)
        .bind(room.room_type)
        .bind(room.visibility)
        .bind(room.status)
        .bind(room.is_anonymous)
        .bind(room.position)
        .bind(room.max_participants)
        .bind(room.current_participants)
        .bind(room.started_at)
        .bind(room.expires_at)
        .bind(room.ended_at)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Fetch a room by id.
    pub async fn find(&self, id: RoomId) -> RepositoryResult<Option<Room>> {
        sqlx::query_as(
            "SELECT id, community_id, owner_id, name, topic, category, room_type,
                    visibility, status, is_anonymous, position, max_participants,
                    current_participants, started_at, expires_at, ended_at,
                    created_at, updated_at
             FROM rooms WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// List a community's rooms in display order.
    pub async fn list_for_community(
        &self,
        community_id: CommunityId,
    ) -> RepositoryResult<Vec<Room>> {
        sqlx::query_as(
            "SELECT id, community_id, owner_id, name, topic, category, room_type,
                    visibility, status, is_anonymous, position, max_participants,
                    current_participants, started_at, expires_at, ended_at,
                    created_at, updated_at
             FROM rooms
             WHERE community_id = $1 AND status <> 'ended'::room_status
             ORDER BY position ASC, created_at ASC",
        )
        .bind(community_id)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// List public rooms for playground discovery.
    pub async fn list_discovery(
        &self,
        category: Option<&str>,
        limit: i64,
    ) -> RepositoryResult<Vec<Room>> {
        if let Some(cat) = category {
            sqlx::query_as(
                "SELECT id, community_id, owner_id, name, topic, category, room_type,
                        visibility, status, is_anonymous, position, max_participants,
                        current_participants, started_at, expires_at, ended_at,
                        created_at, updated_at
                 FROM rooms
                 WHERE visibility = 'public'::room_visibility
                   AND status = 'active'::room_status
                   AND category = $1
                 ORDER BY current_participants DESC, created_at DESC
                 LIMIT $2",
            )
            .bind(cat)
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(RepositoryError::from)
        } else {
            sqlx::query_as(
                "SELECT id, community_id, owner_id, name, topic, category, room_type,
                        visibility, status, is_anonymous, position, max_participants,
                        current_participants, started_at, expires_at, ended_at,
                        created_at, updated_at
                 FROM rooms
                 WHERE visibility = 'public'::room_visibility
                   AND status = 'active'::room_status
                 ORDER BY current_participants DESC, created_at DESC
                 LIMIT $1",
            )
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(RepositoryError::from)
        }
    }

    /// List trending rooms by engagement score.
    pub async fn list_trending(&self, limit: i64) -> RepositoryResult<Vec<Room>> {
        sqlx::query_as(
            "SELECT id, community_id, owner_id, name, topic, category, room_type,
                    visibility, status, is_anonymous, position, max_participants,
                    current_participants, started_at, expires_at, ended_at,
                    created_at, updated_at
             FROM rooms
             WHERE visibility = 'public'::room_visibility
               AND status = 'active'::room_status
             ORDER BY current_participants DESC, created_at DESC
             LIMIT $1",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// List live voice/video/stage rooms with active participants.
    pub async fn list_live(&self, limit: i64) -> RepositoryResult<Vec<Room>> {
        sqlx::query_as(
            "SELECT id, community_id, owner_id, name, topic, category, room_type,
                    visibility, status, is_anonymous, position, max_participants,
                    current_participants, started_at, expires_at, ended_at,
                    created_at, updated_at
             FROM rooms
             WHERE visibility = 'public'::room_visibility
               AND status = 'active'::room_status
               AND room_type IN ('voice'::room_type, 'video'::room_type, 'stage'::room_type, 'game'::room_type)
             ORDER BY current_participants DESC, created_at DESC
             LIMIT $1",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Find a random active public room for one-click matchmaking.
    pub async fn find_random(
        &self,
        category: Option<&str>,
        room_type: Option<RoomType>,
    ) -> RepositoryResult<Option<Room>> {
        match (category, room_type) {
            (Some(cat), Some(rt)) => {
                sqlx::query_as(
                    "SELECT id, community_id, owner_id, name, topic, category, room_type,
                            visibility, status, is_anonymous, position, max_participants,
                            current_participants, started_at, expires_at, ended_at,
                            created_at, updated_at
                     FROM rooms
                     WHERE visibility = 'public'::room_visibility
                       AND status = 'active'::room_status
                       AND category = $1
                       AND room_type = $2
                     ORDER BY RANDOM()
                     LIMIT 1",
                )
                .bind(cat)
                .bind(rt)
                .fetch_optional(&self.pool)
                .await
                .map_err(RepositoryError::from)
            }
            (Some(cat), None) => {
                sqlx::query_as(
                    "SELECT id, community_id, owner_id, name, topic, category, room_type,
                            visibility, status, is_anonymous, position, max_participants,
                            current_participants, started_at, expires_at, ended_at,
                            created_at, updated_at
                     FROM rooms
                     WHERE visibility = 'public'::room_visibility
                       AND status = 'active'::room_status
                       AND category = $1
                     ORDER BY RANDOM()
                     LIMIT 1",
                )
                .bind(cat)
                .fetch_optional(&self.pool)
                .await
                .map_err(RepositoryError::from)
            }
            (None, Some(rt)) => {
                sqlx::query_as(
                    "SELECT id, community_id, owner_id, name, topic, category, room_type,
                            visibility, status, is_anonymous, position, max_participants,
                            current_participants, started_at, expires_at, ended_at,
                            created_at, updated_at
                     FROM rooms
                     WHERE visibility = 'public'::room_visibility
                       AND status = 'active'::room_status
                       AND room_type = $1
                     ORDER BY RANDOM()
                     LIMIT 1",
                )
                .bind(rt)
                .fetch_optional(&self.pool)
                .await
                .map_err(RepositoryError::from)
            }
            (None, None) => {
                sqlx::query_as(
                    "SELECT id, community_id, owner_id, name, topic, category, room_type,
                            visibility, status, is_anonymous, position, max_participants,
                            current_participants, started_at, expires_at, ended_at,
                            created_at, updated_at
                     FROM rooms
                     WHERE visibility = 'public'::room_visibility
                       AND status = 'active'::room_status
                     ORDER BY RANDOM()
                     LIMIT 1",
                )
                .fetch_optional(&self.pool)
                .await
                .map_err(RepositoryError::from)
            }
        }
    }

    /// List standalone or direct conversation rooms where the user is a participant or owner.
    pub async fn list_user_rooms(&self, user_id: UserId) -> RepositoryResult<Vec<Room>> {
        sqlx::query_as(
            "SELECT DISTINCT r.id, r.community_id, r.owner_id, r.name, r.topic, r.category, r.room_type,
                    r.visibility, r.status, r.is_anonymous, r.position, r.max_participants,
                    r.current_participants, r.started_at, r.expires_at, r.ended_at,
                    r.created_at, r.updated_at
             FROM rooms r
             LEFT JOIN room_participants p ON p.room_id = r.id
             WHERE r.community_id IS NULL
               AND (r.owner_id = $1 OR p.user_id = $1)
             ORDER BY r.updated_at DESC
             LIMIT 50",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// The other participant in each of the given direct rooms.
    ///
    /// A DM is stored with one name, chosen by whoever opened it ("DM: @bob"),
    /// but it has two readings — showing Bob a conversation labelled "@bob" is
    /// showing him himself. Who a conversation is *with* is therefore relative
    /// to the caller and has to be resolved rather than read off the room.
    ///
    /// One query for the whole list rather than one per room, because the
    /// sidebar renders every direct conversation at once.
    pub async fn direct_peers(
        &self,
        user_id: UserId,
        room_ids: &[RoomId],
    ) -> RepositoryResult<Vec<(RoomId, UserId)>> {
        if room_ids.is_empty() {
            return Ok(Vec::new());
        }

        let ids: Vec<uuid::Uuid> = room_ids.iter().map(|id| id.as_uuid()).collect();

        // DISTINCT ON keeps this correct if a room ever holds more than two
        // people: the earliest joiner other than the caller is the peer.
        let rows: Vec<(uuid::Uuid, uuid::Uuid)> = sqlx::query_as(
            "SELECT DISTINCT ON (p.room_id) p.room_id, p.user_id
             FROM room_participants p
             WHERE p.room_id = ANY($1) AND p.user_id <> $2
             ORDER BY p.room_id, p.joined_at",
        )
        .bind(&ids)
        .bind(user_id.as_uuid())
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(rows
            .into_iter()
            .map(|(room, user)| (RoomId(room), UserId(user)))
            .collect())
    }

    /// The other participant in one direct room.
    pub async fn direct_peer(
        &self,
        room_id: RoomId,
        user_id: UserId,
    ) -> RepositoryResult<Option<UserId>> {
        Ok(self
            .direct_peers(user_id, &[room_id])
            .await?
            .into_iter()
            .next()
            .map(|(_, peer)| peer))
    }

    /// Find an existing direct message room between two users.
    pub async fn find_direct_room(
        &self,
        user_a: UserId,
        user_b: UserId,
    ) -> RepositoryResult<Option<Room>> {
        if user_a == user_b {
            sqlx::query_as(
                "SELECT r.id, r.community_id, r.owner_id, r.name, r.topic, r.category, r.room_type,
                        r.visibility, r.status, r.is_anonymous, r.position, r.max_participants,
                        r.current_participants, r.started_at, r.expires_at, r.ended_at,
                        r.created_at, r.updated_at
                 FROM rooms r
                 JOIN room_participants p ON p.room_id = r.id AND p.user_id = $1
                 WHERE r.category = 'dm' AND r.community_id IS NULL
                 ORDER BY r.updated_at DESC
                 LIMIT 1",
            )
            .bind(user_a)
            .fetch_optional(&self.pool)
            .await
            .map_err(RepositoryError::from)
        } else {
            sqlx::query_as(
                "SELECT r.id, r.community_id, r.owner_id, r.name, r.topic, r.category, r.room_type,
                        r.visibility, r.status, r.is_anonymous, r.position, r.max_participants,
                        r.current_participants, r.started_at, r.expires_at, r.ended_at,
                        r.created_at, r.updated_at
                 FROM rooms r
                 JOIN room_participants p1 ON p1.room_id = r.id AND p1.user_id = $1
                 JOIN room_participants p2 ON p2.room_id = r.id AND p2.user_id = $2
                 WHERE r.category = 'dm' AND r.community_id IS NULL
                 ORDER BY r.updated_at DESC
                 LIMIT 1",
            )
            .bind(user_a)
            .bind(user_b)
            .fetch_optional(&self.pool)
            .await
            .map_err(RepositoryError::from)
        }
    }

    /// Partially update a room.
    pub async fn update(
        &self,
        id: RoomId,
        name: Option<&str>,
        topic: Option<&str>,
        category: Option<&str>,
        visibility: Option<RoomVisibility>,
        status: Option<RoomStatus>,
        position: Option<i32>,
        max_participants: Option<i32>,
    ) -> RepositoryResult<Room> {
        sqlx::query_as(
            "UPDATE rooms SET
                name             = COALESCE($2, name),
                topic            = COALESCE($3, topic),
                category         = COALESCE($4, category),
                visibility       = COALESCE($5, visibility),
                status           = COALESCE($6, status),
                position         = COALESCE($7, position),
                max_participants = COALESCE($8, max_participants),
                updated_at       = now()
             WHERE id = $1
             RETURNING id, community_id, owner_id, name, topic, category, room_type,
                       visibility, status, is_anonymous, position, max_participants,
                       current_participants, started_at, expires_at, ended_at,
                       created_at, updated_at",
        )
        .bind(id)
        .bind(name)
        .bind(topic)
        .bind(category)
        .bind(visibility)
        .bind(status)
        .bind(position)
        .bind(max_participants)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(RepositoryError::NotFound("room"))
    }

    /// Delete a room. Messages and overrides cascade.
    pub async fn delete(&self, id: RoomId) -> RepositoryResult<bool> {
        let result = sqlx::query("DELETE FROM rooms WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // ── Anonymous Identity ────────────────────────────────────────────────────

    /// Get or create room-scoped anonymous identity for a user.
    pub async fn get_or_create_anonymous_identity(
        &self,
        room_id: RoomId,
        user_id: UserId,
    ) -> RepositoryResult<RoomAnonymousIdentity> {
        if let Some(existing) = sqlx::query_as(
            "SELECT room_id, user_id, alias_name, avatar_seed, accent_color, created_at
             FROM room_anonymous_identities WHERE room_id = $1 AND user_id = $2",
        )
        .bind(room_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?
        {
            return Ok(existing);
        }

        let (alias, seed, color) = generate_anonymous_identity(room_id, user_id);

        sqlx::query_as(
            "INSERT INTO room_anonymous_identities (room_id, user_id, alias_name, avatar_seed, accent_color)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (room_id, user_id) DO UPDATE SET room_id = EXCLUDED.room_id
             RETURNING room_id, user_id, alias_name, avatar_seed, accent_color, created_at",
        )
        .bind(room_id)
        .bind(user_id)
        .bind(&alias)
        .bind(&seed)
        .bind(&color)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Lookup anonymous identity for a user in a room.
    pub async fn find_anonymous_identity(
        &self,
        room_id: RoomId,
        user_id: UserId,
    ) -> RepositoryResult<Option<RoomAnonymousIdentity>> {
        sqlx::query_as(
            "SELECT room_id, user_id, alias_name, avatar_seed, accent_color, created_at
             FROM room_anonymous_identities WHERE room_id = $1 AND user_id = $2",
        )
        .bind(room_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    // ── Participants ──────────────────────────────────────────────────────────

    /// Join a room as a participant.
    pub async fn join_room(
        &self,
        room_id: RoomId,
        user_id: UserId,
        role: RoomParticipantRole,
    ) -> RepositoryResult<RoomParticipant> {
        let mut tx = self.pool.begin().await?;

        let participant: RoomParticipant = sqlx::query_as(
            "INSERT INTO room_participants (room_id, user_id, role, is_anonymous, last_seen_at)
             VALUES ($1, $2, $3, FALSE, now())
             ON CONFLICT (room_id, user_id) DO UPDATE SET last_seen_at = now()
             RETURNING room_id, user_id, role, is_muted, is_anonymous, joined_at, last_seen_at",
        )
        .bind(room_id)
        .bind(user_id)
        .bind(role)
        .fetch_one(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE rooms SET
                current_participants = (SELECT COUNT(*) FROM room_participants WHERE room_id = $1)
             WHERE id = $1",
        )
        .bind(room_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(participant)
    }

    /// Set participant's active persona preference (anonymous vs public).
    pub async fn set_participant_persona(
        &self,
        room_id: RoomId,
        user_id: UserId,
        is_anonymous: bool,
    ) -> RepositoryResult<Option<RoomParticipant>> {
        sqlx::query_as(
            "UPDATE room_participants
             SET is_anonymous = $3, last_seen_at = now()
             WHERE room_id = $1 AND user_id = $2
             RETURNING room_id, user_id, role, is_muted, is_anonymous, joined_at, last_seen_at",
        )
        .bind(room_id)
        .bind(user_id)
        .bind(is_anonymous)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Find participant standing.
    pub async fn find_participant(
        &self,
        room_id: RoomId,
        user_id: UserId,
    ) -> RepositoryResult<Option<RoomParticipant>> {
        sqlx::query_as(
            "SELECT room_id, user_id, role, is_muted, is_anonymous, joined_at, last_seen_at
             FROM room_participants WHERE room_id = $1 AND user_id = $2",
        )
        .bind(room_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Leave a room.
    pub async fn leave_room(
        &self,
        room_id: RoomId,
        user_id: UserId,
    ) -> RepositoryResult<bool> {
        let mut tx = self.pool.begin().await?;

        let result = sqlx::query(
            "DELETE FROM room_participants WHERE room_id = $1 AND user_id = $2",
        )
        .bind(room_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE rooms SET
                current_participants = (SELECT COUNT(*) FROM room_participants WHERE room_id = $1)
             WHERE id = $1",
        )
        .bind(room_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(result.rows_affected() > 0)
    }

    /// List current participants in a room.
    pub async fn list_participants(
        &self,
        room_id: RoomId,
    ) -> RepositoryResult<Vec<RoomParticipant>> {
        sqlx::query_as(
            "SELECT room_id, user_id, role, is_muted, is_anonymous, joined_at, last_seen_at
             FROM room_participants WHERE room_id = $1 ORDER BY joined_at ASC",
        )
        .bind(room_id)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    // ── Overrides ─────────────────────────────────────────────────────────────

    /// Every permission override configured on a room.
    pub async fn overrides(&self, room_id: RoomId) -> RepositoryResult<Vec<RoomOverride>> {
        let rows: Vec<OverrideRow> = sqlx::query_as(
            "SELECT role_id, permission_key, effect FROM room_permissions WHERE room_id = $1",
        )
        .bind(room_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.permission_key
                    .parse::<Permission>()
                    .ok()
                    .map(|permission| RoomOverride {
                        role_id: row.role_id,
                        permission,
                        allow: row.effect == PermissionEffect::Allow,
                    })
            })
            .collect())
    }

    /// Set (or replace) one override.
    pub async fn set_override(
        &self,
        room_id: RoomId,
        role_id: RoleId,
        permission: Permission,
        allow: bool,
    ) -> RepositoryResult<()> {
        let effect = if allow {
            PermissionEffect::Allow
        } else {
            PermissionEffect::Deny
        };
        sqlx::query(
            "INSERT INTO room_permissions (room_id, role_id, permission_key, effect)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (room_id, role_id, permission_key) DO UPDATE SET effect = EXCLUDED.effect",
        )
        .bind(room_id)
        .bind(role_id)
        .bind(permission.key())
        .bind(effect)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Remove one override.
    pub async fn clear_override(
        &self,
        room_id: RoomId,
        role_id: RoleId,
        permission: Permission,
    ) -> RepositoryResult<bool> {
        let result = sqlx::query(
            "DELETE FROM room_permissions
             WHERE room_id = $1 AND role_id = $2 AND permission_key = $3",
        )
        .bind(room_id)
        .bind(role_id)
        .bind(permission.key())
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Count media rooms in a community, for quota reporting.
    pub async fn count_media_rooms(&self, community_id: CommunityId) -> RepositoryResult<i64> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM rooms
             WHERE community_id = $1 AND room_type NOT IN ('text'::room_type, 'poll'::room_type, 'confession'::room_type, 'quick_chat'::room_type)",
        )
        .bind(community_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }
}
