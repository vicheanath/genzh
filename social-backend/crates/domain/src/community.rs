//! Communities — the top-level social container that owns rooms, roles and
//! members.

use serde::{Deserialize, Serialize};

use crate::error::{DomainError, DomainResult};
use crate::ids::{CommunityId, RoleId, UserId};
use crate::permission::PermissionSet;
use crate::Timestamp;

/// Maximum length of a community name.
pub const COMMUNITY_NAME_MAX_LEN: usize = 64;
/// Maximum length of a role name.
pub const ROLE_NAME_MAX_LEN: usize = 48;
/// Name of the implicit role every member carries.
pub const EVERYONE_ROLE_NAME: &str = "@everyone";

/// A community ("server", "hangout").
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Community {
    /// Primary key.
    pub id: CommunityId,
    /// Display name.
    pub name: String,
    /// Short description shown in discovery.
    pub description: Option<String>,
    /// Icon image URL.
    pub icon_url: Option<String>,
    /// The account with implicit [`crate::Permission::Administrator`].
    pub owner_id: UserId,
    /// Creation time (UTC).
    pub created_at: Timestamp,
    /// Last modification time (UTC).
    pub updated_at: Timestamp,
}

impl Community {
    /// Owners bypass the role system entirely; this keeps that rule in one place.
    pub fn is_owner(&self, user_id: UserId) -> bool {
        self.owner_id == user_id
    }
}

/// Membership of a user in a community.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CommunityMember {
    /// Community the membership belongs to.
    pub community_id: CommunityId,
    /// Member account.
    pub user_id: UserId,
    /// Per-community override of the profile display name.
    pub nickname: Option<String>,
    /// When the user joined (UTC).
    pub joined_at: Timestamp,
}

/// A named bundle of permissions inside one community.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Role {
    /// Primary key.
    pub id: RoleId,
    /// Owning community.
    pub community_id: CommunityId,
    /// Display name.
    pub name: String,
    /// Badge colour as `#rrggbb`.
    pub color: Option<String>,
    /// Higher wins when roles conflict; also gates who may edit whom.
    pub position: i32,
    /// True for the implicit `@everyone` role, which cannot be deleted.
    pub is_default: bool,
    /// Creation time (UTC).
    pub created_at: Timestamp,
}

/// A role together with the permissions it grants, as resolved from the
/// `role_permissions` join table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleWithPermissions {
    /// The role itself.
    #[serde(flatten)]
    pub role: Role,
    /// Folded permission mask.
    pub permissions: PermissionSet,
}

/// Validate a community name.
pub fn validate_community_name(raw: &str) -> DomainResult<String> {
    let name = raw.trim().to_owned();
    if name.is_empty() || name.chars().count() > COMMUNITY_NAME_MAX_LEN {
        return Err(DomainError::invalid(
            "name",
            format!("must be between 1 and {COMMUNITY_NAME_MAX_LEN} characters"),
        ));
    }
    Ok(name)
}

/// Validate a role name.
pub fn validate_role_name(raw: &str) -> DomainResult<String> {
    let name = raw.trim().to_owned();
    if name.is_empty() || name.chars().count() > ROLE_NAME_MAX_LEN {
        return Err(DomainError::invalid(
            "name",
            format!("must be between 1 and {ROLE_NAME_MAX_LEN} characters"),
        ));
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn community(owner: UserId) -> Community {
        Community {
            id: CommunityId::new(),
            name: "Night Owls".into(),
            description: None,
            icon_url: None,
            owner_id: owner,
            created_at: crate::now(),
            updated_at: crate::now(),
        }
    }

    #[test]
    fn ownership_is_identity_based() {
        let owner = UserId::new();
        let c = community(owner);
        assert!(c.is_owner(owner));
        assert!(!c.is_owner(UserId::new()));
    }

    #[test]
    fn names_are_bounded() {
        assert!(validate_community_name("  ").is_err());
        assert_eq!(validate_community_name(" Night Owls ").unwrap(), "Night Owls");
        assert!(validate_community_name(&"x".repeat(65)).is_err());
        assert!(validate_role_name(&"x".repeat(49)).is_err());
    }
}
