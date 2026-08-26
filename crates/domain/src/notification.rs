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

    /// May a second event of this kind fold into a row that already stands for
    /// the first?
    ///
    /// True for the conversational kinds, where "they messaged you" is still an
    /// accurate description of the row after the fifth message. False for the
    /// friendship ones: they happen once, and a second of them is a second
    /// fact rather than more of the same one.
    pub fn folds(self) -> bool {
        match self {
            NotificationKind::Mention
            | NotificationKind::Everyone
            | NotificationKind::DirectMessage => true,
            NotificationKind::FriendRequest | NotificationKind::FriendAccepted => false,
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
    ///
    /// The *latest* excerpt when several events have folded in: what somebody
    /// said a moment ago is worth more than what they said first.
    pub preview: Option<String>,
    /// How many events this row stands for.
    ///
    /// One, for something that has happened once. A second message from the
    /// same person in the same room folds into the existing row instead of
    /// opening another, and this is how many folded in — so a client can say
    /// "5 new messages" where it used to show five rows saying the same thing.
    pub count: i32,
    /// When it was marked read, if it has been.
    ///
    /// Also what ends the folding: a row that has been read is closed, and the
    /// next event in the same conversation opens a new one.
    pub read_at: Option<Timestamp>,
    /// When the first of these events happened.
    pub created_at: Timestamp,
    /// When the last of them did. Equal to `created_at` until something folds
    /// in, and what a notification list is ordered by.
    pub updated_at: Timestamp,
}

impl Notification {
    /// Does this row stand for more than one event?
    pub fn is_folded(&self) -> bool {
        self.count > 1
    }
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
    fn only_the_conversational_kinds_fold() {
        assert!(NotificationKind::Mention.folds());
        assert!(NotificationKind::Everyone.folds());
        assert!(NotificationKind::DirectMessage.folds());

        // Two friend requests are two facts, and folding them would lose one.
        assert!(!NotificationKind::FriendRequest.folds());
        assert!(!NotificationKind::FriendAccepted.folds());
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
