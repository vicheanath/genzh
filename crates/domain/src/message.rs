//! Chat messages and reactions.

use serde::{Deserialize, Serialize};

use crate::Timestamp;
use crate::error::{DomainError, DomainResult};
use crate::ids::{MessageId, RoomId, UserId};

/// Maximum message body length, in characters.
pub const MESSAGE_MAX_LEN: usize = 4000;
/// Maximum length of a reaction key (unicode emoji or `:custom_name:`).
pub const REACTION_MAX_LEN: usize = 64;
/// Largest page a history query will return.
pub const MESSAGE_PAGE_MAX: i64 = 100;
/// Default page size for history queries.
pub const MESSAGE_PAGE_DEFAULT: i64 = 50;

/// A message posted in a room.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Message {
    /// Primary key.
    pub id: MessageId,
    /// Room the message belongs to.
    pub room_id: RoomId,
    /// Author account.
    pub author_id: UserId,
    /// Message body.
    pub content: String,
    /// The message this one answers, when it answers one.
    ///
    /// Nulled rather than cascaded when the parent is deleted: removing a
    /// message must not remove the answers to it. A reply whose parent is gone
    /// still happened, and still reads as a reply to something deleted.
    #[serde(default)]
    pub reply_to_id: Option<MessageId>,
    /// Whether this message was posted anonymously.
    #[serde(default)]
    pub is_anonymous: bool,
    /// Set when the body was edited (UTC).
    pub edited_at: Option<Timestamp>,
    /// Creation time (UTC).
    pub created_at: Timestamp,
}

/// A single user's reaction to a message.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MessageReaction {
    /// Message being reacted to.
    pub message_id: MessageId,
    /// Reacting account.
    pub user_id: UserId,
    /// Emoji or custom reaction key.
    pub reaction: String,
    /// Creation time (UTC).
    pub created_at: Timestamp,
}

/// Reaction counts, aggregated for display.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ReactionTally {
    /// Emoji or custom reaction key.
    pub reaction: String,
    /// How many users reacted with it.
    pub count: i64,
}

/// Reaction counts as one viewer sees them.
///
/// The `me` flag is what lets a client render "you reacted" without a second
/// request per message: the aggregate and the viewer's own membership in it
/// are the same question, answered once.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ReactionSummary {
    /// Emoji or custom reaction key.
    pub reaction: String,
    /// How many users reacted with it.
    pub count: i64,
    /// Whether the viewer is one of them.
    pub me: bool,
}

/// Validate and trim a message body.
pub fn validate_message_content(raw: &str) -> DomainResult<String> {
    let content = raw.trim().to_owned();
    if content.is_empty() {
        return Err(DomainError::invalid("content", "must not be empty"));
    }
    if content.chars().count() > MESSAGE_MAX_LEN {
        return Err(DomainError::invalid(
            "content",
            format!("must be at most {MESSAGE_MAX_LEN} characters"),
        ));
    }
    Ok(content)
}

/// Validate a reaction key.
pub fn validate_reaction(raw: &str) -> DomainResult<String> {
    let reaction = raw.trim().to_owned();
    if reaction.is_empty() || reaction.chars().count() > REACTION_MAX_LEN {
        return Err(DomainError::invalid(
            "reaction",
            format!("must be between 1 and {REACTION_MAX_LEN} characters"),
        ));
    }
    Ok(reaction)
}

/// Clamp a client-supplied page size into the allowed range.
pub fn clamp_page_size(requested: Option<i64>) -> i64 {
    requested
        .unwrap_or(MESSAGE_PAGE_DEFAULT)
        .clamp(1, MESSAGE_PAGE_MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_messages_are_rejected() {
        assert!(validate_message_content("   ").is_err());
        assert_eq!(validate_message_content("  hi  ").unwrap(), "hi");
    }

    #[test]
    fn oversized_messages_are_rejected() {
        assert!(validate_message_content(&"a".repeat(MESSAGE_MAX_LEN + 1)).is_err());
        assert!(validate_message_content(&"a".repeat(MESSAGE_MAX_LEN)).is_ok());
    }

    #[test]
    fn page_sizes_are_clamped_not_rejected() {
        assert_eq!(clamp_page_size(None), MESSAGE_PAGE_DEFAULT);
        assert_eq!(clamp_page_size(Some(0)), 1);
        assert_eq!(clamp_page_size(Some(-5)), 1);
        assert_eq!(clamp_page_size(Some(10_000)), MESSAGE_PAGE_MAX);
        assert_eq!(clamp_page_size(Some(25)), 25);
    }
}
