//! Persistence for rooms and their permission overrides.

use social_domain::room::{Room, RoomType};
use social_domain::{CommunityId, Permission, RoleId, RoomId};
use social_community::authorization::RoomOverride;
use social_infrastructure::{DbPool, RepositoryError, RepositoryResult};

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

/// Rooms.
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
            "INSERT INTO rooms (id, community_id, name, topic, room_type, position, max_participants)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, community_id, name, topic, room_type, position, max_participants,
                       created_at, updated_at",
        )
        .bind(room.id)
        .bind(room.community_id)
        .bind(&room.name)
        .bind(&room.topic)
        .bind(room.room_type)
        .bind(room.position)
        .bind(room.max_participants)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Fetch a room.
    pub async fn find(&self, id: RoomId) -> RepositoryResult<Option<Room>> {
        sqlx::query_as(
            "SELECT id, community_id, name, topic, room_type, position, max_participants,
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
            "SELECT id, community_id, name, topic, room_type, position, max_participants,
                    created_at, updated_at
             FROM rooms WHERE community_id = $1 ORDER BY position ASC, created_at ASC",
        )
        .bind(community_id)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Partially update a room.
    ///
    /// `room_type` is intentionally not updatable: turning a text room into a
    /// voice room mid-flight would strand clients and invalidate every media
    /// token already issued for it.
    pub async fn update(
        &self,
        id: RoomId,
        name: Option<&str>,
        topic: Option<&str>,
        position: Option<i32>,
        max_participants: Option<i32>,
    ) -> RepositoryResult<Room> {
        sqlx::query_as(
            "UPDATE rooms SET
                name             = COALESCE($2, name),
                topic            = COALESCE($3, topic),
                position         = COALESCE($4, position),
                max_participants = COALESCE($5, max_participants),
                updated_at       = now()
             WHERE id = $1
             RETURNING id, community_id, name, topic, room_type, position, max_participants,
                       created_at, updated_at",
        )
        .bind(id)
        .bind(name)
        .bind(topic)
        .bind(position)
        .bind(max_participants)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(RepositoryError::NotFound("room"))
    }

    /// Delete a room. Messages and overrides cascade.
    pub async fn delete(&self, id: RoomId) -> RepositoryResult<bool> {
        let result =
            sqlx::query("DELETE FROM rooms WHERE id = $1").bind(id).execute(&self.pool).await?;
        Ok(result.rows_affected() > 0)
    }

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
                row.permission_key.parse::<Permission>().ok().map(|permission| RoomOverride {
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
        let effect = if allow { PermissionEffect::Allow } else { PermissionEffect::Deny };
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
             WHERE community_id = $1 AND room_type <> 'text'::room_type",
        )
        .bind(community_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }

    /// The room types that carry media, for callers that need the list.
    pub const MEDIA_ROOM_TYPES: [RoomType; 3] =
        [RoomType::Voice, RoomType::Video, RoomType::Activity];
}
