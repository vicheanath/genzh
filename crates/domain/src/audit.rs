//! The record of what staff did.
//!
//! Every entry describes something already done, which is why nothing here has
//! a setter and why the table has no `updated_at`: an audit trail its own
//! subjects can revise is decoration. The write happens on the success path of
//! the action it describes, so an entry existing means the thing happened.

use serde::{Deserialize, Serialize};

use crate::Timestamp;
use crate::ids::UserId;

/// Something worth being able to answer "who did this, and when" about.
///
/// Only actions taken *over* somebody — enforcement, staff changes, support
/// decisions. Ordinary use of the app is not audited: a log that records
/// everything is one nobody reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditAction {
    /// An account registered.
    UserRegistered,
    /// An account signed in.
    UserLogin,
    /// An account signed out.
    UserLogout,
    /// An account profile was updated.
    UserProfileUpdated,
    /// An account was suspended, and can no longer sign in.
    UserSuspended,
    /// A suspension was lifted.
    UserReinstated,
    /// Somebody's platform role was changed.
    PlatformRoleChanged,

    /// A community was created.
    CommunityCreated,
    /// A community was updated.
    CommunityUpdated,
    /// A community was deleted.
    CommunityRemoved,
    /// A user joined a community.
    CommunityMemberJoined,
    /// A user was removed from a community.
    CommunityMemberRemoved,
    /// A community role was created.
    CommunityRoleCreated,
    /// A community role was updated.
    CommunityRoleUpdated,
    /// A community role was assigned to a member.
    CommunityRoleAssigned,
    /// A community role was revoked from a member.
    CommunityRoleRevoked,
    /// A community invite was created.
    CommunityInviteCreated,
    /// A community invite was revoked.
    CommunityInviteRevoked,

    /// A room was created.
    RoomCreated,
    /// A room was updated.
    RoomUpdated,
    /// A room was closed or deleted.
    RoomRemoved,
    /// A user joined a room.
    RoomJoined,
    /// A user left a room.
    RoomLeft,

    /// A call was initiated.
    CallStarted,
    /// A call ended.
    CallEnded,

    /// A message was removed.
    MessageRemoved,
    /// A message was pinned.
    MessagePinned,
    /// A message was unpinned.
    MessageUnpinned,

    /// A support ticket was opened.
    TicketOpened,
    /// A support ticket was picked up.
    TicketAssigned,
    /// A support ticket changed status.
    TicketStatusChanged,
    /// A reply was posted on a support ticket.
    TicketReplied,

    /// A friend request was sent.
    FriendRequested,
    /// A friend request was responded to.
    FriendResponded,
    /// A friendship was removed.
    FriendRemoved,
    /// A user was blocked.
    UserBlocked,
    /// A user was unblocked.
    UserUnblocked,

    /// An account signed in via OAuth.
    UserOAuthLogin,
    /// A community invite was redeemed.
    CommunityInviteRedeemed,
    /// A room persona was updated.
    RoomPersonaChanged,
    /// A media session was joined.
    MediaSessionJoined,
    /// A media session was left.
    MediaSessionLeft,

    /// A message was created.
    MessageCreated,
    /// A message was edited.
    MessageEdited,
}

