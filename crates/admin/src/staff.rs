//! Platform staff: who they are, and what they may do to an account.

use genzh_domain::audit::AuditAction;
use genzh_domain::ids::UserId;
use genzh_domain::platform::PlatformRole;
use genzh_infrastructure::{DbPool, RepositoryError, ServiceError, ServiceResult};
use serde::Serialize;

use crate::audit::{AuditLog, AuditRecord};

/// An account as staff see it.
///
/// Enough to decide whether to act, and no more. Notably no password hash and
/// no session material: the console is a place to answer questions about an
/// account, not to become it.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct StaffUserView {
    pub id: UserId,
    pub handle: String,
    pub email: String,
    pub display_name: Option<String>,
    pub is_active: bool,
    pub platform_role: PlatformRole,
    pub suspended_at: Option<chrono::DateTime<chrono::Utc>>,
    pub suspension_reason: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Reads and writes the staff tier, and enforcement against accounts.
#[derive(Clone)]
pub struct StaffService {
    pool: DbPool,
    audit: AuditLog,
}

impl StaffService {
    pub fn new(pool: DbPool, audit: AuditLog) -> Self {
        Self { pool, audit }
    }

    /// What this account is to the platform.
    ///
    /// Read from the database on every check rather than carried in the access
    /// token: staff authority is exactly the thing that must stop working the
    /// moment it is revoked, not fifteen minutes later when a JWT expires.
    pub async fn role_of(&self, user_id: UserId) -> ServiceResult<PlatformRole> {
        let role: Option<(PlatformRole,)> =
            sqlx::query_as("SELECT platform_role FROM users WHERE id = $1")
                .bind(user_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(RepositoryError::from)?;

        Ok(role.map(|(role,)| role).unwrap_or_default())
    }

    /// Find accounts by handle or e-mail.
    ///
    /// Substring, case-insensitive, and capped — support is given somebody's
    /// handle and needs to find them, which is not the same as being able to
    /// page through every account on the platform.
    pub async fn search_users(&self, query: &str, limit: i64) -> ServiceResult<Vec<StaffUserView>> {
        let needle = format!("%{}%", query.trim().to_lowercase());
        let users = sqlx::query_as::<_, StaffUserView>(
            "SELECT u.id, u.handle, u.email, p.display_name, u.is_active, u.platform_role,
                    u.suspended_at, u.suspension_reason, u.created_at
             FROM users u
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE lower(u.handle) LIKE $1 OR lower(u.email) LIKE $1
             ORDER BY u.created_at DESC
             LIMIT $2",
        )
        .bind(&needle)
        .bind(limit.clamp(1, 100))
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(users)
    }

    /// One account, by id.
    pub async fn find_user(&self, user_id: UserId) -> ServiceResult<StaffUserView> {
        sqlx::query_as::<_, StaffUserView>(
            "SELECT u.id, u.handle, u.email, p.display_name, u.is_active, u.platform_role,
                    u.suspended_at, u.suspension_reason, u.created_at
             FROM users u
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE u.id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::from)?
        .ok_or_else(|| ServiceError::not_found("user"))
    }

    /// Every account with platform authority.
    pub async fn list_staff(&self) -> ServiceResult<Vec<StaffUserView>> {
        let staff = sqlx::query_as::<_, StaffUserView>(
            "SELECT u.id, u.handle, u.email, p.display_name, u.is_active, u.platform_role,
                    u.suspended_at, u.suspension_reason, u.created_at
             FROM users u
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE u.platform_role <> 'user'
             ORDER BY u.platform_role DESC, u.handle",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        Ok(staff)
    }

    /// Suspend an account.
    ///
    /// Flips `is_active`, which login, refresh and session validation already
    /// check — so the account stops working everywhere at once, including for
    /// sessions that are currently open, rather than only at the next sign-in.
    pub async fn suspend(
        &self,
        actor: UserId,
        actor_handle: &str,
        target: UserId,
        reason: &str,
    ) -> ServiceResult<StaffUserView> {
        if actor == target {
            return Err(ServiceError::denied("suspend_self"));
        }

        let subject = self.find_user(target).await?;
        // An admin who can suspend other admins can remove everyone who could
        // reverse it. Enforcement is for accounts, not for colleagues.
        if subject.platform_role.is_admin() {
            return Err(ServiceError::denied("suspend_admin"));
        }

        sqlx::query(
            "UPDATE users
             SET is_active = FALSE, suspended_at = now(), suspension_reason = $2, updated_at = now()
             WHERE id = $1",
        )
        .bind(target)
        .bind(reason)
        .execute(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(actor),
                    AuditAction::UserSuspended,
                    format!("suspended @{}", subject.handle),
                )
                .by(actor_handle)
                .about("user", target.into())
                .with(serde_json::json!({ "reason": reason })),
            )
            .await;

        self.find_user(target).await
    }

    /// Lift a suspension.
    pub async fn reinstate(
        &self,
        actor: UserId,
        actor_handle: &str,
        target: UserId,
    ) -> ServiceResult<StaffUserView> {
        let subject = self.find_user(target).await?;

        sqlx::query(
            "UPDATE users
             SET is_active = TRUE, suspended_at = NULL, suspension_reason = NULL, updated_at = now()
             WHERE id = $1",
        )
        .bind(target)
        .execute(&self.pool)
        .await
        .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(actor),
                    AuditAction::UserReinstated,
                    format!("reinstated @{}", subject.handle),
                )
                .by(actor_handle)
                .about("user", target.into()),
            )
            .await;

        self.find_user(target).await
    }

    /// Grant or revoke platform authority.
    pub async fn set_platform_role(
        &self,
        actor: UserId,
        actor_handle: &str,
        target: UserId,
        role: PlatformRole,
    ) -> ServiceResult<StaffUserView> {
        if actor == target {
            // Otherwise the last admin can demote themselves and leave the
            // platform with nobody who can promote anyone.
            return Err(ServiceError::denied("change_own_platform_role"));
        }

        let subject = self.find_user(target).await?;

        sqlx::query("UPDATE users SET platform_role = $2, updated_at = now() WHERE id = $1")
            .bind(target)
            .bind(role)
            .execute(&self.pool)
            .await
            .map_err(RepositoryError::from)?;

        self.audit
            .record_best_effort(
                AuditRecord::new(
                    Some(actor),
                    AuditAction::PlatformRoleChanged,
                    format!(
                        "changed @{} from {} to {}",
                        subject.handle, subject.platform_role, role
                    ),
                )
                .by(actor_handle)
                .about("user", target.into())
                .with(serde_json::json!({
                    "from": subject.platform_role.key(),
                    "to": role.key(),
                })),
            )
            .await;

        self.find_user(target).await
    }
}
