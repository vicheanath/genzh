//! Communities — the top-level social container that owns rooms, roles and
//! members.

use serde::{Deserialize, Serialize};

use crate::Timestamp;
use crate::error::{DomainError, DomainResult};
use crate::ids::{CommunityId, RoleId, UserId};
use crate::permission::PermissionSet;

/// Maximum length of a community name.
pub const COMMUNITY_NAME_MAX_LEN: usize = 64;
/// Maximum length of a role name.
pub const ROLE_NAME_MAX_LEN: usize = 48;
/// Name of the implicit role every member carries.
pub const EVERYONE_ROLE_NAME: &str = "@everyone";

/// A role a community is created with.
///
/// Static shapes, not rows: the repository turns these into `roles` and
/// `role_permissions` when the community is made.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RoleTemplate {
    pub name: &'static str,
    pub color: Option<&'static str>,
    /// Higher wins when roles disagree, and gates who may edit whom.
    pub position: i32,
    /// The implicit role every member carries. Exactly one is true.
    pub is_default: bool,
    pub permissions: PermissionSet,
}

/// The roles every new community starts with.
///
/// A community used to be created with `@everyone` alone, which left an owner
/// with no way to delegate anything without first designing a role from a list
/// of fourteen permissions — and no way for an ordinary member to share a
/// screen at all, since `@everyone` deliberately withholds it.
///
/// These are a starting point, not a fixed set: they are ordinary rows, so an
/// owner can rename, re-permission or delete any of them except `@everyone`.
pub fn starter_roles() -> Vec<RoleTemplate> {
    vec![
        RoleTemplate {
            name: EVERYONE_ROLE_NAME,
            color: None,
            position: 0,
            is_default: true,
            permissions: PermissionSet::default_member(),
        },
        RoleTemplate {
            name: "Presenter",
            color: Some("#2fe6a7"),
            position: 1,
            is_default: false,
            // The gap `@everyone` leaves: everything a member can do, plus the
            // two publishing rights that are withheld by default.
            permissions: PermissionSet::default_member()
                .union(PermissionSet::SCREEN_SHARE)
                .union(PermissionSet::STREAM),
        },
        RoleTemplate {
            name: "Moderator",
            color: Some("#06b6d4"),
            position: 2,
            is_default: false,
            // Can run the place day to day, but cannot change what the place
            // *is* — no community settings, no roles, no members removed.
            permissions: PermissionSet::default_member()
                .union(PermissionSet::SCREEN_SHARE)
                .union(PermissionSet::MUTE_MEMBERS)
                .union(PermissionSet::MOVE_MEMBERS)
                .union(PermissionSet::MANAGE_ROOM),
        },
        RoleTemplate {
            name: "Admin",
            color: Some("#8b5cf6"),
            position: 3,
            is_default: false,
            // Administrator short-circuits every check, so it needs no others.
            permissions: PermissionSet::ADMINISTRATOR,
        },
    ]
}

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

/// A member together with the roles they have been given.
///
/// The member row and their roles are two tables, and every screen that lists
/// members wants both — who is here, and what they can do. Pairing them here
/// keeps that from being two requests and a join in the client.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberWithRoles {
    /// The membership itself.
    #[serde(flatten)]
    pub member: CommunityMember,
    /// Roles explicitly assigned, highest position first.
    ///
    /// Excludes `@everyone`: every member holds it by definition, so listing it
    /// would say nothing about anyone.
    pub roles: Vec<Role>,
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
        assert_eq!(
            validate_community_name(" Night Owls ").unwrap(),
            "Night Owls"
        );
        assert!(validate_community_name(&"x".repeat(65)).is_err());
        assert!(validate_role_name(&"x".repeat(49)).is_err());
    }
}

#[cfg(test)]
mod starter_role_tests {
    use super::*;
    use crate::Permission;

    #[test]
    fn exactly_one_starter_role_is_the_default() {
        let defaults = starter_roles().iter().filter(|r| r.is_default).count();
        assert_eq!(defaults, 1);
    }

    #[test]
    fn the_default_role_is_everyone_and_sits_at_the_bottom() {
        let roles = starter_roles();
        let everyone = roles.iter().find(|r| r.is_default).expect("a default role");
        assert_eq!(everyone.name, EVERYONE_ROLE_NAME);
        assert_eq!(everyone.position, 0);
    }

    #[test]
    fn positions_are_distinct_so_precedence_is_unambiguous() {
        let mut positions: Vec<i32> = starter_roles().iter().map(|r| r.position).collect();
        positions.sort_unstable();
        let before = positions.len();
        positions.dedup();
        assert_eq!(positions.len(), before);
    }

    #[test]
    fn presenter_closes_the_gap_everyone_leaves() {
        let roles = starter_roles();
        let everyone = roles.iter().find(|r| r.is_default).unwrap();
        let presenter = roles.iter().find(|r| r.name == "Presenter").unwrap();

        assert!(!everyone.permissions.allows(Permission::ScreenShare));
        assert!(presenter.permissions.allows(Permission::ScreenShare));
        assert!(presenter.permissions.allows(Permission::Speak));
    }

    #[test]
    fn moderator_runs_the_place_but_cannot_redefine_it() {
        let roles = starter_roles();
        let moderator = roles.iter().find(|r| r.name == "Moderator").unwrap();

        assert!(moderator.permissions.allows(Permission::ManageRoom));
        assert!(moderator.permissions.allows(Permission::MuteMembers));
        assert!(!moderator.permissions.allows(Permission::ManageCommunity));
        assert!(!moderator.permissions.allows(Permission::ManageRoles));
        assert!(!moderator.permissions.allows(Permission::Administrator));
    }

    #[test]
    fn admin_is_administrator_and_therefore_allows_everything() {
        let roles = starter_roles();
        let admin = roles.iter().find(|r| r.name == "Admin").unwrap();
        for permission in Permission::ALL {
            assert!(admin.permissions.allows(*permission), "{permission:?}");
        }
    }
}
