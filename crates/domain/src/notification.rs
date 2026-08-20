//! What a person is told about while they were not looking.
//!
//! Notifications are stored rather than only pushed. A purely real-time signal
//! is lost for anyone who was offline when it fired — which is precisely the
//! audience a notification exists for.

use serde::{Deserialize, Serialize};

use crate::{MessageId, NotificationId, RoomId, Timestamp, UserId};

/// Why someone is being notified.
///
/// Each variant is a distinct *reason*, not a distinct rendering: the client
/// decides the wording. Adding a kind here is a schema change, so the set is
/// kept small and each one earns its place by being separately actionable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum NotificationKind {
    /// Named with `@handle` in a message.
    Mention,
    /// Addressed by an `@everyone` in a room they can see.
    Everyone,
    /// A message in a direct conversation.
    DirectMessage,
    /// Someone asked to be friends.
    FriendRequest,
    /// Someone accepted a request this user sent.
    FriendAccepted,
}

impl NotificationKind {
    /// The stable string used in the database and on the wire.
    pub fn key(self) -> &'static str {
        match self {
            NotificationKind::Mention => "mention",
            NotificationKind::Everyone => "everyone",
            NotificationKind::DirectMessage => "direct_message",
            NotificationKind::FriendRequest => "friend_request",
            NotificationKind::FriendAccepted => "friend_accepted",
        }
    }
}

impl std::str::FromStr for NotificationKind {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "mention" => Ok(NotificationKind::Mention),
            "everyone" => Ok(NotificationKind::Everyone),
            "direct_message" => Ok(NotificationKind::DirectMessage),
            "friend_request" => Ok(NotificationKind::FriendRequest),
            "friend_accepted" => Ok(NotificationKind::FriendAccepted),
            _ => Err(()),
        }
    }
}

/// One thing that happened, addressed to one person.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
pub struct Notification {
    pub id: NotificationId,
    /// Who is being told.
    pub user_id: UserId,
    pub kind: NotificationKind,
    /// Who caused it. Absent for anything the system raised on its own.
    pub actor_id: Option<UserId>,
    /// Where it happened, when that is somewhere you can navigate to.
    pub room_id: Option<RoomId>,
    pub message_id: Option<MessageId>,
    /// A short excerpt, so a notification list needs no second query per row.
    pub preview: Option<String>,
    /// When it was marked read, if it has been.
    pub read_at: Option<Timestamp>,
    pub created_at: Timestamp,
}

/// How much of a message body travels with a notification.
///
/// Long enough to recognise the message, short enough that the notification
/// table is not a second copy of the transcript.
pub const PREVIEW_MAX_CHARS: usize = 140;

/// Trim a message body down to a preview.
pub fn preview_of(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.chars().count() <= PREVIEW_MAX_CHARS {
        return trimmed.to_string();
    }
    let cut: String = trimmed.chars().take(PREVIEW_MAX_CHARS).collect();
    format!("{}…", cut.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_round_trip_through_their_key() {
        for kind in [
            NotificationKind::Mention,
            NotificationKind::Everyone,
            NotificationKind::DirectMessage,
            NotificationKind::FriendRequest,
            NotificationKind::FriendAccepted,
        ] {
            assert_eq!(kind.key().parse::<NotificationKind>(), Ok(kind));
        }
    }

    #[test]
    fn a_short_message_is_its_own_preview() {
        assert_eq!(preview_of("  hello  "), "hello");
    }

    #[test]
    fn a_long_message_is_cut_and_marked() {
        let long = "a".repeat(PREVIEW_MAX_CHARS + 50);
        let preview = preview_of(&long);
        assert!(preview.ends_with('…'));
        assert_eq!(preview.chars().count(), PREVIEW_MAX_CHARS + 1);
    }
}
