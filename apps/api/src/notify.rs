//! Turning things that happened into notifications.
//!
//! This is orchestration, not business logic: it reads a message, asks the
//! auth store who the handles belong to, and hands the result to the
//! notification service. It lives in the API rather than in `genzh-messaging`
//! because resolving a handle needs the auth store, and making the messaging
//! crate depend on password hashing and JWTs to send a mention would be a poor
//! trade.
//!
//! Both message paths — the REST endpoint and the WebSocket `send_message`
//! command — funnel through [`notify_for_message`], so a mention notifies
//! whichever way the message was sent.

use genzh_domain::mention::{mentioned_handles, mentions_everyone};
use genzh_domain::message::Message;
use genzh_domain::notification::{NotificationKind, preview_of};
use genzh_domain::room::Room;
use genzh_domain::UserId;
use genzh_notification::NewNotification;

use crate::routes::ws::ChatServerEvent;
use crate::state::AppState;

/// How many people an `@everyone` may notify.
///
/// A cap rather than a permission check, because the aim is to bound the write
/// amplification of one message, not to police who may use it. A room larger
/// than this gets the real-time event and no stored rows.
const EVERYONE_NOTIFICATION_CAP: usize = 50;

/// Record and deliver every notification a new message earns.
///
/// `actor` is who to name publicly, and is `None` for an anonymous message: the
/// notification still fires — being mentioned is the point — but it credits
/// nobody, so it cannot unmask the author. The author is still taken from the
/// message itself, so they are never notified about their own post either way.
///
/// Failures are logged and swallowed. A notification that cannot be written
/// must not fail the message that caused it — the message is the thing the user
/// asked for, and losing it to a bookkeeping error would be the worse outcome.
pub async fn notify_for_message(
    state: &AppState,
    room: &Room,
    message: &Message,
    actor: Option<UserId>,
) {
    let mut planned: Vec<NewNotification> = Vec::new();
    let preview = preview_of(&message.content);
    let author = message.author_id;

    let plan = |user_id: UserId, kind: NotificationKind| {
        if user_id == author {
            return None;
        }
        Some(
            NewNotification {
                user_id,
                kind,
                actor_id: actor,
                room_id: None,
                message_id: None,
                preview: None,
            }
            .about_message(room.id, message.id, preview.clone()),
        )
    };

    // ── named mentions ──────────────────────────────────────────────────────
    let handles = mentioned_handles(&message.content);
    if !handles.is_empty() {
        match state.auth.users().find_ids_by_handles(&handles).await {
            Ok(resolved) => {
                planned.extend(
                    resolved
                        .into_iter()
                        .filter_map(|(_, user_id)| plan(user_id, NotificationKind::Mention)),
                );
            }
            Err(error) => tracing::warn!(%error, "could not resolve mentioned handles"),
        }
    }

    // ── @everyone, and direct conversations ─────────────────────────────────
    let audience = if mentions_everyone(&message.content) || room.category == "dm" {
        match state.rooms.repository().list_participants(room.id).await {
            Ok(participants) => participants
                .into_iter()
                .map(|participant| participant.user_id)
                .filter(|id| *id != author)
                .collect(),
            Err(error) => {
                tracing::warn!(%error, "could not list participants to notify");
                Vec::new()
            }
        }
    } else {
        Vec::new()
    };

    if room.category == "dm" {
        // A direct message is itself the notification; nobody has to be named
        // in it to be told about it.
        planned.extend(
            audience
                .iter()
                .filter_map(|id| plan(*id, NotificationKind::DirectMessage)),
        );
    } else if mentions_everyone(&message.content) && audience.len() <= EVERYONE_NOTIFICATION_CAP {
        planned.extend(
            audience
                .iter()
                .filter_map(|id| plan(*id, NotificationKind::Everyone)),
        );
    }

    deliver(state, planned).await;
}

/// Tell someone a friend request arrived, or that theirs was accepted.
pub async fn notify_friendship(
    state: &AppState,
    recipient: UserId,
    actor: UserId,
    kind: NotificationKind,
) {
    deliver(state, vec![NewNotification::from_actor(recipient, kind, actor)]).await;
}

/// Persist a batch, then push each stored row to its owner.
///
/// Stored first: the WebSocket event is a nudge for whoever is looking right
/// now, and the row is what everyone else sees when they come back. Pushing
/// something that was not written would show a notification that vanishes on
/// reload.
async fn deliver(state: &AppState, planned: Vec<NewNotification>) {
    if planned.is_empty() {
        return;
    }

    let created = match state.notifications.notify_all(planned).await {
        Ok(created) => created,
        Err(error) => {
            tracing::warn!(%error, "could not record notifications");
            return;
        }
    };

    for notification in created {
        // Reaching nobody is not a failure: the row is already safe, and they
        // will see it on their next load.
        state
            .broadcast(ChatServerEvent::NotificationCreated {
                user_id: notification.user_id,
                notification,
            })
            .await;
    }
}
