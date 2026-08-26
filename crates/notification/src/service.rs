//! The notification application service.

use genzh_domain::{NotificationId, Timestamp, UserId};
use genzh_infrastructure::{DbPool, ServiceResult};

use crate::repository::{NewNotification, NotificationPage, NotificationRepository, Recorded};

/// Default and maximum page sizes for a notification list.
const DEFAULT_LIMIT: i64 = 30;
const MAX_LIMIT: i64 = 100;

/// Recording and reading notifications.
#[derive(Debug, Clone)]
pub struct NotificationService {
    repository: NotificationRepository,
}

impl NotificationService {
    pub fn new(pool: DbPool) -> Self {
        Self {
            repository: NotificationRepository::new(pool),
        }
    }

    /// Record one notification.
    ///
    /// Never notifies somebody about their own action — mentioning yourself in
    /// your own message is not news — and reports [`Recorded::Known`] when the
    /// event was already recorded or was suppressed.
    ///
    /// A second message from the same person in the same room folds into the
    /// row the first one opened, for as long as that row is unread. That is the
    /// whole of the "one notification per conversation" rule, and it lives in
    /// the store rather than here because it has to hold against two messages
    /// arriving at once.
    pub async fn notify(&self, new: NewNotification) -> ServiceResult<Recorded> {
        if new.actor_id == Some(new.user_id) {
            return Ok(Recorded::Known);
        }

        Ok(self.repository.record(NotificationId::new(), &new).await?)
    }

    /// Record several at once, returning the rows that were written or grew.
    ///
    /// Used by mentions, where one message can address a handful of people and
    /// each of them needs their own row.
    pub async fn notify_all(
        &self,
        batch: impl IntoIterator<Item = NewNotification>,
    ) -> ServiceResult<Vec<Recorded>> {
        let mut recorded = Vec::new();
        for new in batch {
            // One failure should not lose the rest of the batch: a message that
            // mentions five people still notifies four if one row conflicts.
            match self.notify(new).await {
                Ok(Recorded::Known) => {}
                Ok(other) => recorded.push(other),
                Err(error) => tracing::warn!(%error, "could not record notification"),
            }
        }
        Ok(recorded)
    }

    /// A page of this user's notifications, newest first.
    pub async fn list(
        &self,
        user_id: UserId,
        before: Option<Timestamp>,
        limit: Option<i64>,
    ) -> ServiceResult<NotificationPage> {
        let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
        Ok(self.repository.list(user_id, before, limit).await?)
    }

    /// The unread badge.
    pub async fn unread_count(&self, user_id: UserId) -> ServiceResult<i64> {
        Ok(self.repository.unread_count(user_id).await?)
    }

    /// Mark one read.
    pub async fn mark_read(&self, user_id: UserId, id: NotificationId) -> ServiceResult<bool> {
        Ok(self.repository.mark_read(user_id, id).await?)
    }

    /// Mark everything read.
    pub async fn mark_all_read(&self, user_id: UserId) -> ServiceResult<u64> {
        Ok(self.repository.mark_all_read(user_id).await?)
    }

    /// Prune read notifications older than `read_age` and unread notifications older than `unread_age`.
    pub async fn prune_stale(
        &self,
        read_age: std::time::Duration,
        unread_age: std::time::Duration,
    ) -> ServiceResult<u64> {
        Ok(self.repository.prune_stale(read_age, unread_age).await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use genzh_domain::notification::NotificationKind;

    #[test]
    fn default_and_max_limits_are_sane() {
        assert!(DEFAULT_LIMIT > 0);
        assert!(MAX_LIMIT >= DEFAULT_LIMIT);
        let clamped = None.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
        assert_eq!(clamped, DEFAULT_LIMIT);

        let over = Some(500).unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
        assert_eq!(over, MAX_LIMIT);

        let zero = Some(0).unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
        assert_eq!(zero, 1);
    }

    #[test]
    fn new_notification_self_actor_check() {
        let user = UserId::new();
        let self_notification = NewNotification::from_actor(user, NotificationKind::Mention, user);
        assert_eq!(self_notification.actor_id, Some(self_notification.user_id));

        let other = UserId::new();
        let other_notification = NewNotification::from_actor(user, NotificationKind::Mention, other);
        assert_ne!(other_notification.actor_id, Some(other_notification.user_id));
    }
}

