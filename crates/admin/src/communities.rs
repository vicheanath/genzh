//! Community moderation and safety management.

use genzh_domain::audit::AuditAction;
use genzh_domain::ids::{CommunityId, UserId};
use genzh_domain::Timestamp;
use genzh_infrastructure::{DbPool, RepositoryError, ServiceError, ServiceResult};
use serde::{Deserialize, Serialize};

use crate::audit::{AuditLog, AuditRecord};

/// Detailed view of a community for platform staff.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AdminCommunityView {
    pub id: CommunityId,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: UserId,
    pub owner_handle: Option<String>,
    pub member_count: i64,
    pub room_count: i64,
    pub is_quarantined: bool,
    pub quarantined_at: Option<Timestamp>,
    pub quarantine_reason: Option<String>,
    pub created_at: Timestamp,
}

/// Filter options for listing communities in the admin console.
#[derive(Debug, Clone, Default)]
pub struct CommunitySearchQuery {
    pub q: Option<String>,
    pub is_quarantined: Option<bool>,
    pub limit: i64,
}

/// Service managing community moderation and quarantine.
#[derive(Clone)]
pub struct CommunityAdminService {
    pool: DbPool,
    audit: AuditLog,
}

impl CommunityAdminService {
    pub fn new(pool: DbPool, audit: AuditLog) -> Self {
        Self { pool, audit }
    }

    /// Search and list communities with moderation metrics.
    pub async fn list(&self, query: CommunitySearchQuery) -> ServiceResult<Vec<AdminCommunityView>> {
        let needle = query.q.and_then(|q| {
            let t = q.trim().to_lowercase();
            if t.is_empty() { None } else { Some(format!("%{t}%")) }
        });

        let rows = sqlx::query_as::<_, AdminCommunityView>(
            "SELECT c.id, c.name, c.description, c.owner_id, u.handle AS owner_handle,
                    COUNT(DISTINCT cm.user_id)::bigint AS member_count,
                    COUNT(DISTINCT r.id)::bigint AS room_count,
                    c.is_quarantined, c.quarantined_at, c.quarantine_reason, c.created_at
             FROM communities c
             LEFT JOIN users u ON u.id = c.owner_id
             LEFT JOIN community_members cm ON cm.community_id = c.id
             LEFT JOIN rooms r ON r.community_id = c.id
             WHERE ($1::text IS NULL OR lower(c.name) LIKE $1 OR lower(coalesce(c.description, '')) LIKE $1 OR lower(coalesce(u.handle, '')) LIKE $1)
               AND ($2::boolean IS NULL OR c.is_quarantined = $2)
             GROUP BY c.id, c.name, c.description, c.owner_id, u.handle, c.is_quarantined, c.quarantined_at, c.quarantine_reason, c.created_at
             ORDER BY c.created_at DESC
             LIMIT $3",
        )
        .bind(needle)
        .bind(query.is_quarantined)
        .bind(query.limit.clamp(1, 100))
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(rows)
    }

    /// Quarantine a community, disabling invites and public discoverability.
    pub async fn quarantine(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        community_id: CommunityId,
        reason: &str,
    ) -> ServiceResult<AdminCommunityView> {
        let trimmed_reason = reason.trim();
        if trimmed_reason.is_empty() {
            return Err(genzh_domain::DomainError::Invalid {
                field: "reason",
                reason: "A reason is required to quarantine a community".into(),
            }.into());
        }

        let row = sqlx::query_as::<_, AdminCommunityView>(
            "UPDATE communities
             SET is_quarantined = TRUE, quarantined_at = now(), quarantine_reason = $1, updated_at = now()
             WHERE id = $2
             RETURNING id, name, description, owner_id,
                       (SELECT handle FROM users WHERE id = communities.owner_id) AS owner_handle,
                       (SELECT COUNT(*)::bigint FROM community_members WHERE community_id = communities.id) AS member_count,
                       (SELECT COUNT(*)::bigint FROM rooms WHERE community_id = communities.id) AS room_count,
                       is_quarantined, quarantined_at, quarantine_reason, created_at",
        )
        .bind(trimmed_reason)
        .bind(community_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)?
        .ok_or_else(|| ServiceError::not_found("community"))?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::CommunityQuarantined,
                    format!("quarantined community '{}': {}", row.name, trimmed_reason),
                )
                .by(admin_handle)
                .about("community", community_id.as_uuid())
                .with(serde_json::json!({ "reason": trimmed_reason, "community_name": row.name })),
            )
            .await;

        Ok(row)
    }

    /// Lift a quarantine from a community.
    pub async fn unquarantine(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        community_id: CommunityId,
    ) -> ServiceResult<AdminCommunityView> {
        let row = sqlx::query_as::<_, AdminCommunityView>(
            "UPDATE communities
             SET is_quarantined = FALSE, quarantined_at = NULL, quarantine_reason = NULL, updated_at = now()
             WHERE id = $1
             RETURNING id, name, description, owner_id,
                       (SELECT handle FROM users WHERE id = communities.owner_id) AS owner_handle,
                       (SELECT COUNT(*)::bigint FROM community_members WHERE community_id = communities.id) AS member_count,
                       (SELECT COUNT(*)::bigint FROM rooms WHERE community_id = communities.id) AS room_count,
                       is_quarantined, quarantined_at, quarantine_reason, created_at",
        )
        .bind(community_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)?
        .ok_or_else(|| ServiceError::not_found("community"))?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::CommunityUnquarantined,
                    format!("lifted quarantine from community '{}'", row.name),
                )
                .by(admin_handle)
                .about("community", community_id.as_uuid())
                .with(serde_json::json!({ "community_name": row.name })),
            )
            .await;

        Ok(row)
    }

    /// Force delete a community violating platform policies.
    pub async fn delete_community(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        community_id: CommunityId,
    ) -> ServiceResult<()> {
        let name: Option<(String,)> =
            sqlx::query_as("SELECT name FROM communities WHERE id = $1")
                .bind(community_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(RepositoryError::from)?;

        let Some((name,)) = name else {
            return Err(ServiceError::not_found("community"));
        };

        sqlx::query("DELETE FROM communities WHERE id = $1")
            .bind(community_id)
            .execute(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::CommunityRemoved,
                    format!("deleted community '{name}' via moderation"),
                )
                .by(admin_handle)
                .about("community", community_id.as_uuid())
                .with(serde_json::json!({ "community_name": name })),
            )
            .await;

        Ok(())
    }
}
