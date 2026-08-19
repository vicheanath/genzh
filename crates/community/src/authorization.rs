//! Resolving what a member may do.
//!
//! ## The rule, in full
//!
//! ```text
//!   owner?  ──yes──▶ Administrator (every permission, no further questions)
//!     │no
//!     ▼
//!   member? ──no───▶ NotAMember
//!     │yes
//!     ▼
//!   union of the permissions granted by @everyone and by every role held
//!     │
//!     ▼
//!   (per room) subtract that room's denials, then add that room's grants
//! ```
//!
//! The fold is deliberately a *union*: roles add capability, they never remove
//! it. Removal is a room-level concern, which is what makes "muted in this one
//! room" expressible without inventing a negative role.
//!
//! The functions here are pure. The database supplies the grants; the rules
//! live in code that a unit test can drive with a list.

use std::collections::HashSet;

use genzh_domain::community::Community;
use genzh_domain::{
    CommunityId, DomainError, DomainResult, Permission, PermissionSet, RoleId, UserId,
};

/// Everything known about one member's standing in one community.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemberContext {
    /// Community the context is about.
    pub community_id: CommunityId,
    /// Member.
    pub user_id: UserId,
    /// Owners bypass roles entirely.
    pub is_owner: bool,
    /// Roles held, including the implicit `@everyone`. Needed to evaluate
    /// room-level overrides, which are keyed by role.
    pub role_ids: HashSet<RoleId>,
    /// Community-wide permissions, already folded.
    pub permissions: PermissionSet,
}

impl MemberContext {
    /// Build a context from raw grants.
    pub fn new(
        community: &Community,
        user_id: UserId,
        role_ids: HashSet<RoleId>,
        granted: impl IntoIterator<Item = Permission>,
    ) -> Self {
        let is_owner = community.is_owner(user_id);
        Self {
            community_id: community.id,
            user_id,
            is_owner,
            role_ids,
            permissions: resolve_member_permissions(is_owner, granted),
        }
    }

    /// Does this member hold `permission` community-wide?
    pub fn allows(&self, permission: Permission) -> bool {
        self.permissions.allows(permission)
    }

    /// Assert a permission, or fail with a typed error.
    pub fn require(&self, permission: Permission) -> DomainResult<()> {
        if self.allows(permission) {
            Ok(())
        } else {
            Err(DomainError::PermissionDenied(permission.key()))
        }
    }

    /// Is this member an administrator (explicitly, or by owning the place)?
    pub fn is_admin(&self) -> bool {
        self.permissions.contains(PermissionSet::ADMINISTRATOR)
    }
}

/// Fold a member's role grants into a permission mask.
///
/// The owner shortcut lives here rather than at call sites so it cannot be
/// forgotten in one of them.
pub fn resolve_member_permissions(
    is_owner: bool,
    granted: impl IntoIterator<Item = Permission>,
) -> PermissionSet {
    if is_owner {
        return PermissionSet::ADMINISTRATOR;
    }
    PermissionSet::from_permissions(granted)
}

/// One room-level permission override row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoomOverride {
    /// Role the override applies to.
    pub role_id: RoleId,
    /// Permission being overridden.
    pub permission: Permission,
    /// Whether it is granted or revoked.
    pub allow: bool,
}

/// Apply a room's overrides to a member's community-wide permissions.
///
/// Only overrides for roles the member actually holds are considered; denials
/// are applied before grants, so an explicit allow on the same room wins.
/// Administrators are unaffected — a room override must not be able to lock an
/// owner out of their own community.
pub fn apply_room_overrides(
    base: PermissionSet,
    member_roles: &HashSet<RoleId>,
    overrides: &[RoomOverride],
) -> PermissionSet {
    if base.contains(PermissionSet::ADMINISTRATOR) {
        return base;
    }

    let mut allow = PermissionSet::empty();
    let mut deny = PermissionSet::empty();

    for entry in overrides
        .iter()
        .filter(|o| member_roles.contains(&o.role_id))
    {
        if entry.allow {
            allow |= entry.permission.bit();
        } else {
            deny |= entry.permission.bit();
        }
    }

    base.with_overrides(allow, deny)
}

#[cfg(test)]
mod tests {
    use super::*;
    use genzh_domain::now;

    fn community(owner_id: UserId) -> Community {
        Community {
            id: CommunityId::new(),
            name: "Night Owls".into(),
            description: None,
            icon_url: None,
            owner_id,
            created_at: now(),
            updated_at: now(),
        }
    }

