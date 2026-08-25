//! Authority above a community.
//!
//! [`crate::Permission`] answers "what may this member do *here*", and every
//! answer is scoped to the community that granted it — by design, so nobody can
//! be given power over a community they were not invited to. That leaves the
//! platform itself with nobody who can act: no one to answer a support ticket,
//! and no one to suspend an account that is abusing several communities at
//! once. This is that missing tier, and it is deliberately small.

use serde::{Deserialize, Serialize};

use crate::error::DomainError;

/// What somebody is to the platform, as opposed to any one community.
///
/// Ordered: each tier can do everything the one below it can. Kept to three,
/// because a tier nobody occupies is a permission nobody audits.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, sqlx::Type,
)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "platform_role", rename_all = "snake_case")]
pub enum PlatformRole {
    /// Everybody. No platform authority at all.
    User,
    /// Reads the support queue and answers it. Deliberately cannot destroy
    /// anything: answering "I can't join voice" does not require the ability to
    /// delete the account asking.
    Support,
    /// Support, plus enforcement — suspending accounts, removing content — and
    /// the audit log that records it.
    Admin,
}

impl Default for PlatformRole {
    fn default() -> Self {
        Self::User
    }
}

impl PlatformRole {
    /// Stable lower-case name, used on the wire and in logs.
    pub const fn key(self) -> &'static str {
        match self {
            PlatformRole::User => "user",
            PlatformRole::Support => "support",
            PlatformRole::Admin => "admin",
        }
    }

    /// Anyone who works the support queue: support and admin both.
    pub const fn is_staff(self) -> bool {
        matches!(self, PlatformRole::Support | PlatformRole::Admin)
    }

    /// May suspend accounts, remove content, read the audit log, and change
    /// who else is staff.
    pub const fn is_admin(self) -> bool {
        matches!(self, PlatformRole::Admin)
    }

    /// Can this role read the audit log?
    ///
    /// Admin only, and not because it is dangerous to read — because it records
    /// enforcement against real accounts, and the fewer people who can page
    /// through that, the better.
    pub const fn may_read_audit_log(self) -> bool {
        self.is_admin()
    }
}

impl std::str::FromStr for PlatformRole {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "user" => Ok(PlatformRole::User),
            "support" => Ok(PlatformRole::Support),
            "admin" => Ok(PlatformRole::Admin),
            other => Err(DomainError::invalid(
                "platform_role",
                format!("`{other}` is not a platform role"),
            )),
        }
    }
}

impl std::fmt::Display for PlatformRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.key())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_tiers_are_ordered_so_admin_outranks_support() {
        assert!(PlatformRole::Admin > PlatformRole::Support);
        assert!(PlatformRole::Support > PlatformRole::User);
    }

    #[test]
    fn support_works_the_queue_but_cannot_enforce() {
        assert!(PlatformRole::Support.is_staff());
        assert!(!PlatformRole::Support.is_admin());
        assert!(!PlatformRole::Support.may_read_audit_log());
    }

    #[test]
    fn an_ordinary_user_is_not_staff() {
        assert!(!PlatformRole::User.is_staff());
        assert!(!PlatformRole::User.is_admin());
    }

    #[test]
    fn admin_can_do_everything_support_can() {
        assert!(PlatformRole::Admin.is_staff());
        assert!(PlatformRole::Admin.is_admin());
        assert!(PlatformRole::Admin.may_read_audit_log());
    }

    #[test]
    fn keys_round_trip() {
        for role in [PlatformRole::User, PlatformRole::Support, PlatformRole::Admin] {
            assert_eq!(role.key().parse::<PlatformRole>().unwrap(), role);
        }
        assert!("root".parse::<PlatformRole>().is_err());
    }
}
