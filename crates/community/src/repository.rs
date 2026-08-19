//! Persistence for communities, members and roles.

use std::collections::HashSet;

use genzh_domain::community::{Community, CommunityMember, Role};
use genzh_domain::{CommunityId, Permission, RoleId, UserId};
use genzh_infrastructure::{DbPool, RepositoryError, RepositoryResult};

/// Row shape for the permission-resolution query.
#[derive(Debug, sqlx::FromRow)]
struct PermissionKeyRow {
    permission_key: String,
}

/// Row shape for role-id lookups.
#[derive(Debug, sqlx::FromRow)]
struct RoleIdRow {
    id: RoleId,
}

/// Everything that reads or writes community-shaped rows.
#[derive(Debug, Clone)]
pub struct CommunityRepository {
    pool: DbPool,
}

impl CommunityRepository {
    /// Wrap a pool.
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Create a community, its `@everyone` role and its owner's membership in
    /// one transaction.
    ///
    /// All three or none: a community with no default role has no way to grant
    /// anything, and an ownerless community cannot be administered.
    pub async fn create(
        &self,
        community: &Community,
        default_role_id: RoleId,
        default_permissions: &[Permission],
    ) -> RepositoryResult<Community> {
        let mut tx = self.pool.begin().await?;

        let created: Community = sqlx::query_as(
            "INSERT INTO communities (id, name, description, icon_url, owner_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, description, icon_url, owner_id, created_at, updated_at",
        )
        .bind(community.id)
        .bind(&community.name)
        .bind(&community.description)
        .bind(&community.icon_url)
        .bind(community.owner_id)
        .fetch_one(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO roles (id, community_id, name, position, is_default)
             VALUES ($1, $2, $3, 0, TRUE)",
        )
        .bind(default_role_id)
        .bind(community.id)
        .bind(genzh_domain::community::EVERYONE_ROLE_NAME)
        .execute(&mut *tx)
        .await?;

        for permission in default_permissions {
            sqlx::query("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)")
                .bind(default_role_id)
                .bind(permission.key())
                .execute(&mut *tx)
                .await?;
        }

        sqlx::query("INSERT INTO community_members (community_id, user_id) VALUES ($1, $2)")
            .bind(community.id)
            .bind(community.owner_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(created)
    }

    /// Fetch a community.
    pub async fn find(&self, id: CommunityId) -> RepositoryResult<Option<Community>> {
        sqlx::query_as(
            "SELECT id, name, description, icon_url, owner_id, created_at, updated_at
             FROM communities WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Partially update a community.
    pub async fn update(
        &self,
        id: CommunityId,
        name: Option<&str>,
        description: Option<&str>,
        icon_url: Option<&str>,
    ) -> RepositoryResult<Community> {
        sqlx::query_as(
            "UPDATE communities SET
                name        = COALESCE($2, name),
                description = COALESCE($3, description),
                icon_url    = COALESCE($4, icon_url),
                updated_at  = now()
             WHERE id = $1
             RETURNING id, name, description, icon_url, owner_id, created_at, updated_at",
        )
        .bind(id)
        .bind(name)
        .bind(description)
        .bind(icon_url)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(RepositoryError::NotFound("community"))
    }

    /// Delete a community. Rooms, roles and memberships cascade.
    pub async fn delete(&self, id: CommunityId) -> RepositoryResult<bool> {
        let result = sqlx::query("DELETE FROM communities WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Add a member and give them the default role.
    pub async fn add_member(
        &self,
        community_id: CommunityId,
        user_id: UserId,
        nickname: Option<&str>,
    ) -> RepositoryResult<CommunityMember> {
        let mut tx = self.pool.begin().await?;

        let member: CommunityMember = sqlx::query_as(
            "INSERT INTO community_members (community_id, user_id, nickname)
             VALUES ($1, $2, $3)
             RETURNING community_id, user_id, nickname, joined_at",
        )
        .bind(community_id)
        .bind(user_id)
        .bind(nickname)
        .fetch_one(&mut *tx)
        .await?;

        // `@everyone` is materialised rather than implied, so that
        // `member_roles` alone answers "which roles does this member hold".
        sqlx::query(
            "INSERT INTO member_roles (community_id, user_id, role_id)
             SELECT $1, $2, id FROM roles WHERE community_id = $1 AND is_default
             ON CONFLICT DO NOTHING",
        )
        .bind(community_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(member)
    }

    /// Remove a member. Their role assignments cascade.
    pub async fn remove_member(
        &self,
        community_id: CommunityId,
        user_id: UserId,
    ) -> RepositoryResult<bool> {
        let result =
            sqlx::query("DELETE FROM community_members WHERE community_id = $1 AND user_id = $2")
                .bind(community_id)
                .bind(user_id)
                .execute(&self.pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Fetch one membership.
    pub async fn find_member(
        &self,
        community_id: CommunityId,
        user_id: UserId,
    ) -> RepositoryResult<Option<CommunityMember>> {
        sqlx::query_as(
            "SELECT community_id, user_id, nickname, joined_at
             FROM community_members WHERE community_id = $1 AND user_id = $2",
        )
        .bind(community_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// List members, newest first.
    pub async fn list_members(
        &self,
        community_id: CommunityId,
        limit: i64,
    ) -> RepositoryResult<Vec<CommunityMember>> {
        sqlx::query_as(
            "SELECT community_id, user_id, nickname, joined_at
             FROM community_members WHERE community_id = $1
             ORDER BY joined_at DESC LIMIT $2",
        )
        .bind(community_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Every role a member holds, including `@everyone`.
    ///
    /// The `is_default` arm is belt and braces: memberships created before the
    /// default role existed still resolve correctly.
    pub async fn member_role_ids(
        &self,
        community_id: CommunityId,
        user_id: UserId,
    ) -> RepositoryResult<HashSet<RoleId>> {
        let rows: Vec<RoleIdRow> = sqlx::query_as(
            "SELECT r.id
             FROM roles r
             WHERE r.community_id = $1
               AND (
                    r.is_default
                    OR EXISTS (
                        SELECT 1 FROM member_roles mr
                        WHERE mr.role_id = r.id AND mr.community_id = $1 AND mr.user_id = $2
                    )
               )",
        )
        .bind(community_id)
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|row| row.id).collect())
    }

    /// Every permission a member is granted community-wide.
    ///
    /// One query, one index scan per role. This runs on the authorization path
    /// of every request, which is why it is a join rather than N lookups.
    pub async fn member_permissions(
        &self,
        community_id: CommunityId,
        user_id: UserId,
    ) -> RepositoryResult<Vec<Permission>> {
        let rows: Vec<PermissionKeyRow> = sqlx::query_as(
            "SELECT DISTINCT rp.permission_key
             FROM role_permissions rp
             JOIN roles r ON r.id = rp.role_id
             WHERE r.community_id = $1
               AND (
                    r.is_default
                    OR EXISTS (
                        SELECT 1 FROM member_roles mr
                        WHERE mr.role_id = r.id AND mr.community_id = $1 AND mr.user_id = $2
                    )
               )",
        )
        .bind(community_id)
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .filter_map(|row| row.permission_key.parse().ok())
            .collect())
    }

    /// Create a role with its permission grants.
    pub async fn create_role(
        &self,
        role: &Role,
        permissions: &[Permission],
    ) -> RepositoryResult<Role> {
        let mut tx = self.pool.begin().await?;

        let created: Role = sqlx::query_as(
            "INSERT INTO roles (id, community_id, name, color, position, is_default)
             VALUES ($1, $2, $3, $4, $5, FALSE)
             RETURNING id, community_id, name, color, position, is_default, created_at",
        )
        .bind(role.id)
        .bind(role.community_id)
        .bind(&role.name)
        .bind(&role.color)
        .bind(role.position)
        .fetch_one(&mut *tx)
        .await?;

        for permission in permissions {
            sqlx::query("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)")
                .bind(role.id)
                .bind(permission.key())
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;
        Ok(created)
    }

    /// Fetch a role, scoped to its community so a role id from another
    /// community cannot be addressed.
    pub async fn find_role(
        &self,
        community_id: CommunityId,
        role_id: RoleId,
    ) -> RepositoryResult<Option<Role>> {
        sqlx::query_as(
            "SELECT id, community_id, name, color, position, is_default, created_at
             FROM roles WHERE id = $1 AND community_id = $2",
        )
        .bind(role_id)
        .bind(community_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Update a role, optionally replacing its whole permission set.
    pub async fn update_role(
        &self,
        community_id: CommunityId,
        role_id: RoleId,
        name: Option<&str>,
        color: Option<&str>,
        position: Option<i32>,
        permissions: Option<&[Permission]>,
    ) -> RepositoryResult<Role> {
        let mut tx = self.pool.begin().await?;

        let updated: Role = sqlx::query_as(
            "UPDATE roles SET
                name     = COALESCE($3, name),
                color    = COALESCE($4, color),
                position = COALESCE($5, position)
             WHERE id = $1 AND community_id = $2
             RETURNING id, community_id, name, color, position, is_default, created_at",
        )
        .bind(role_id)
        .bind(community_id)
        .bind(name)
        .bind(color)
        .bind(position)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(RepositoryError::NotFound("role"))?;

        // Replace rather than merge: a PATCH that sends permissions is stating
        // the complete set, which is the only interpretation that lets a
        // permission be removed.
        if let Some(permissions) = permissions {
            sqlx::query("DELETE FROM role_permissions WHERE role_id = $1")
                .bind(role_id)
                .execute(&mut *tx)
                .await?;

            for permission in permissions {
                sqlx::query(
                    "INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)",
                )
                .bind(role_id)
                .bind(permission.key())
                .execute(&mut *tx)
                .await?;
            }
        }

        tx.commit().await?;
        Ok(updated)
    }

    /// The permissions a single role grants.
    pub async fn role_permissions(&self, role_id: RoleId) -> RepositoryResult<Vec<Permission>> {
        let rows: Vec<PermissionKeyRow> =
            sqlx::query_as("SELECT permission_key FROM role_permissions WHERE role_id = $1")
                .bind(role_id)
                .fetch_all(&self.pool)
                .await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.permission_key.parse().ok())
            .collect())
    }

    /// List a community's roles, highest position first.
    pub async fn list_roles(&self, community_id: CommunityId) -> RepositoryResult<Vec<Role>> {
        sqlx::query_as(
            "SELECT id, community_id, name, color, position, is_default, created_at
             FROM roles WHERE community_id = $1 ORDER BY position DESC, name ASC",
        )
        .bind(community_id)
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)
    }

    /// Assign a role to a member.
    pub async fn assign_role(
        &self,
        community_id: CommunityId,
        user_id: UserId,
        role_id: RoleId,
    ) -> RepositoryResult<()> {
        sqlx::query(
            "INSERT INTO member_roles (community_id, user_id, role_id)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        )
        .bind(community_id)
        .bind(user_id)
        .bind(role_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