    #[test]
    fn the_owner_gets_everything_without_holding_a_single_role() {
        let owner = UserId::new();
        let context = MemberContext::new(&community(owner), owner, HashSet::new(), []);

        assert!(context.is_owner);
        assert!(context.is_admin());
        for permission in Permission::ALL {
            assert!(
                context.allows(*permission),
                "owner should hold {permission}"
            );
        }
    }

    #[test]
    fn a_member_holds_the_union_of_their_roles() {
        let community = community(UserId::new());
        let member = UserId::new();
        let context = MemberContext::new(
            &community,
            member,
            HashSet::new(),
            [
                Permission::ViewRoom,
                Permission::SendMessage,
                Permission::Speak,
            ],
        );

        assert!(context.allows(Permission::Speak));
        assert!(context.allows(Permission::SendMessage));
        assert!(!context.allows(Permission::ScreenShare));
        assert!(!context.is_admin());
    }

    #[test]
    fn require_returns_the_permission_that_was_missing() {
        let context = MemberContext::new(
            &community(UserId::new()),
            UserId::new(),
            HashSet::new(),
            [Permission::ViewRoom],
        );

        assert!(context.require(Permission::ViewRoom).is_ok());
        assert_eq!(
            context.require(Permission::ManageRoom).unwrap_err(),
            DomainError::PermissionDenied("manage_room")
        );
    }

    #[test]
    fn an_explicit_administrator_role_is_as_good_as_ownership() {
        let context = MemberContext::new(
            &community(UserId::new()),
            UserId::new(),
            HashSet::new(),
            [Permission::Administrator],
        );
        assert!(!context.is_owner);
        assert!(context.is_admin());
        assert!(context.allows(Permission::ManageCommunity));
    }

    #[test]
    fn a_room_denial_removes_a_community_permission() {
        let role = RoleId::new();
        let roles = HashSet::from([role]);
        let base = PermissionSet::default_member();

        let stage = apply_room_overrides(
            base,
            &roles,
            &[RoomOverride {
                role_id: role,
                permission: Permission::Speak,
                allow: false,
            }],
        );

        assert!(!stage.allows(Permission::Speak));
        assert!(
            stage.allows(Permission::ViewRoom),
            "unrelated permissions are untouched"
        );
    }

    #[test]
    fn a_room_grant_adds_a_permission_the_member_lacks_elsewhere() {
        let role = RoleId::new();
        let roles = HashSet::from([role]);

        let presenting = apply_room_overrides(
            PermissionSet::default_member(),
            &roles,
            &[RoomOverride {
                role_id: role,
                permission: Permission::ScreenShare,
                allow: true,
            }],
        );

        assert!(presenting.allows(Permission::ScreenShare));
    }

    #[test]
    fn an_allow_on_one_role_beats_a_deny_on_another() {
        let muted_role = RoleId::new();
        let speaker_role = RoleId::new();
        let roles = HashSet::from([muted_role, speaker_role]);

        let resolved = apply_room_overrides(
            PermissionSet::default_member(),
            &roles,
            &[
                RoomOverride {
                    role_id: muted_role,
                    permission: Permission::Speak,
                    allow: false,
                },
                RoomOverride {
                    role_id: speaker_role,
                    permission: Permission::Speak,
                    allow: true,
                },
            ],
        );

        assert!(
            resolved.allows(Permission::Speak),
            "the speaker role should win"
        );
    }

    #[test]
    fn overrides_for_roles_the_member_does_not_hold_are_ignored() {
        let held = RoleId::new();
        let not_held = RoleId::new();

        let resolved = apply_room_overrides(
            PermissionSet::default_member(),
            &HashSet::from([held]),
            &[RoomOverride {
                role_id: not_held,
                permission: Permission::Speak,
                allow: false,
            }],
        );

        assert!(resolved.allows(Permission::Speak));
    }

    #[test]
    fn a_room_override_cannot_lock_out_an_administrator() {
        let role = RoleId::new();
        let resolved = apply_room_overrides(
            PermissionSet::ADMINISTRATOR,
            &HashSet::from([role]),
            &[
                RoomOverride {
                    role_id: role,
                    permission: Permission::ViewRoom,
                    allow: false,
                },
                RoomOverride {
                    role_id: role,
                    permission: Permission::Speak,
                    allow: false,
                },
            ],
        );

        assert!(resolved.allows(Permission::ViewRoom));
        assert!(resolved.allows(Permission::Speak));
    }

    #[test]
    fn no_overrides_leaves_permissions_exactly_as_they_were() {
        let base = PermissionSet::default_member();
        assert_eq!(apply_room_overrides(base, &HashSet::new(), &[]), base);
    }
}
