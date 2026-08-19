//! The social graph: friendships and blocks.

use serde::{Deserialize, Serialize};

use crate::Timestamp;
use crate::error::{DomainError, DomainResult};
use crate::ids::UserId;

/// Lifecycle of a friendship row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "friendship_status", rename_all = "snake_case")]
pub enum FriendshipStatus {
    /// Requested by `requester_id`, awaiting the other side.
    Pending,
    /// Both sides agreed.
    Accepted,
    /// Declined; kept so the request cannot be spammed.
    Declined,
}

/// A friendship or friend request.
///
/// Exactly one row exists per unordered pair. `requester_id` and `addressee_id`
/// record who asked; the `(least, greatest)` unique index in the schema is what
/// actually prevents duplicate rows in either direction.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Friendship {
    /// Who sent the request.
    pub requester_id: UserId,
    /// Who received it.
    pub addressee_id: UserId,
    /// Current state.
    pub status: FriendshipStatus,
    /// Creation time (UTC).
    pub created_at: Timestamp,
    /// Last transition time (UTC).
    pub updated_at: Timestamp,
}

impl Friendship {
    /// The other party, from `viewer`'s point of view.
    pub fn counterpart(&self, viewer: UserId) -> Option<UserId> {
        if viewer == self.requester_id {
            Some(self.addressee_id)
        } else if viewer == self.addressee_id {
            Some(self.requester_id)
        } else {
            None
        }
    }

    /// Only the addressee may accept or decline, and only while pending.
    pub fn can_respond(&self, user_id: UserId) -> bool {
        self.status == FriendshipStatus::Pending && self.addressee_id == user_id
    }
}

/// A one-directional block.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Block {
    /// Who blocked.
    pub blocker_id: UserId,
    /// Who is blocked.
    pub blocked_id: UserId,
    /// Creation time (UTC).
    pub created_at: Timestamp,
}

/// Reject self-directed relationships before they reach the database.
pub fn ensure_distinct_users(a: UserId, b: UserId) -> DomainResult<()> {
    if a == b {
        return Err(DomainError::invalid("user_id", "cannot target yourself"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn friendship(requester: UserId, addressee: UserId, status: FriendshipStatus) -> Friendship {
        Friendship {
            requester_id: requester,
            addressee_id: addressee,
            status,
            created_at: crate::now(),
            updated_at: crate::now(),
        }
    }

    #[test]
    fn only_the_addressee_responds_to_a_pending_request() {
        let (a, b) = (UserId::new(), UserId::new());
        let f = friendship(a, b, FriendshipStatus::Pending);
        assert!(f.can_respond(b));
        assert!(
            !f.can_respond(a),
            "requester cannot accept their own request"
        );
        assert!(!f.can_respond(UserId::new()), "third party cannot respond");
    }

    #[test]
    fn an_accepted_friendship_cannot_be_re_accepted() {
        let (a, b) = (UserId::new(), UserId::new());
        assert!(!friendship(a, b, FriendshipStatus::Accepted).can_respond(b));
    }

    #[test]
    fn counterpart_is_symmetric_and_rejects_outsiders() {
        let (a, b) = (UserId::new(), UserId::new());
        let f = friendship(a, b, FriendshipStatus::Pending);
        assert_eq!(f.counterpart(a), Some(b));
        assert_eq!(f.counterpart(b), Some(a));
        assert_eq!(f.counterpart(UserId::new()), None);
    }

    #[test]
    fn self_relationships_are_rejected() {
        let a = UserId::new();
        assert!(ensure_distinct_users(a, a).is_err());
        assert!(ensure_distinct_users(a, UserId::new()).is_ok());
    }
}
