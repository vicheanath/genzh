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
    /// An account was suspended, and can no longer sign in.
    UserSuspended,
    /// A suspension was lifted.
    UserReinstated,
    /// Somebody's platform role was changed.
    PlatformRoleChanged,
    /// A message was removed by staff rather than by its author.
    MessageRemoved,
    /// A room was closed by staff.
    RoomRemoved,
    /// A community was deleted by staff.
    CommunityRemoved,
    /// A support ticket was picked up.
    TicketAssigned,
    /// A support ticket changed status.
    TicketStatusChanged,
}

impl AuditAction {
    /// Stable key stored in the `action` column. Never change one of these:
    /// old rows keep the old value, and the point of the log is that it can be
    /// read years later.
    pub const fn key(self) -> &'static str {
        match self {
            AuditAction::UserSuspended => "user.suspended",
            AuditAction::UserReinstated => "user.reinstated",
            AuditAction::PlatformRoleChanged => "user.platform_role_changed",
            AuditAction::MessageRemoved => "message.removed",
            AuditAction::RoomRemoved => "room.removed",
            AuditAction::CommunityRemoved => "community.removed",
            AuditAction::TicketAssigned => "ticket.assigned",
            AuditAction::TicketStatusChanged => "ticket.status_changed",
        }
    }

    /// Every action, for the console's filter list.
    pub const ALL: &'static [AuditAction] = &[
        AuditAction::UserSuspended,
        AuditAction::UserReinstated,
        AuditAction::PlatformRoleChanged,
        AuditAction::MessageRemoved,
        AuditAction::RoomRemoved,
        AuditAction::CommunityRemoved,
        AuditAction::TicketAssigned,
        AuditAction::TicketStatusChanged,
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
