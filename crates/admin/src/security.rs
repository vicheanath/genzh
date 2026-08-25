//! Security controls: IP/CIDR bans and disposable email domain blocking.

use genzh_domain::audit::AuditAction;
use genzh_domain::ids::UserId;
use genzh_domain::Timestamp;
use genzh_infrastructure::{DbPool, RepositoryError, ServiceError, ServiceResult};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::audit::{AuditLog, AuditRecord};

/// An IP / CIDR network ban.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct IpBan {
    pub id: Uuid,
    pub ip_or_cidr: String,
    pub reason: String,
    pub banned_by: Option<UserId>,
    pub created_at: Timestamp,
    pub expires_at: Option<Timestamp>,
}

/// A blocked disposable email domain.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BlockedEmailDomain {
    pub domain: String,
    pub reason: Option<String>,
    pub created_by: Option<UserId>,
    pub created_at: Timestamp,
}

/// Service managing access bans and domain blocks.
#[derive(Clone)]
pub struct SecurityService {
    pool: DbPool,
    audit: AuditLog,
}

impl SecurityService {
    pub fn new(pool: DbPool, audit: AuditLog) -> Self {
        Self { pool, audit }
    }

    /// List all active IP bans.
    pub async fn list_ip_bans(&self) -> ServiceResult<Vec<IpBan>> {
        let rows = sqlx::query_as::<_, IpBan>(
            "SELECT id, ip_or_cidr, reason, banned_by, created_at, expires_at
             FROM ip_bans
             ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(rows)
    }

    /// Add an IP or CIDR block.
    pub async fn ban_ip(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        ip_or_cidr: &str,
        reason: &str,
        expires_at: Option<Timestamp>,
    ) -> ServiceResult<IpBan> {
        let ip_or_cidr = ip_or_cidr.trim();
        let reason = reason.trim();
        if ip_or_cidr.is_empty() || reason.is_empty() {
            return Err(genzh_domain::DomainError::Invalid {
                field: "ip_or_cidr",
                reason: "IP/CIDR address and ban reason are required".into(),
            }.into());
        }

        let id = Uuid::new_v4();
        let row = sqlx::query_as::<_, IpBan>(
            "INSERT INTO ip_bans (id, ip_or_cidr, reason, banned_by, created_at, expires_at)
             VALUES ($1, $2, $3, $4, now(), $5)
             ON CONFLICT (ip_or_cidr) DO UPDATE
             SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at
             RETURNING id, ip_or_cidr, reason, banned_by, created_at, expires_at",
        )
        .bind(id)
        .bind(ip_or_cidr)
        .bind(reason)
        .bind(admin_id)
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::IpBanned,
                    format!("banned IP '{ip_or_cidr}': {reason}"),
                )
                .by(admin_handle)
                .about("ip_ban", id)
                .with(serde_json::json!({ "ip_or_cidr": ip_or_cidr, "reason": reason })),
            )
            .await;

        Ok(row)
    }

    /// Remove an IP ban.
    pub async fn unban_ip(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        ban_id: Uuid,
    ) -> ServiceResult<()> {
        let ip: Option<(String,)> = sqlx::query_as("SELECT ip_or_cidr FROM ip_bans WHERE id = $1")
            .bind(ban_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        let Some((ip,)) = ip else {
            return Err(ServiceError::not_found("ip_ban"));
        };

        sqlx::query("DELETE FROM ip_bans WHERE id = $1")
            .bind(ban_id)
            .execute(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::IpUnbanned,
                    format!("lifted ban for IP '{ip}'"),
                )
                .by(admin_handle)
                .about("ip_ban", ban_id)
                .with(serde_json::json!({ "ip_or_cidr": ip })),
            )
            .await;

        Ok(())
    }

    /// List all blocked email domains.
    pub async fn list_email_domains(&self) -> ServiceResult<Vec<BlockedEmailDomain>> {
        let rows = sqlx::query_as::<_, BlockedEmailDomain>(
            "SELECT domain, reason, created_by, created_at
             FROM blocked_email_domains
             ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(rows)
    }

    /// Block a disposable email domain.
    pub async fn block_email_domain(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        domain: &str,
        reason: Option<&str>,
    ) -> ServiceResult<BlockedEmailDomain> {
        let clean_domain = domain.trim().to_lowercase().replace('@', "");
        if clean_domain.is_empty() {
            return Err(genzh_domain::DomainError::Invalid {
                field: "domain",
                reason: "Valid domain name required".into(),
            }.into());
        }

        let row = sqlx::query_as::<_, BlockedEmailDomain>(
            "INSERT INTO blocked_email_domains (domain, reason, created_by, created_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (domain) DO UPDATE
             SET reason = EXCLUDED.reason
             RETURNING domain, reason, created_by, created_at",
        )
        .bind(&clean_domain)
        .bind(reason)
        .bind(admin_id)
        .fetch_one(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::EmailDomainBlocked,
                    format!("blocked disposable email domain '{clean_domain}'"),
                )
                .by(admin_handle)
                .about_type("email_domain")
                .with(serde_json::json!({ "domain": clean_domain })),
            )
            .await;

        Ok(row)
    }

    /// Unblock an email domain.
    pub async fn unblock_email_domain(
        &self,
        admin_id: UserId,
        admin_handle: &str,
        domain: &str,
    ) -> ServiceResult<()> {
        let clean_domain = domain.trim().to_lowercase().replace('@', "");
        sqlx::query("DELETE FROM blocked_email_domains WHERE domain = $1")
            .bind(&clean_domain)
            .execute(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(admin_id),
                    AuditAction::EmailDomainUnblocked,
                    format!("unblocked email domain '{clean_domain}'"),
                )
                .by(admin_handle)
                .about_type("email_domain")
                .with(serde_json::json!({ "domain": clean_domain })),
            )
            .await;

        Ok(())
    }

    /// Prune IP bans that have reached their expiration time.
    pub async fn prune_expired_bans(&self) -> ServiceResult<u64> {
        let result = sqlx::query(
            "DELETE FROM ip_bans
              WHERE expires_at IS NOT NULL AND expires_at <= now()",
        )
        .execute(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(result.rows_affected())
    }
}

