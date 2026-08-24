//! What travels over the chat socket, in both directions.
//!
//! Wire types only: no transport, no dispatch, no services. Everything here is
//! `serde`-shaped and the client has the matching definitions, so a change to
//! this file is a change to a published contract — which is exactly why it is
//! worth being able to read it without the socket loop wrapped around it.

use genzh_domain::message::{Message, ReactionSummary};
use genzh_domain::room::RoomAnonymousIdentity;
use genzh_domain::{MessageId, RoomId, UserId};
use genzh_infrastructure::ServiceError;
use serde::{Deserialize, Serialize};

/// Events broadcasted by the server to clients over WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatServerEvent {
    /// Initial connection authenticated.
    Authenticated {
        user_id: UserId,
    },
    /// Subscribed to a room.
    Subscribed {
        room_id: RoomId,
    },
    /// Unsubscribed from a room.
    Unsubscribed {
        room_id: RoomId,
    },
    /// A new message was posted in a room.
    MessageCreated {
        room_id: RoomId,
        message: Message,
        reactions: Vec<ReactionSummary>,
        #[serde(skip_serializing_if = "Option::is_none")]
        anonymous_author: Option<RoomAnonymousIdentity>,
    },
    /// A message was edited.
    MessageUpdated {
        room_id: RoomId,
        message: Message,
        reactions: Vec<ReactionSummary>,
        #[serde(skip_serializing_if = "Option::is_none")]
        anonymous_author: Option<RoomAnonymousIdentity>,
    },
    /// A message was deleted.
    MessageDeleted {
        room_id: RoomId,
        message_id: MessageId,
    },
    /// Reactions on a message were updated.
    ReactionsUpdated {
        room_id: RoomId,
        message_id: MessageId,
        reactions: Vec<ReactionSummary>,
    },
    /// A notification was recorded for this user.
    ///
    /// User-scoped: it carries the stored row so a connected client can render
    /// it without a round trip, and only its owner receives it.
    NotificationCreated {
        user_id: UserId,
        notification: genzh_domain::notification::Notification,
    },
    /// Somebody's online state changed.
    ///
    /// Broadcast to everyone: presence is not a secret between friends here,
    /// and scoping it to a follower graph would mean resolving that graph on
    /// every connect and disconnect.
    PresenceChanged {
        user_id: UserId,
        online: bool,
    },
    /// Somebody is calling this user in a direct conversation.
    ///
    /// User-scoped for the same reason as [`Self::DirectRoomOpened`]: the person
    /// being called is not subscribed to the conversation unless they happen to
    /// have it open, and a ring that only reached people already looking at the
    /// room would ring nobody.
    ///
    /// Carries no media credentials. Accepting is an ordinary media join, so the
    /// ring is a *notice*, and a client that fabricated one still could not join
    /// a room the API would not have admitted it to.
    CallRinging {
        user_id: UserId,
        room_id: RoomId,
        /// Who is calling.
        from_user_id: UserId,
        /// Their display name, so the callee can be shown who it is without a
        /// profile fetch on an event they have two seconds to answer.
        from_display_name: String,
        /// True when the caller started with their camera on.
        video: bool,
    },
    /// A call in a direct conversation stopped before it connected.
    ///
    /// Sent to the *other* party, whichever side ended it: the caller hanging up
    /// stops the callee's ring, and the callee declining stops the caller
    /// waiting. Once both are in the room the media server owns departures, so
    /// this says nothing about a call that is already up.
    CallEnded {
        user_id: UserId,
        room_id: RoomId,
        from_user_id: UserId,
        reason: CallEndReason,
    },
    /// A direct conversation was opened, and this user is in it.
    ///
    /// Addressed to a *user*, not a room: the recipient cannot be subscribed to
    /// a room they do not yet know exists, which is the whole reason a new DM
    /// never reached them.
    DirectRoomOpened {
        user_id: UserId,
        room_id: RoomId,
    },
    /// User typing indicator.
    Typing {
        room_id: RoomId,
        user_id: UserId,
        display_name: String,
        is_typing: bool,
    },
    /// Pong heartbeat.
    Pong,
    /// Error notification.
    Error {
        message: String,
    },
}

impl ChatServerEvent {
    /// Room this event belongs to, if it is room-scoped.
    ///
    /// Deliberately excludes [`Self::DirectRoomOpened`]: it carries a room id,
    /// but delivering it by subscription would mean nobody ever received it.
    pub fn room_id(&self) -> Option<RoomId> {
        match self {
            Self::MessageCreated { room_id, .. }
            | Self::MessageUpdated { room_id, .. }
            | Self::MessageDeleted { room_id, .. }
            | Self::ReactionsUpdated { room_id, .. }
            | Self::Typing { room_id, .. } => Some(*room_id),
            _ => None,
        }
    }

    /// The one user this event is addressed to, if it is user-scoped.
    ///
    /// Every connection reads the same broadcast channel, so an event that is
    /// neither room-scoped nor user-scoped goes to everybody. This is what
    /// keeps a user-scoped one from doing that.
    pub fn target_user(&self) -> Option<UserId> {
        match self {
            Self::DirectRoomOpened { user_id, .. }
            | Self::NotificationCreated { user_id, .. }
            | Self::CallRinging { user_id, .. }
            | Self::CallEnded { user_id, .. } => Some(*user_id),
            _ => None,
        }
    }
}

/// Why a ringing call stopped.
///
/// Three reasons rather than one flag, because the client says something
/// different for each: a missed call is worth a line in the transcript, a
/// declined one is not, and a hang-up after the ring is the caller's doing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallEndReason {
    /// The caller gave up before it was answered.
    Cancelled,
    /// The callee said no.
    Declined,
    /// The caller left the call.
    Ended,
}

/// Commands and payloads sent by clients over WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatClientCommand {
    /// Authenticate if not authenticated via query parameter.
    Auth {
        token: String,
    },
    /// Subscribe to live events for a room.
    Subscribe {
        room_id: RoomId,
    },
    /// Unsubscribe from a room.
    Unsubscribe {
        room_id: RoomId,
    },
    /// Send typing status.
    Typing {
        room_id: RoomId,
        is_typing: bool,
    },
    /// Send a message directly over WebSocket.
    SendMessage {
        room_id: RoomId,
        content: String,
        #[serde(default)]
        is_anonymous: Option<bool>,
    },
    /// Add or toggle a reaction.
    React {
        room_id: RoomId,
        message_id: MessageId,
        reaction: String,
    },
    /// Remove a reaction.
    Unreact {
        room_id: RoomId,
        message_id: MessageId,
        reaction: String,
    },
    /// Ping heartbeat.
    Ping,
}

#[derive(Debug, Deserialize)]
pub struct WsAuthQuery {
    #[serde(default)]
    pub token: Option<String>,
}

/// What to tell a client whose command was refused.
///
/// A rule violation is the sender's business and is repeated verbatim — being
/// told "you are sending messages too quickly" is the entire point of refusing.
/// A storage failure is not: it says nothing the sender can act on and would
/// describe how the inside is built, so it becomes one flat sentence and the
/// detail goes to the log.
pub(super) fn refusal(error: &ServiceError) -> String {
    match error {
        ServiceError::Domain(domain) => domain.to_string(),
        ServiceError::Repository(inner) => {
            tracing::error!(error = %inner, "repository failure on a socket command");
            "Something went wrong on our side".to_owned()
        }
    }
}
