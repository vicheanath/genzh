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
//!
//! # What is *not* recorded
//!
//! A notification exists to tell somebody something they would otherwise miss.
//! Three rules follow from that, and they are all applied here rather than in
//! the notification store, because each one needs to know something about the
//! room that the store deliberately does not:
//!
//! 1. **Nobody is told about a room they are reading.** They are watching the
//!    message arrive; a badge for it is noise, and clearing it is a chore this
//!    application invented for them.
//! 2. **A muted room is silent, unless you were named.** Muting is a request to
//!    stop being interrupted, and `@handle` is somebody deliberately asking for
//!    you — which is the one thing worth overriding it for.
//! 3. **One message earns one notification per person.** Being named in a
//!    direct conversation used to write two rows, one for the mention and one
//!    for the message. The stronger reason wins and the other is dropped.
//!
//! What survives all three is then folded into whatever open row the recipient
//! already has for that conversation, which is [`genzh_notification`]'s job
//! rather than this file's.

use std::collections::HashMap;

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
    let author = message.author_id;

    // ── who has a reason to be told ─────────────────────────────────────────
    //
    // Collected as one reason per person rather than one per rule, so that
    // being named in a direct conversation is a mention and not a mention *and*
    // a message.
    let mut intended: HashMap<UserId, NotificationKind> = HashMap::new();
    let mut consider = |user_id: UserId, kind: NotificationKind| {
        if user_id == author {
            return;
        }
        intended
            .entry(user_id)
            .and_modify(|held| {
                if outranks(kind, *held) {
                    *held = kind;
                }
            })
            .or_insert(kind);
    };

    let handles = mentioned_handles(&message.content);
    if !handles.is_empty() {
        match state.auth.ids_by_handles(&handles).await {
            Ok(resolved) => {
                for (_, user_id) in resolved {
                    consider(user_id, NotificationKind::Mention);
                }
            }
            Err(error) => tracing::warn!(%error, "could not resolve mentioned handles"),
        }
    }

    let everyone = mentions_everyone(&message.content);
    if everyone || room.is_direct() {
        let audience = match state.rooms.list_participants(room.id).await {
            Ok(participants) => participants
                .into_iter()
                .map(|participant| participant.user_id)
                .filter(|id| *id != author)
                .collect::<Vec<_>>(),
            Err(error) => {
                tracing::warn!(%error, "could not list participants to notify");
                Vec::new()
            }
        };

        if room.is_direct() {
            // A direct message is itself the notification; nobody has to be
            // named in it to be told about it.
            for user_id in &audience {
                consider(*user_id, NotificationKind::DirectMessage);
            }
        } else if everyone && audience.len() <= EVERYONE_NOTIFICATION_CAP {
            for user_id in &audience {
                consider(*user_id, NotificationKind::Everyone);
            }
        }
    }

    if intended.is_empty() {
        return;
    }

    // ── who is worth telling ────────────────────────────────────────────────
    //
    // Both lookups are batched over the whole audience, because an `@everyone`
    // in a busy room hands this fifty recipients and asking about each of them
    // in turn would be fifty round trips per message.
    //
    // Both fail *open*: not knowing whether somebody is reading the room, or
    // whether they muted it, is a reason to notify them rather than to swallow
    // it. The worst case is the noise this file exists to reduce; the other way
    // round, a store being briefly unreachable would silently lose messages.
    let candidates: Vec<UserId> = intended.keys().copied().collect();

    let reading = match state.attention.watching(room.id, &candidates).await {
        Ok(reading) => reading,
        Err(error) => {
            tracing::warn!(%error, "could not tell who is reading the room");
            Vec::new()
        }
    };

    let muted = match state.read_state.muted_among(room.id, &candidates).await {
        Ok(muted) => muted,
        Err(error) => {
            tracing::warn!(%error, "could not tell who muted the room");
            Vec::new()
        }
    };

    let preview = preview_of(&message.content);
    let planned: Vec<NewNotification> = intended
        .into_iter()
        .filter(|(user_id, kind)| {
            // Watching it happen is better than being told about it.
            if reading.contains(user_id) {
                return false;
            }
            // Muting silences the room; being named is somebody asking for you
            // by name, which is the one thing that gets through.
            *kind == NotificationKind::Mention || !muted.contains(user_id)
        })
        .map(|(user_id, kind)| {
            NewNotification {
                user_id,
                kind,
                actor_id: actor,
                room_id: None,
                message_id: None,
                preview: None,
            }
            .about_message(room.id, message.id, preview.clone())
        })
        .collect();

    deliver(state, planned).await;
}

/// Does `candidate` describe why somebody is being told better than `held`?
///
/// Only ever asked about one person and one message, where several rules can
/// fire at once. Being named beats an `@everyone`, which beats the conversation
/// simply having a new message in it: the more specific the reason, the more it
/// is worth saying. The friendship kinds never reach this — nothing about a
/// message produces one — and rank below everything if they ever do.
fn outranks(candidate: NotificationKind, held: NotificationKind) -> bool {
    fn rank(kind: NotificationKind) -> u8 {
        match kind {
            NotificationKind::Mention => 3,
            NotificationKind::Everyone => 2,
            NotificationKind::DirectMessage => 1,
            NotificationKind::FriendRequest | NotificationKind::FriendAccepted => 0,
        }
    }

    rank(candidate) > rank(held)
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

    let recorded = match state.notifications.notify_all(planned).await {
        Ok(recorded) => recorded,
        Err(error) => {
            tracing::warn!(%error, "could not record notifications");
            return;
        }
    };

    for outcome in recorded {
        let is_new = outcome.is_new();
        let Some(notification) = outcome.notification() else {
            continue;
        };

        // Reaching nobody is not a failure: the row is already safe, and they
        // will see it on their next load.
        state
            .broadcast(ChatServerEvent::NotificationCreated {
                user_id: notification.user_id,
                notification,
                is_new,
            })
            .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn being_named_beats_being_in_the_room() {
        assert!(outranks(
            NotificationKind::Mention,
            NotificationKind::DirectMessage
        ));
        assert!(outranks(NotificationKind::Mention, NotificationKind::Everyone));
        assert!(outranks(
            NotificationKind::Everyone,
            NotificationKind::DirectMessage
        ));
    }

    #[test]
    fn a_weaker_reason_never_displaces_a_stronger_one() {
        assert!(!outranks(
            NotificationKind::DirectMessage,
            NotificationKind::Mention
        ));
        assert!(!outranks(
            NotificationKind::Everyone,
            NotificationKind::Mention
        ));
    }

    #[test]
    fn the_same_reason_twice_changes_nothing() {
        // The map keeps what it holds, so a second mention of the same person
        // in one message does not rewrite the entry.
        assert!(!outranks(
            NotificationKind::Mention,
            NotificationKind::Mention
        ));
    }
}
