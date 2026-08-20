//! Real-time Chat WebSocket gateway.
//!
//! Provides sub-millisecond instant message delivery, live reactions, typing
//! indicators, and presence updates for connected clients.

use std::collections::HashSet;
use std::time::Duration;

use axum::extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use futures::{SinkExt, StreamExt};
use genzh_domain::message::{Message, ReactionSummary};
use genzh_domain::room::RoomAnonymousIdentity;
use genzh_domain::{MessageId, RoomId, UserId};
use serde::{Deserialize, Serialize};
use tokio::time::interval;

use crate::middleware::CurrentUser;
use crate::state::AppState;

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
            | Self::NotificationCreated { user_id, .. } => Some(*user_id),
            _ => None,
        }
    }
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

/// `GET /api/v1/ws`
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<WsAuthQuery>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, query.token))
}

async fn handle_socket(socket: WebSocket, state: AppState, initial_token: Option<String>) {
    let (mut sender, mut receiver) = socket.split();

    // Authenticate caller
    let mut current_user: Option<CurrentUser> = None;
    if let Some(token) = initial_token {
        if let Ok(user) = state.auth.jwt().authenticate(&token) {
            current_user = Some(CurrentUser {
                user_id: user.user_id,
                session_id: user.session_id,
            });
        }
    }

    let mut subscribed_rooms = HashSet::<RoomId>::new();
    // Subscribing before the presence announcement below, so this connection
    // hears about its own arrival like everyone else.
    let mut events = state.events.subscribe();

    // Tracks whoever this connection is counted against, so the disconnect can
    // undo exactly what the connect did even if the token is swapped later.
    let mut counted_as: Option<UserId> = None;

    if let Some(ref user) = current_user {
        let auth_event = ChatServerEvent::Authenticated {
            user_id: user.user_id,
        };
        if let Ok(json) = serde_json::to_string(&auth_event) {
            let _ = sender.send(WsMessage::Text(json.into())).await;
        }
        counted_as = Some(user.user_id);
        announce_presence(&state, user.user_id, Connection::Opened).await;
    }

    let mut ping_interval = interval(Duration::from_secs(30));

    loop {
        tokio::select! {
            // Heartbeat tick
            _ = ping_interval.tick() => {
                if sender.send(WsMessage::Ping(vec![].into())).await.is_err() {
                    break;
                }
            }

            // Inbound messages from this client
            msg = receiver.next() => {
                let Some(msg) = msg else { break; };
                let msg = match msg {
                    Ok(m) => m,
                    Err(_) => break,
                };

                match msg {
                    WsMessage::Text(text) => {
                        let Ok(cmd) = serde_json::from_str::<ChatClientCommand>(&text) else {
                            continue;
                        };

                        match cmd {
                            ChatClientCommand::Ping => {
                                let _ = sender.send(WsMessage::Text(
                                    serde_json::to_string(&ChatServerEvent::Pong).unwrap_or_default().into()
                                )).await;
                            }
                            ChatClientCommand::Auth { token } => {
                                if let Ok(user) = state.auth.jwt().authenticate(&token) {
                                    let uid = user.user_id;
                                    current_user = Some(CurrentUser {
                                        user_id: user.user_id,
                                        session_id: user.session_id,
                                    });

                                    // Authenticating over an already-open socket
                                    // is the normal path — the client connects
                                    // first and sends the token after — so this
                                    // has to count the connection, and move it
                                    // if the identity changed.
                                    if counted_as != Some(uid) {
                                        if let Some(previous) = counted_as {
                                            announce_presence(
                                                &state,
                                                previous,
                                                Connection::Closed,
                                            )
                                            .await;
                                        }
                                        counted_as = Some(uid);
                                        announce_presence(&state, uid, Connection::Opened).await;
                                    }
                                    let _ = sender.send(WsMessage::Text(
                                        serde_json::to_string(&ChatServerEvent::Authenticated {
                                            user_id: uid,
                                        }).unwrap_or_default().into()
                                    )).await;
                                } else {
                                    let _ = sender.send(WsMessage::Text(
                                        serde_json::to_string(&ChatServerEvent::Error {
                                            message: "invalid or expired token".into(),
                                        }).unwrap_or_default().into()
                                    )).await;
                                }
                            }
                            ChatClientCommand::Subscribe { room_id } => {
                                let Some(ref user) = current_user else {
                                    let _ = sender.send(WsMessage::Text(
                                        serde_json::to_string(&ChatServerEvent::Error {
                                            message: "authentication required".into(),
                                        }).unwrap_or_default().into()
                                    )).await;
                                    continue;
                                };

                                if state.rooms.visible_access(room_id, user.user_id).await.is_ok() {
                                    subscribed_rooms.insert(room_id);
                                    let _ = sender.send(WsMessage::Text(
                                        serde_json::to_string(&ChatServerEvent::Subscribed { room_id })
                                            .unwrap_or_default().into()
                                    )).await;
                                }
                            }
                            ChatClientCommand::Unsubscribe { room_id } => {
                                subscribed_rooms.remove(&room_id);
                                let _ = sender.send(WsMessage::Text(
                                    serde_json::to_string(&ChatServerEvent::Unsubscribed { room_id })
                                        .unwrap_or_default().into()
                                )).await;
                            }
                            ChatClientCommand::Typing { room_id, is_typing } => {
                                let Some(ref user) = current_user else { continue; };
                                if !subscribed_rooms.contains(&room_id) { continue; }

                                // Resolve display name or anonymous alias
                                let mut name = "Someone".to_string();
                                if let Ok(Some(participant)) = state.rooms.repository().find_participant(room_id, user.user_id).await {
                                    if participant.is_anonymous {
                                        if let Ok(Some(ident)) = state.rooms.repository().find_anonymous_identity(room_id, user.user_id).await {
                                            name = ident.alias_name;
                                        }
                                    } else if let Ok(Some(prof)) = state.auth.users().find_profile(user.user_id).await {
                                        name = prof.display_name;
                                    }
                                }

                                state.broadcast(ChatServerEvent::Typing {
                                    room_id,
                                    user_id: user.user_id,
                                    display_name: name,
                                    is_typing,
                                }).await;
                            }
                            ChatClientCommand::SendMessage { room_id, content, is_anonymous } => {
                                let Some(ref user) = current_user else { continue; };
                                if !subscribed_rooms.contains(&room_id) { continue; }

                                let is_anon = match is_anonymous {
                                    Some(val) => val,
                                    None => state
                                        .rooms
                                        .repository()
                                        .find_participant(room_id, user.user_id)
                                        .await
                                        .ok()
                                        .flatten()
                                        .map(|p| p.is_anonymous)
                                        .unwrap_or(false),
                                };

                                if let Ok(message) = state.messaging.post(room_id, user.user_id, &content, is_anon).await {
                                    let anonymous_author = if is_anon {
                                        state.rooms.repository().get_or_create_anonymous_identity(room_id, user.user_id).await.ok()
                                    } else {
                                        None
                                    };

                                    state.broadcast(ChatServerEvent::MessageCreated {
                                        room_id,
                                        message: message.clone(),
                                        reactions: vec![],
                                        anonymous_author,
                                    }).await;

                                    // The same notification path as the REST
                                    // endpoint, so a mention lands whichever way
                                    // the message was sent.
                                    if let Ok(room) = state.rooms.get(room_id, user.user_id).await {
                                        let actor = (!is_anon).then_some(user.user_id);
                                        crate::notify::notify_for_message(
                                            &state, &room, &message, actor,
                                        )
                                        .await;
                                    }
                                }
                            }
                            ChatClientCommand::React { room_id, message_id, reaction } => {
                                let Some(ref user) = current_user else { continue; };
                                if let Ok(_) = state.messaging.react(message_id, user.user_id, &reaction).await {
                                    if let Ok(reactions) = state.messaging.reactions_for(room_id, user.user_id, &[message_id]).await {
                                        let summary = reactions.get(&message_id).cloned().unwrap_or_default();
                                        state.broadcast(ChatServerEvent::ReactionsUpdated {
                                            room_id,
                                            message_id,
                                            reactions: summary,
                                        }).await;
                                    }
                                }
                            }
                            ChatClientCommand::Unreact { room_id, message_id, reaction } => {
                                let Some(ref user) = current_user else { continue; };
                                if let Ok(_) = state.messaging.unreact(message_id, user.user_id, &reaction).await {
                                    if let Ok(reactions) = state.messaging.reactions_for(room_id, user.user_id, &[message_id]).await {
                                        let summary = reactions.get(&message_id).cloned().unwrap_or_default();
                                        state.broadcast(ChatServerEvent::ReactionsUpdated {
                                            room_id,
                                            message_id,
                                            reactions: summary,
                                        }).await;
                                    }
                                }
                            }
                        }
                    }
                    WsMessage::Close(_) => break,
                    _ => {}
                }
            }

            // Outbound events published from across the application
            event = events.recv() => {
                // `None` means the bus is gone, which only happens on shutdown.
                // Continuing would spin on a closed stream forever.
                let Some(event) = event else { break; };

                // Only deliver events for rooms this connection is actively subscribed to
                if let Some(room_id) = event.room_id() {
                    if !subscribed_rooms.contains(&room_id) {
                        continue;
                    }
                }

                // A user-scoped event reaches exactly one person, which an
                // unauthenticated connection can never be.
                if let Some(target) = event.target_user() {
                    match current_user {
                        Some(ref user) if user.user_id == target => {}
                        _ => continue,
                    }
                }

                if let Ok(json) = serde_json::to_string(&event) {
                    if sender.send(WsMessage::Text(json.into())).await.is_err() {
                        break;
                    }
                }
            }
        }
    }

    // The loop only ends when the socket is gone, so this is the one place a
    // disconnect is observed — every exit path funnels through it.
    if let Some(user_id) = counted_as {
        announce_presence(&state, user_id, Connection::Closed).await;
    }
}

/// Which way a connection just went, for [`announce_presence`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Connection {
    /// A socket authenticated as this user.
    Opened,
    /// A socket that was counted for this user has gone.
    Closed,
}

/// Record a connection change and announce it — if it is a transition.
///
/// `Unchanged` is the common case — a second tab opening or closing — and
/// announcing it would put a message on every connection in the process for
/// something nobody can see.
///
/// A presence store that cannot answer costs this user their online badge and
/// nothing else, so the failure is logged and the socket carries on. Tearing
/// down a working chat connection because a counter was unreachable would be
/// the worse trade.
async fn announce_presence(state: &AppState, user_id: UserId, connection: Connection) {
    let change = match connection {
        Connection::Opened => state.presence.connect(user_id).await,
        Connection::Closed => state.presence.disconnect(user_id).await,
    };

    let change = match change {
        Ok(change) => change,
        Err(error) => {
            tracing::warn!(%error, %user_id, ?connection, "could not record presence");
            return;
        }
    };

    let Some(online) = change.announced_state() else {
        return;
    };

    state
        .broadcast(ChatServerEvent::PresenceChanged { user_id, online })
        .await;
}
