//! Community and room permissions.
//!
//! Two representations exist and they serve different purposes:
//!
//! * [`Permission`] — one variant per capability. This is what the database
//!   catalogue (`permissions` table), the API payloads and log lines speak.
//! * [`PermissionSet`] — a bitmask used for the actual checks. Folding a set of
//!   role grants into a mask makes the hot authorization path a couple of
//!   integer operations instead of a list scan.
//!
//! Permissions are **never** taken from a JWT. A token establishes identity;
//! every capability is resolved from the database at the moment it is needed
//! (see `genzh-room::authorization`). The single exception is the short-lived
//! media token, which is a *snapshot* of an already-completed authorization and
//! is scoped to one room for a few minutes.

use std::fmt;
use std::str::FromStr;

use bitflags::bitflags;
use serde::{Deserialize, Serialize};

use crate::error::DomainError;

/// A single capability a role can grant inside a community or room.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    /// See a room and its participants at all.
    ViewRoom,
    /// Post messages in a text room.
    SendMessage,
    /// Add a reaction to a message.
    AddReaction,
    /// Publish an audio track in a voice/video room.
    Speak,
    /// Publish a camera track.
    UseVideo,
    /// Publish a screen-share track.
    ScreenShare,
    /// Publish a high-bitrate "stream" (activities, game capture).
    Stream,
    /// Server-mute other members.
    MuteMembers,
    /// Move other members between rooms, or disconnect them.
    MoveMembers,
    /// Create, edit and delete rooms.
    ManageRoom,
    /// Edit community settings.
    ManageCommunity,
    /// Create, edit, delete roles and assign them.
    ManageRoles,
    /// Invite and remove members.
    ManageMembers,
    /// Bypass every check. Granted implicitly to the community owner.
    Administrator,
}

impl Permission {
    /// Every permission, in catalogue order. Migrations seed the `permissions`
    /// table from this list, and tests assert the two never drift apart.
    pub const ALL: &'static [Permission] = &[
        Permission::ViewRoom,
        Permission::SendMessage,
        Permission::AddReaction,
        Permission::Speak,
        Permission::UseVideo,
        Permission::ScreenShare,
        Permission::Stream,
        Permission::MuteMembers,
        Permission::MoveMembers,
        Permission::ManageRoom,
        Permission::ManageCommunity,
        Permission::ManageRoles,
        Permission::ManageMembers,
        Permission::Administrator,
    ];

    /// Stable string key. This is the primary key of the `permissions` table
    /// and the value used in API payloads, so it must never change.
    pub const fn key(self) -> &'static str {
        match self {
            Permission::ViewRoom => "view_room",
            Permission::SendMessage => "send_message",
            Permission::AddReaction => "add_reaction",
            Permission::Speak => "speak",
            Permission::UseVideo => "use_video",
            Permission::ScreenShare => "screen_share",
            Permission::Stream => "stream",
            Permission::MuteMembers => "mute_members",
            Permission::MoveMembers => "move_members",
            Permission::ManageRoom => "manage_room",
            Permission::ManageCommunity => "manage_community",
            Permission::ManageRoles => "manage_roles",
            Permission::ManageMembers => "manage_members",
            Permission::Administrator => "administrator",
        }
    }

    /// The single-bit mask for this permission.
    pub const fn bit(self) -> PermissionSet {
        match self {
            Permission::ViewRoom => PermissionSet::VIEW_ROOM,
            Permission::SendMessage => PermissionSet::SEND_MESSAGE,
            Permission::AddReaction => PermissionSet::ADD_REACTION,
            Permission::Speak => PermissionSet::SPEAK,
            Permission::UseVideo => PermissionSet::USE_VIDEO,
            Permission::ScreenShare => PermissionSet::SCREEN_SHARE,
            Permission::Stream => PermissionSet::STREAM,
            Permission::MuteMembers => PermissionSet::MUTE_MEMBERS,
            Permission::MoveMembers => PermissionSet::MOVE_MEMBERS,
            Permission::ManageRoom => PermissionSet::MANAGE_ROOM,
            Permission::ManageCommunity => PermissionSet::MANAGE_COMMUNITY,
            Permission::ManageRoles => PermissionSet::MANAGE_ROLES,
            Permission::ManageMembers => PermissionSet::MANAGE_MEMBERS,
            Permission::Administrator => PermissionSet::ADMINISTRATOR,
        }
    }
}

impl fmt::Display for Permission {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.key())
    }
}

impl FromStr for Permission {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Permission::ALL
            .iter()
            .copied()
            .find(|p| p.key() == s)
            .ok_or_else(|| DomainError::UnknownPermission(s.to_owned()))
    }
}

