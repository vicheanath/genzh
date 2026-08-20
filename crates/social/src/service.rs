//! The genzh-graph application service.

use genzh_domain::social::{self, Friendship, FriendshipStatus};
use genzh_domain::{DomainError, UserId};
use genzh_infrastructure::{DbPool, ServiceError, ServiceResult};

use crate::repository::SocialRepository;

/// Friend requests and blocks.
#[derive(Debug, Clone)]
pub struct SocialService {
    repository: SocialRepository,
}

impl SocialService {
    /// Build the service.
    pub fn new(pool: DbPool) -> Self {
        Self {
            repository: SocialRepository::new(pool),
        }
    }

    /// Refuse anything that would let two users reach each other across a block.
    ///
    /// Checked in *both* directions and reported with the same error either
    /// way, so a block is not observable from the outside: someone you blocked
    /// gets the response they would get if you had simply declined.
    ///
    /// This is the gate every direct-contact path goes through — friend
    /// requests, opening a conversation, posting into one. Blocking used to
    /// guard only the first of those, which meant a blocked user could still
    /// open a DM and talk to you.
    pub async fn ensure_can_reach(&self, a: UserId, b: UserId) -> ServiceResult<()> {
        if a == b {
            // You can always reach yourself; a self-DM is a legitimate notes-
            // to-self room and is not a "contact" in the sense this guards.
            return Ok(());
        }
        if self.repository.blocked_either_way(a, b).await? {
            return Err(ServiceError::denied("blocked"));
        }
        Ok(())
    }

    /// Send a friend request.
    pub async fn request_friend(
        &self,
        requester_id: UserId,
        addressee_id: UserId,
    ) -> ServiceResult<Friendship> {
        social::ensure_distinct_users(requester_id, addressee_id)?;
        self.ensure_can_reach(requester_id, addressee_id).await?;

        if let Some(existing) = self
            .repository
            .find_between(requester_id, addressee_id)
            .await?
        {
            return match existing.status {
                // Accepting an outstanding request by requesting back is the
                // behaviour users expect, and it avoids a stuck pair.
                FriendshipStatus::Pending if existing.addressee_id == requester_id => {
                    self.respond_to_request(requester_id, existing.requester_id, true)
                        .await
                }
                _ => Err(ServiceError::Domain(DomainError::Conflict("friendship"))),
            };
        }

        Ok(self.repository.request(requester_id, addressee_id).await?)
    }

    /// Accept or decline a pending request.
    pub async fn respond_to_request(
        &self,
        addressee_id: UserId,
        requester_id: UserId,
        accept: bool,
    ) -> ServiceResult<Friendship> {
        let existing = self
            .repository
            .find_between(addressee_id, requester_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("friendship"))?;

        if !existing.can_respond(addressee_id) {
            return Err(ServiceError::denied("friend_request_addressee_only"));
        }

        let status = if accept {
            FriendshipStatus::Accepted
        } else {
            FriendshipStatus::Declined
        };

        Ok(self
            .repository
            .set_status(existing.requester_id, existing.addressee_id, status)
            .await?)
    }

    /// Remove a friend, or withdraw a request.
    pub async fn remove_friend(&self, user_id: UserId, other_id: UserId) -> ServiceResult<()> {
        social::ensure_distinct_users(user_id, other_id)?;
        if !self.repository.remove(user_id, other_id).await? {
            return Err(ServiceError::not_found("friendship"));
        }
        Ok(())
    }

    /// List accepted friends.
    pub async fn friends(&self, user_id: UserId) -> ServiceResult<Vec<UserId>> {
        let rows = self
            .repository
            .list_by_status(user_id, FriendshipStatus::Accepted)
            .await?;
        Ok(rows.iter().filter_map(|f| f.counterpart(user_id)).collect())
    }

    /// Requests waiting for *this* user to answer.
    pub async fn pending_requests(&self, user_id: UserId) -> ServiceResult<Vec<Friendship>> {
        Ok(self
            .pending_both_ways(user_id)
            .await?
            .into_iter()
            .filter(|f| f.addressee_id == user_id)
            .collect())
    }

    /// Requests this user has sent and nobody has answered yet.
    ///
    /// Without these the sender has no feedback at all: the request vanishes on
    /// submit, and asking again returns a conflict for a request they cannot
    /// see.
    pub async fn sent_requests(&self, user_id: UserId) -> ServiceResult<Vec<Friendship>> {
        Ok(self
            .pending_both_ways(user_id)
            .await?
            .into_iter()
            .filter(|f| f.requester_id == user_id)
            .collect())
    }

    async fn pending_both_ways(&self, user_id: UserId) -> ServiceResult<Vec<Friendship>> {
        Ok(self
            .repository
            .list_by_status(user_id, FriendshipStatus::Pending)
            .await?)
    }

    /// Block a user, ending any friendship between them.
    pub async fn block(&self, blocker_id: UserId, blocked_id: UserId) -> ServiceResult<()> {
        social::ensure_distinct_users(blocker_id, blocked_id)?;
        self.repository.block(blocker_id, blocked_id).await?;
        // A block that leaves the friendship in place would be a half-measure.
        self.repository.remove(blocker_id, blocked_id).await?;
        Ok(())
    }

    /// Everyone this user has blocked, most recent first.
    pub async fn blocked(&self, blocker_id: UserId) -> ServiceResult<Vec<UserId>> {
        Ok(self
            .repository
            .list_blocked(blocker_id)
            .await?
            .into_iter()
            .map(|block| block.blocked_id)
            .collect())
    }

    /// Unblock a user.
    pub async fn unblock(&self, blocker_id: UserId, blocked_id: UserId) -> ServiceResult<()> {
        if !self.repository.unblock(blocker_id, blocked_id).await? {
            return Err(ServiceError::not_found("block"));
        }
        Ok(())
    }
}