impl AuditAction {
    /// Stable key stored in the `action` column. Never change one of these:
    /// old rows keep the old value, and the point of the log is that it can be
    /// read years later.
    pub const fn key(self) -> &'static str {
        match self {
            AuditAction::UserRegistered => "user.registered",
            AuditAction::UserLogin => "user.login",
            AuditAction::UserLogout => "user.logout",
            AuditAction::UserProfileUpdated => "user.profile_updated",
            AuditAction::UserSuspended => "user.suspended",
            AuditAction::UserReinstated => "user.reinstated",
            AuditAction::PlatformRoleChanged => "user.platform_role_changed",

            AuditAction::CommunityCreated => "community.created",
            AuditAction::CommunityUpdated => "community.updated",
            AuditAction::CommunityRemoved => "community.removed",
            AuditAction::CommunityMemberJoined => "community.member_joined",
            AuditAction::CommunityMemberRemoved => "community.member_removed",
            AuditAction::CommunityRoleCreated => "community.role_created",
            AuditAction::CommunityRoleUpdated => "community.role_updated",
            AuditAction::CommunityRoleAssigned => "community.role_assigned",
            AuditAction::CommunityRoleRevoked => "community.role_revoked",
            AuditAction::CommunityInviteCreated => "community.invite_created",
            AuditAction::CommunityInviteRevoked => "community.invite_revoked",

            AuditAction::RoomCreated => "room.created",
            AuditAction::RoomUpdated => "room.updated",
            AuditAction::RoomRemoved => "room.removed",
            AuditAction::RoomJoined => "room.joined",
            AuditAction::RoomLeft => "room.left",

            AuditAction::CallStarted => "call.started",
            AuditAction::CallEnded => "call.ended",

            AuditAction::MessageRemoved => "message.removed",
            AuditAction::MessagePinned => "message.pinned",
            AuditAction::MessageUnpinned => "message.unpinned",

            AuditAction::TicketOpened => "ticket.opened",
            AuditAction::TicketAssigned => "ticket.assigned",
            AuditAction::TicketStatusChanged => "ticket.status_changed",
            AuditAction::TicketReplied => "ticket.replied",

            AuditAction::FriendRequested => "friend.requested",
            AuditAction::FriendResponded => "friend.responded",
            AuditAction::FriendRemoved => "friend.removed",
            AuditAction::UserBlocked => "user.blocked",
            AuditAction::UserUnblocked => "user.unblocked",

            AuditAction::UserOAuthLogin => "user.oauth_login",
            AuditAction::CommunityInviteRedeemed => "community.invite_redeemed",
            AuditAction::RoomPersonaChanged => "room.persona_changed",
            AuditAction::MediaSessionJoined => "media.joined",
            AuditAction::MediaSessionLeft => "media.left",

            AuditAction::MessageCreated => "message.created",
            AuditAction::MessageEdited => "message.edited",
        }
    }

    /// Every action, for the console's filter list.
    pub const ALL: &'static [AuditAction] = &[
        AuditAction::UserRegistered,
        AuditAction::UserLogin,
        AuditAction::UserLogout,
        AuditAction::UserProfileUpdated,
        AuditAction::UserSuspended,
        AuditAction::UserReinstated,
        AuditAction::PlatformRoleChanged,
        AuditAction::CommunityCreated,
        AuditAction::CommunityUpdated,
        AuditAction::CommunityRemoved,
        AuditAction::CommunityMemberJoined,
        AuditAction::CommunityMemberRemoved,
        AuditAction::CommunityRoleCreated,
        AuditAction::CommunityRoleUpdated,
        AuditAction::CommunityRoleAssigned,
        AuditAction::CommunityRoleRevoked,
        AuditAction::CommunityInviteCreated,
        AuditAction::CommunityInviteRevoked,
        AuditAction::RoomCreated,
        AuditAction::RoomUpdated,
        AuditAction::RoomRemoved,
        AuditAction::RoomJoined,
        AuditAction::RoomLeft,
        AuditAction::CallStarted,
        AuditAction::CallEnded,
        AuditAction::MessageRemoved,
        AuditAction::MessagePinned,
        AuditAction::MessageUnpinned,
        AuditAction::TicketOpened,
        AuditAction::TicketAssigned,
        AuditAction::TicketStatusChanged,
        AuditAction::TicketReplied,
        AuditAction::FriendRequested,
        AuditAction::FriendResponded,
        AuditAction::FriendRemoved,
        AuditAction::UserBlocked,
        AuditAction::UserUnblocked,
        AuditAction::UserOAuthLogin,
        AuditAction::CommunityInviteRedeemed,
        AuditAction::RoomPersonaChanged,
        AuditAction::MediaSessionJoined,
        AuditAction::MediaSessionLeft,
        AuditAction::MessageCreated,
        AuditAction::MessageEdited,
    ];
}

impl std::fmt::Display for AuditAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.key())
    }
}

/// One row of the log, as read back.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AuditEntry {
    pub id: uuid::Uuid,
    /// Null once the actor's account is deleted — the row outlives them.
    pub actor_id: Option<UserId>,
    /// Denormalised so the entry still names somebody after that deletion.
    pub actor_handle: Option<String>,
    pub action: String,
    pub subject_type: Option<String>,
    pub subject_id: Option<uuid::Uuid>,
    /// One line a human can read without decoding `metadata`.
    pub summary: String,
    pub metadata: serde_json::Value,
    pub created_at: Timestamp,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn action_keys_are_unique() {
        let keys: HashSet<_> = AuditAction::ALL.iter().map(|a| a.key()).collect();
        assert_eq!(keys.len(), AuditAction::ALL.len());
    }

    #[test]
    fn action_keys_are_namespaced() {
        // `user.suspended` reads better than `suspended` in a filter list, and
        // groups the log by what was acted on.
        for action in AuditAction::ALL {
            assert!(action.key().contains('.'), "{action:?} is not namespaced");
        }
    }
}
