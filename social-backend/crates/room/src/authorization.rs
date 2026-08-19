//! Room-level authorization.
//!
//! A room's effective permissions are the member's community-wide permissions
//! with that room's overrides applied. [`RoomAccess`] is the resolved answer,
//! and is what every room, message and media operation is checked against.

use social_domain::{DomainError, DomainResult, Permission, PermissionSet, Room};
use social_community::MemberContext;

/// A caller's resolved standing in one room.
#[derive(Debug, Clone)]
pub struct RoomAccess {
    /// The room.
    pub room: Room,
    /// The caller's community-level context.
    pub member: MemberContext,
    /// Effective permissions in this room, overrides applied.
    pub permissions: PermissionSet,
}

impl RoomAccess {
    /// Does the caller hold `permission` here?
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

    /// Assert the caller can see the room at all.
    ///
    /// Every other check is downstream of this one, so it is separated out to
    /// make the ordering obvious at call sites.
    pub fn require_visible(&self) -> DomainResult<()> {
        self.require(Permission::ViewRoom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use social_domain::community::Community;
    use social_domain::room::RoomType;
    use social_domain::{CommunityId, RoomId, UserId, now};
    use std::collections::HashSet;

    fn access(permissions: PermissionSet, room_type: RoomType) -> RoomAccess {
        let owner = UserId::new();
        let community = Community {
            id: CommunityId::new(),
            name: "Night Owls".into(),
            description: None,
            icon_url: None,
            owner_id: owner,
            created_at: now(),
            updated_at: now(),
        };
        let member = MemberContext::new(&community, UserId::new(), HashSet::new(), []);

        RoomAccess {
            room: Room {
                id: RoomId::new(),
                community_id: community.id,
                name: "lounge".into(),
                topic: None,
                room_type,
                position: 0,
                max_participants: None,
                created_at: now(),
                updated_at: now(),
            },
            member,
            permissions,
        }
    }

    #[test]
    fn a_plain_member_can_see_and_speak_but_not_manage() {
        let a = access(PermissionSet::default_member(), RoomType::Voice);
        assert!(a.require_visible().is_ok());
        assert!(a.require(Permission::Speak).is_ok());
        assert_eq!(
            a.require(Permission::ManageRoom).unwrap_err(),
            DomainError::PermissionDenied("manage_room")
        );
    }

    #[test]
    fn a_member_denied_view_room_cannot_see_it() {
        let a = access(PermissionSet::empty(), RoomType::Voice);
        assert_eq!(
            a.require_visible().unwrap_err(),
            DomainError::PermissionDenied("view_room")
        );
    }

    #[test]
    fn an_administrator_holds_everything_in_every_room() {
        let a = access(PermissionSet::ADMINISTRATOR, RoomType::Activity);
        for permission in Permission::ALL {
            assert!(a.allows(*permission));
        }
    }
}
