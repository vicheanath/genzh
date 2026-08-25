//! Platform settings and dynamic feature flags.

use std::collections::HashMap;

use genzh_domain::audit::AuditAction;
use genzh_domain::ids::UserId;
use genzh_domain::Timestamp;
use genzh_infrastructure::{DbPool, RepositoryError, ServiceResult};
use serde::{Deserialize, Serialize};

use crate::audit::{AuditLog, AuditRecord};

/// One system setting row.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SystemSetting {
    pub key: String,
    pub value: serde_json::Value,
    pub updated_at: Timestamp,
    pub updated_by: Option<UserId>,
}

/// Service managing dynamic feature flags and maintenance toggles.
#[derive(Clone)]
pub struct SettingsService {
    pool: DbPool,
    audit: AuditLog,
}

impl SettingsService {
    pub fn new(pool: DbPool, audit: AuditLog) -> Self {
        Self { pool, audit }
    }

    /// Retrieve all settings as a key-value map.
    pub async fn get_all(&self) -> ServiceResult<HashMap<String, serde_json::Value>> {
        let rows = sqlx::query_as::<_, SystemSetting>(
            "SELECT key, value, updated_at, updated_by FROM system_settings",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        let mut map = HashMap::new();
        for r in rows {
            map.insert(r.key, r.value);
        }
        Ok(map)
    }

    /// Update a specific setting or feature flag.
    pub async fn set(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        key: &str,
        value: serde_json::Value,
    ) -> ServiceResult<SystemSetting> {
        let row = sqlx::query_as::<_, SystemSetting>(
            "INSERT INTO system_settings (key, value, updated_at, updated_by)
             VALUES ($1, $2, now(), $3)
             ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
             RETURNING key, value, updated_at, updated_by",
        )
        .bind(key)
        .bind(&value)
        .bind(admin_id)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::FeatureFlagUpdated,
                    format!("updated feature flag '{key}' to {value}"),
                )
                .by(admin_handle)
                .about_type("setting")
                .with(serde_json::json!({ "key": key, "value": value })),
            )
            .await;

        Ok(row)
    }
}
