//! Room-level authorization.

use genzh_community::MemberContext;
use genzh_domain::{DomainError, DomainResult, Permission, PermissionSet, Room};

/// A caller's resolved standing in one room.
#[derive(Debug, Clone)]
pub struct RoomAccess {
    /// The room.
    pub room: Room,
    /// The caller's community-level context, if room belongs to a community.
    pub member: Option<MemberContext>,
    /// Effective permissions in this room.
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
    pub fn require_visible(&self) -> DomainResult<()> {
        self.require(Permission::ViewRoom)
    }
}
