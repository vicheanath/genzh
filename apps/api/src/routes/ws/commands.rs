//! What each client command does.
//!
//! One function per command, so the thing a command does is readable on its
//! own. This used to be a single `match` nested six levels deep inside the
//! socket loop, where a rule as ordinary as "you must be subscribed to type in
//! a room" was a `continue` twenty lines from anything that explained it.
//!
//! Every handler here takes the same three things — the application, the
//! connection, and the way back to the client — and none of them can see the
//! loop, the heartbeat, or the event stream.

use genzh_domain::{MessageId, RoomId, UserId};

use crate::state::AppState;

use super::protocol::{ChatClientCommand, ChatServerEvent, refusal};
use super::session::{Outbound, Session};

/// Route one command to its handler.
pub(super) async fn handle(
    state: &AppState,
    session: &mut Session,
    out: &mut Outbound,
    command: ChatClientCommand,
) {
    match command {
        ChatClientCommand::Ping => {
            // The heartbeat is also the proof that a client which said it was
            // reading a room is still running. See `Session::touch`.
            session.touch(state).await;
            out.tell(ChatServerEvent::Pong).await
        }
        ChatClientCommand::Auth { token } => authenticate(state, session, out, &token).await,
        ChatClientCommand::Subscribe { room_id } => subscribe(state, session, out, room_id).await,
        ChatClientCommand::Unsubscribe { room_id } => {
            session.unsubscribe(room_id);
            // Leaving a room is not something a client has to say twice: a room
            // it no longer hears about is one it cannot be reading.
            session.attend(state, None).await;
            out.tell(ChatServerEvent::Unsubscribed { room_id }).await;
        }
        ChatClientCommand::Focus { room_id } => session.attend(state, room_id).await,
        ChatClientCommand::Typing { room_id, is_typing } => {
            typing(state, session, room_id, is_typing).await
        }
        ChatClientCommand::SendMessage {
            room_id,
            content,
            is_anonymous,
        } => send_message(state, session, out, room_id, &content, is_anonymous).await,
        ChatClientCommand::React {
            room_id,
            message_id,
            reaction,
        } => react(state, session, out, room_id, message_id, &reaction).await,
        ChatClientCommand::Unreact {
            room_id,
            message_id,
            reaction,
        } => unreact(state, session, room_id, message_id, &reaction).await,
    }
}

async fn authenticate(state: &AppState, session: &mut Session, out: &mut Outbound, token: &str) {
    if session.authenticate(state, token).await {
        let Some(user) = session.user() else { return };
        out.tell(ChatServerEvent::Authenticated {
            user_id: user.user_id,
        })
        .await;
    } else {
        out.refuse("invalid or expired token").await;
    }
}

/// Subscribing is the one command that says so when you are not signed in.
///
/// The rest are fire-and-forget from the client's point of view, but a
/// subscription that silently did not happen looks exactly like a room where
/// nobody is talking.
async fn subscribe(state: &AppState, session: &mut Session, out: &mut Outbound, room_id: RoomId) {
    let Some(user) = session.user() else {
        out.refuse("authentication required").await;
        return;
    };

    // A room the caller cannot see is not refused out loud: saying "no" would
    // confirm the room exists to somebody who was not shown it.
    if state
        .rooms
        .visible_access(room_id, user.user_id)
        .await
        .is_ok()
    {
        session.subscribe(state, room_id).await;
        out.tell(ChatServerEvent::Subscribed { room_id }).await;
    }
}

async fn typing(state: &AppState, session: &mut Session, room_id: RoomId, is_typing: bool) {
    let Some(user) = session.user() else { return };
    if !session.is_subscribed(room_id) {
        return;
    }

    // Typing in a room is a stronger claim to be reading it than any `focus`
    // frame, and it arrives from clients too old to send one. Recorded before
    // the throttle below, which is about what the *room* is told and not about
    // what this connection is doing.
    session.attend(state, Some(room_id)).await;

    if !session.may_announce_typing(room_id, is_typing) {
        return;
    }

    state
        .broadcast(ChatServerEvent::Typing {
            room_id,
            user_id: user.user_id,
            display_name: speaker_name(state, room_id, user.user_id).await,
            is_typing,
        })
        .await;
}

