//! Platform-wide system broadcasts and announcement banners.

use genzh_domain::audit::AuditAction;
use genzh_domain::ids::UserId;
use genzh_domain::Timestamp;
use genzh_infrastructure::{DbPool, RepositoryError, ServiceError, ServiceResult};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::audit::{AuditLog, AuditRecord};

/// A platform announcement banner.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SystemBroadcast {
    pub id: Uuid,
    pub title: String,
    pub message: String,
    pub level: String, // 'info', 'warning', 'danger'
    pub is_active: bool,
    pub created_by: Option<UserId>,
    pub created_at: Timestamp,
    pub expires_at: Option<Timestamp>,
}

/// Request to create a new system broadcast.
#[derive(Debug, Clone, Deserialize)]
pub struct NewBroadcast {
    pub title: String,
    pub message: String,
    pub level: Option<String>,
    pub expires_at: Option<Timestamp>,
}

/// Service managing system announcements.
#[derive(Clone)]
pub struct BroadcastService {
    pool: DbPool,
    audit: AuditLog,
}

impl BroadcastService {
    pub fn new(pool: DbPool, audit: AuditLog) -> Self {
        Self { pool, audit }
    }

    /// List active broadcasts for users.
    pub async fn list_active(&self) -> ServiceResult<Vec<SystemBroadcast>> {
        let rows = sqlx::query_as::<_, SystemBroadcast>(
            "SELECT id, title, message, level, is_active, created_by, created_at, expires_at
             FROM system_broadcasts
             WHERE is_active = TRUE
               AND (expires_at IS NULL OR expires_at > now())
             ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(rows)
    }

    /// List all broadcasts for staff console.
    pub async fn list_all(&self) -> ServiceResult<Vec<SystemBroadcast>> {
        let rows = sqlx::query_as::<_, SystemBroadcast>(
            "SELECT id, title, message, level, is_active, created_by, created_at, expires_at
             FROM system_broadcasts
             ORDER BY created_at DESC
             LIMIT 50",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(rows)
    }

    /// Create a new platform broadcast.
    pub async fn create(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        input: NewBroadcast,
    ) -> ServiceResult<SystemBroadcast> {
        let title = input.title.trim();
        let message = input.message.trim();
        if title.is_empty() || message.is_empty() {
            return Err(genzh_domain::DomainError::Invalid {
                field: "title",
                reason: "Broadcast title and message are required".into(),
            }.into());
        }

        let level = input.level.unwrap_or_else(|| "info".into());
        let id = Uuid::new_v4();

        let broadcast = sqlx::query_as::<_, SystemBroadcast>(
            "INSERT INTO system_broadcasts (id, title, message, level, is_active, created_by, created_at, expires_at)
             VALUES ($1, $2, $3, $4, TRUE, $5, now(), $6)
             RETURNING id, title, message, level, is_active, created_by, created_at, expires_at",
        )
        .bind(id)
        .bind(title)
        .bind(message)
        .bind(&level)
        .bind(admin_id)
        .bind(input.expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::BroadcastCreated,
                    format!("published system broadcast: '{title}'"),
                )
                .by(admin_handle)
                .about("broadcast", id)
                .with(serde_json::json!({ "title": title, "level": level })),
            )
            .await;

        Ok(broadcast)
    }

    /// Dismiss or deactivate a broadcast.
    pub async fn dismiss(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        broadcast_id: Uuid,
    ) -> ServiceResult<()> {
        let title: Option<(String,)> =
            sqlx::query_as("SELECT title FROM system_broadcasts WHERE id = $1")
                .bind(broadcast_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(RepositoryError::from)?;

        let Some((title,)) = title else {
            return Err(ServiceError::not_found("broadcast"));
        };

        sqlx::query("UPDATE system_broadcasts SET is_active = FALSE WHERE id = $1")
            .bind(broadcast_id)
            .execute(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::BroadcastDismissed,
                    format!("dismissed system broadcast: '{title}'"),
                )
                .by(admin_handle)
                .about("broadcast", broadcast_id)
                .with(serde_json::json!({ "title": title })),
            )
            .await;

        Ok(())
    }
}
