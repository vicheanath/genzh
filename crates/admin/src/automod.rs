//! Automated moderation rules and keyword filtering.

use genzh_domain::audit::AuditAction;
use genzh_domain::ids::UserId;
use genzh_domain::Timestamp;
use genzh_infrastructure::{DbPool, RepositoryError, ServiceError, ServiceResult};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::audit::{AuditLog, AuditRecord};

/// An AutoMod rule.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AutomodRule {
    pub id: Uuid,
    pub name: String,
    pub pattern: String,
    pub is_regex: bool,
    pub action: String, // 'block' or 'flag_report'
    pub is_active: bool,
    pub created_by: Option<UserId>,
    pub created_at: Timestamp,
}

/// Request to create a new AutoMod rule.
#[derive(Debug, Clone, Deserialize)]
pub struct NewAutomodRule {
    pub name: String,
    pub pattern: String,
    #[serde(default)]
    pub is_regex: bool,
    #[serde(default = "default_action")]
    pub action: String,
}

fn default_action() -> String {
    "block".to_string()
}

/// Service managing automated keyword and regex filtering.
#[derive(Clone)]
pub struct AutomodService {
    pool: DbPool,
    audit: AuditLog,
}

impl AutomodService {
    pub fn new(pool: DbPool, audit: AuditLog) -> Self {
        Self { pool, audit }
    }

    /// List all AutoMod rules.
    pub async fn list(&self) -> ServiceResult<Vec<AutomodRule>> {
        let rows = sqlx::query_as::<_, AutomodRule>(
            "SELECT id, name, pattern, is_regex, action, is_active, created_by, created_at
             FROM automod_rules
             ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(rows)
    }

    /// Create a new AutoMod rule.
    pub async fn create(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        input: NewAutomodRule,
    ) -> ServiceResult<AutomodRule> {
        let name = input.name.trim();
        let pattern = input.pattern.trim();
        if name.is_empty() || pattern.is_empty() {
            return Err(genzh_domain::DomainError::Invalid {
                field: "pattern",
                reason: "Rule name and pattern are required".into(),
            }.into());
        }

        let id = Uuid::new_v4();
        let row = sqlx::query_as::<_, AutomodRule>(
            "INSERT INTO automod_rules (id, name, pattern, is_regex, action, is_active, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, TRUE, $6, now())
             RETURNING id, name, pattern, is_regex, action, is_active, created_by, created_at",
        )
        .bind(id)
        .bind(name)
        .bind(pattern)
        .bind(input.is_regex)
        .bind(&input.action)
        .bind(admin_id)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::AutomodRuleCreated,
                    format!("created AutoMod rule '{name}' ({pattern})"),
                )
                .by(admin_handle)
                .about("automod_rule", id)
                .with(serde_json::json!({ "name": name, "pattern": pattern })),
            )
            .await;

        Ok(row)
    }

    /// Delete an AutoMod rule.
    pub async fn delete(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        rule_id: Uuid,
    ) -> ServiceResult<()> {
        let name: Option<(String,)> =
            sqlx::query_as("SELECT name FROM automod_rules WHERE id = $1")
                .bind(rule_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(RepositoryError::from)?;

        let Some((name,)) = name else {
            return Err(ServiceError::not_found("automod_rule"));
        };

        sqlx::query("DELETE FROM automod_rules WHERE id = $1")
            .bind(rule_id)
            .execute(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::AutomodRuleRemoved,
                    format!("removed AutoMod rule '{name}'"),
                )
                .by(admin_handle)
                .about("automod_rule", rule_id)
                .with(serde_json::json!({ "name": name })),
            )
            .await;

        Ok(())
    }
}
