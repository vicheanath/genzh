//! The notification application service.

use genzh_domain::notification::Notification;
use genzh_domain::{NotificationId, Timestamp, UserId};
use genzh_infrastructure::{DbPool, ServiceResult};

use crate::repository::{NewNotification, NotificationPage, NotificationRepository};

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
    /// your own message is not news — and returns `None` when the notification
    /// already existed or was suppressed.
    pub async fn notify(&self, new: NewNotification) -> ServiceResult<Option<Notification>> {
        if new.actor_id == Some(new.user_id) {
            return Ok(None);
        }

        Ok(self
            .repository
            .create(NotificationId::new(), &new)
            .await?)
    }

    /// Record several at once, returning the ones that were actually new.
    ///
    /// Used by mentions, where one message can address a handful of people and
    /// each of them needs their own row.
    pub async fn notify_all(
        &self,
        batch: impl IntoIterator<Item = NewNotification>,
    ) -> ServiceResult<Vec<Notification>> {
        let mut created = Vec::new();
        for new in batch {
            // One failure should not lose the rest of the batch: a message that
            // mentions five people still notifies four if one row conflicts.
            match self.notify(new).await {
                Ok(Some(notification)) => created.push(notification),
                Ok(None) => {}
                Err(error) => tracing::warn!(%error, "could not record notification"),
            }
        }
        Ok(created)
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
}