async fn send_message(
    state: &AppState,
    session: &mut Session,
    out: &mut Outbound,
    room_id: RoomId,
    content: &str,
    is_anonymous: Option<bool>,
) {
    let Some(user) = session.user() else { return };
    if !session.is_subscribed(room_id) {
        return;
    }

    // Posting into a room is being in it. See `typing`.
    session.attend(state, Some(room_id)).await;

    // An explicit choice in the command wins; otherwise the persona this user
    // last set in this room does.
    let is_anon = match is_anonymous {
        Some(chosen) => chosen,
        None => state
            .rooms
            .participant(room_id, user.user_id)
            .await
            .ok()
            .flatten()
            .map(|participant| participant.is_anonymous)
            .unwrap_or(false),
    };

    // The socket path posts plain messages. Replying goes through REST, where
    // a parent that is missing or in another room can be refused and reported
    // — a socket send has no reply channel to refuse into.
    let posted = state
        .messaging
        .post(room_id, user.user_id, content, is_anon, None)
        .await;

    // Dropping a refusal here would leave the sender watching for a message
    // that is never coming — and a throttled client with no feedback retries,
    // which is the opposite of what the guard is asking of it.
    let message = match posted {
        Ok(message) => message,
        Err(error) => {
            out.refuse(refusal(&error)).await;
            return;
        }
    };

    let anonymous_author = if is_anon {
        state
            .rooms
            .ensure_anonymous_identity(room_id, user.user_id)
            .await
            .ok()
    } else {
        None
    };

    state
        .broadcast(ChatServerEvent::MessageCreated {
            room_id,
            message: message.clone(),
            reactions: vec![],
            anonymous_author,
        })
        .await;

    // The same notification path as the REST endpoint, so a mention lands
    // whichever way the message was sent.
    if let Ok(room) = state.rooms.get(room_id, user.user_id).await {
        let actor = (!is_anon).then_some(user.user_id);
        crate::notify::notify_for_message(state, &room, &message, actor).await;
    }
}

async fn react(
    state: &AppState,
    session: &mut Session,
    out: &mut Outbound,
    room_id: RoomId,
    message_id: MessageId,
    reaction: &str,
) {
    let Some(user) = session.user() else { return };

    if let Err(error) = state.messaging.react(message_id, user.user_id, reaction).await {
        out.refuse(refusal(&error)).await;
        return;
    }

    broadcast_reactions(state, room_id, message_id, user.user_id).await;
}

/// Removing a reaction says nothing when it fails.
///
/// The only ways it can are "that reaction was not there" and a storage
/// failure, and in both the client's own view is already correct.
async fn unreact(
    state: &AppState,
    session: &mut Session,
    room_id: RoomId,
    message_id: MessageId,
    reaction: &str,
) {
    let Some(user) = session.user() else { return };

    if state
        .messaging
        .unreact(message_id, user.user_id, reaction)
        .await
        .is_ok()
    {
        broadcast_reactions(state, room_id, message_id, user.user_id).await;
    }
}

/// Publish a message's whole new tally, so no client has to reconstruct it.
async fn broadcast_reactions(
    state: &AppState,
    room_id: RoomId,
    message_id: MessageId,
    reader: UserId,
) {
    let Ok(mut tallies) = state
        .messaging
        .reactions_for(room_id, reader, &[message_id])
        .await
    else {
        return;
    };

    state
        .broadcast(ChatServerEvent::ReactionsUpdated {
            room_id,
            message_id,
            reactions: tallies.remove(&message_id).unwrap_or_default(),
        })
        .await;
}

/// What to call somebody in a room — their name, or the mask they are wearing.
///
/// Anonymity is a property of the participant, not of the message, so a typing
/// indicator has to resolve it the same way the transcript does. "Someone"
/// covers the case where the participant row cannot be read at all: the
/// indicator is worth showing without a name, and it disappears in two seconds
/// either way.
async fn speaker_name(state: &AppState, room_id: RoomId, user_id: UserId) -> String {
    let participant = state.rooms.participant(room_id, user_id).await.ok().flatten();

    let name = match participant {
        Some(participant) if participant.is_anonymous => state
            .rooms
            .get_anonymous_identity(room_id, user_id)
            .await
            .ok()
            .flatten()
            .map(|identity| identity.alias_name),
        Some(_) => state
            .auth
            .profile(user_id)
            .await
            .ok()
            .flatten()
            .map(|profile| profile.display_name),
        None => None,
    };

    name.unwrap_or_else(|| "Someone".to_owned())
}