bitflags! {
    /// A folded set of [`Permission`]s.
    ///
    /// Stored in override rows as a `BIGINT`; the sign bit is left unused so a
    /// mask always round-trips through PostgreSQL's signed 64-bit integer.
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
    #[serde(transparent)]
    pub struct PermissionSet: i64 {
        /// See [`Permission::ViewRoom`].
        const VIEW_ROOM        = 1 << 0;
        /// See [`Permission::SendMessage`].
        const SEND_MESSAGE     = 1 << 1;
        /// See [`Permission::AddReaction`].
        const ADD_REACTION     = 1 << 2;
        /// See [`Permission::Speak`].
        const SPEAK            = 1 << 3;
        /// See [`Permission::UseVideo`].
        const USE_VIDEO        = 1 << 4;
        /// See [`Permission::ScreenShare`].
        const SCREEN_SHARE     = 1 << 5;
        /// See [`Permission::Stream`].
        const STREAM           = 1 << 6;
        /// See [`Permission::MuteMembers`].
        const MUTE_MEMBERS     = 1 << 7;
        /// See [`Permission::MoveMembers`].
        const MOVE_MEMBERS     = 1 << 8;
        /// See [`Permission::ManageRoom`].
        const MANAGE_ROOM      = 1 << 9;
        /// See [`Permission::ManageCommunity`].
        const MANAGE_COMMUNITY = 1 << 10;
        /// See [`Permission::ManageRoles`].
        const MANAGE_ROLES     = 1 << 11;
        /// See [`Permission::ManageMembers`].
        const MANAGE_MEMBERS   = 1 << 12;
        /// See [`Permission::Administrator`].
        const ADMINISTRATOR    = 1 << 13;
    }
}

impl PermissionSet {
    /// The default grant for a freshly created community's `@everyone` role:
    /// see rooms, chat, react and talk — but change nothing.
    pub fn default_member() -> Self {
        PermissionSet::VIEW_ROOM
            | PermissionSet::SEND_MESSAGE
            | PermissionSet::ADD_REACTION
            | PermissionSet::SPEAK
            | PermissionSet::USE_VIDEO
    }

    /// Does this set grant `permission`?
    ///
    /// [`Permission::Administrator`] short-circuits every other check, which is
    /// what makes owner/admin handling a single branch instead of a special
    /// case sprinkled through the services.
    pub fn allows(self, permission: Permission) -> bool {
        self.contains(PermissionSet::ADMINISTRATOR) || self.contains(permission.bit())
    }

    /// Expand back into the enum list — used for API responses and logs.
    pub fn to_permissions(self) -> Vec<Permission> {
        Permission::ALL
            .iter()
            .copied()
            .filter(|p| self.contains(p.bit()))
            .collect()
    }

    /// Fold an iterator of permissions into a mask.
    pub fn from_permissions<I: IntoIterator<Item = Permission>>(iter: I) -> Self {
        iter.into_iter()
            .fold(PermissionSet::empty(), |acc, p| acc | p.bit())
    }

    /// Apply a room-level override: denials are subtracted first, then grants
    /// are added. Ordering matters — an explicit allow on a room wins over an
    /// explicit deny inherited from another role on the same room.
    pub fn with_overrides(self, allow: PermissionSet, deny: PermissionSet) -> Self {
        (self & !deny) | allow
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_keys_are_unique_and_parse_back() {
        let mut keys: Vec<&str> = Permission::ALL.iter().map(|p| p.key()).collect();
        keys.sort_unstable();
        let before = keys.len();
        keys.dedup();
        assert_eq!(before, keys.len(), "duplicate permission key");

        for p in Permission::ALL {
            assert_eq!(Permission::from_str(p.key()).unwrap(), *p);
        }
    }

    #[test]
    fn permission_bits_are_unique() {
        let mut mask = PermissionSet::empty();
        for p in Permission::ALL {
            assert!(!mask.contains(p.bit()), "duplicate bit for {p}");
            mask |= p.bit();
        }
    }

    #[test]
    fn administrator_implies_everything() {
        let admin = PermissionSet::ADMINISTRATOR;
        for p in Permission::ALL {
            assert!(admin.allows(*p), "administrator should imply {p}");
        }
    }

    #[test]
    fn plain_member_cannot_manage_or_screen_share() {
        let member = PermissionSet::default_member();
        assert!(member.allows(Permission::Speak));
        assert!(member.allows(Permission::SendMessage));
        assert!(!member.allows(Permission::ScreenShare));
        assert!(!member.allows(Permission::ManageRoom));
        assert!(!member.allows(Permission::MuteMembers));
    }

    #[test]
    fn room_overrides_deny_then_allow() {
        let base = PermissionSet::default_member();

        // A stage room where nobody speaks unless explicitly granted.
        let muted = base.with_overrides(PermissionSet::empty(), PermissionSet::SPEAK);
        assert!(!muted.allows(Permission::Speak));
        assert!(muted.allows(Permission::ViewRoom));

        // Speaker role on that same room gets it back, plus screen share.
        let speaker = base.with_overrides(
            PermissionSet::SPEAK | PermissionSet::SCREEN_SHARE,
            PermissionSet::SPEAK,
        );
        assert!(speaker.allows(Permission::Speak));
        assert!(speaker.allows(Permission::ScreenShare));
    }

    #[test]
    fn unknown_permission_key_is_rejected() {
        assert!(Permission::from_str("delete_the_internet").is_err());
    }

    #[test]
    fn masks_round_trip_through_the_permission_list() {
        let set = PermissionSet::from_permissions([
            Permission::ViewRoom,
            Permission::Speak,
            Permission::ManageRoom,
        ]);
        assert_eq!(
            set.to_permissions(),
            vec![
                Permission::ViewRoom,
                Permission::Speak,
                Permission::ManageRoom
            ]
        );
    }
}
