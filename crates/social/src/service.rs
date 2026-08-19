//! The social-graph application service.

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

    /// Send a friend request.
    ///
    /// A request from someone you have blocked — or who has blocked you — is
    /// refused with the same error as any other rejection, so a block is not
    /// observable from the outside.
    pub async fn request_friend(
        &self,
        requester_id: UserId,
        addressee_id: UserId,
    ) -> ServiceResult<Friendship> {
        social::ensure_distinct_users(requester_id, addressee_id)?;

        if self
            .repository
            .blocked_either_way(requester_id, addressee_id)
            .await?
        {
            return Err(ServiceError::denied("blocked"));
        }

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

    /// List incoming pending requests.
    pub async fn pending_requests(&self, user_id: UserId) -> ServiceResult<Vec<Friendship>> {
        let rows = self
            .repository
            .list_by_status(user_id, FriendshipStatus::Pending)
            .await?;
        Ok(rows
            .into_iter()
            .filter(|f| f.addressee_id == user_id)
            .collect())
    }

    /// Block a user, ending any friendship between them.
    pub async fn block(&self, blocker_id: UserId, blocked_id: UserId) -> ServiceResult<()> {
        social::ensure_distinct_users(blocker_id, blocked_id)?;
        self.repository.block(blocker_id, blocked_id).await?;
        // A block that leaves the friendship in place would be a half-measure.
        self.repository.remove(blocker_id, blocked_id).await?;
        Ok(())
    }

    /// Unblock a user.
    pub async fn unblock(&self, blocker_id: UserId, blocked_id: UserId) -> ServiceResult<()> {
        if !self.repository.unblock(blocker_id, blocked_id).await? {
            return Err(ServiceError::not_found("block"));
        }
        Ok(())
    }
}
