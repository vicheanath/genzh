//! Notifications: the record of what somebody needs to be told.
//!
//! Deliberately a producer-agnostic store. Messaging raises mentions, the
//! social graph raises friend requests, and neither knows anything about the
//! other — they both hand a [`NewNotification`] to [`NotificationService`].
//! Delivery over the WebSocket is the API layer's job; this crate only decides
//! what is worth recording and keeps it.

mod repository;
mod service;

pub use repository::{NewNotification, NotificationPage, NotificationRepository, Recorded};
pub use service::NotificationService;
