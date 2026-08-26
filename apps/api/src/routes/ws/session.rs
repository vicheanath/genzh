//! One connection: what it remembers, and how to write to it.
//!
//! Deliberately knows nothing about what any command *means*. It owns the two
//! things that are genuinely about this socket and no other — the identity it
//! is currently authenticated as, and the rooms it has subscribed to — and it
//! turns events into frames. Deciding what to do with a command is
//! [`super::commands`]'s job.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use axum::extract::ws::{Message as WsMessage, WebSocket};
use futures::SinkExt;
use futures::stream::SplitSink;
use genzh_domain::{RoomId, UserId};
use genzh_infrastructure::ConnectionId;

use crate::middleware::CurrentUser;
use crate::state::AppState;

use super::presence::{Connection, announce_presence};
use super::protocol::ChatServerEvent;

/// Shortest gap between two "X is typing" broadcasts from one connection for
/// one room.
///
/// The client sends a keystroke's worth of intent; the room needs an indicator
/// that is either on or off. A second is well inside the 2.5s the indicator
/// lives for, so nothing flickers, and it turns a per-keystroke fan-out into at
/// most one broadcast per second per room.
const TYPING_INTERVAL: Duration = Duration::from_secs(1);

/// The writing half of one socket.
///
/// Exists to hold the serialisation in one place. Every send used to be
/// `sender.send(WsMessage::Text(serde_json::to_string(&event).unwrap_or_default().into()))`
/// written out longhand — fifteen times, and each one an opportunity to forget
/// what a failed send means here.
pub(super) struct Outbound {
    sink: SplitSink<WebSocket, WsMessage>,
}

impl Outbound {
    pub(super) fn new(sink: SplitSink<WebSocket, WsMessage>) -> Self {
        Self { sink }
    }

    /// Send an event, reporting whether the socket is still there.
    ///
    /// Only the two paths that own the connection's lifetime — the heartbeat
    /// and the event fan-out — act on `false`. A reply to a command does not:
    /// the loop is about to notice the same thing when the receiver ends, and
    /// tearing down mid-command would skip the disconnect accounting.
    pub(super) async fn send(&mut self, event: &ChatServerEvent) -> bool {
        let Ok(json) = serde_json::to_string(event) else {
            // An event that will not serialise is a bug in this process, not a
            // reason to hang up on the client.
            tracing::error!("could not serialise a socket event");
            return true;
        };
        self.sink.send(WsMessage::Text(json.into())).await.is_ok()
    }

    /// Send an event and carry on regardless.
    pub(super) async fn tell(&mut self, event: ChatServerEvent) {
        let _ = self.send(&event).await;
    }

    /// Tell the client why its command went nowhere.
    pub(super) async fn refuse(&mut self, message: impl Into<String>) {
        self.tell(ChatServerEvent::Error {
            message: message.into(),
        })
        .await;
    }

    /// Heartbeat. `false` means the socket is gone.
    pub(super) async fn ping(&mut self) -> bool {
        self.sink.send(WsMessage::Ping(vec![].into())).await.is_ok()
    }
}

/// Everything one connection remembers.
pub(super) struct Session {
    /// This socket's handle in the volatile stores that are keyed by connection
    /// rather than by account.
    connection: ConnectionId,
    /// Who this socket is currently authenticated as, if anyone.
    pub(super) current_user: Option<CurrentUser>,
    /// Whether that account was staff when it authenticated.
    ///
    /// Only ever gates payload-free console signals — see `authenticate` for
    /// why reading it once per connection is a safe trade.
    is_staff: bool,
    /// Rooms this connection asked to hear about.
    subscribed_rooms: HashSet<RoomId>,
    /// The one room this connection is *reading*, if its window is in front of
    /// somebody.
    ///
    /// Not the same thing as the set above, and the difference is the whole
    /// point: a client subscribes to everything it wants live traffic from and
    /// reads one of them. Held here as well as in the shared store so a change
    /// of identity can hand the attention over, and so closing the socket knows
    /// whether there was any to release.
    focused_room: Option<RoomId>,
    /// A room the client said it was reading before it was subscribed to it.
    ///
    /// A screen opening sends both frames at once, and which one the server
    /// sees first is the client's business rather than something it should have
    /// to get right. A focus that arrives early is held here and applied the
    /// moment the subscription lands, so attention is never silently dropped.
    pending_focus: Option<RoomId>,
    /// Whoever this connection is counted against for presence.
    ///
    /// Tracked separately from `current_user` so a disconnect can undo exactly
    /// what the connect did, even when the token was swapped in between.
    counted_as: Option<UserId>,
    /// When this connection last told a room somebody was typing.
    ///
    /// Per socket rather than in the shared flood guard: this is throttling,
    /// not a budget, and the state dies with the connection that owns it.
    typing_sent: HashMap<RoomId, Instant>,
}

impl Session {
    pub(super) fn new() -> Self {
        Self {
            connection: ConnectionId::new(),
            current_user: None,
            is_staff: false,
            subscribed_rooms: HashSet::new(),
            focused_room: None,
            pending_focus: None,
            counted_as: None,
            typing_sent: HashMap::new(),
        }
    }

    /// The caller, when this connection has one.
    pub(super) fn user(&self) -> Option<CurrentUser> {
        self.current_user
    }

    pub(super) fn is_subscribed(&self, room_id: RoomId) -> bool {
        self.subscribed_rooms.contains(&room_id)
    }

    /// Take a subscription, honouring any attention that was waiting on it.
    pub(super) async fn subscribe(&mut self, state: &AppState, room_id: RoomId) {
        self.subscribed_rooms.insert(room_id);

        if self.pending_focus == Some(room_id) {
            self.attend(state, Some(room_id)).await;
        }
    }

    pub(super) fn unsubscribe(&mut self, room_id: RoomId) {
        self.subscribed_rooms.remove(&room_id);
    }

    /// Say what this connection is reading, or that it is reading nothing.
    ///
    /// Only a room this connection is subscribed to counts: attention is a
    /// stronger claim than subscription, and a client that could assert it over
    /// any room id would be able to silence its own notifications for a room it
    /// was never admitted to.
    ///
    /// A store that cannot record it costs this user one suppressed
    /// notification and nothing else, so the failure is logged and the socket
    /// carries on.
    pub(super) async fn attend(&mut self, state: &AppState, room_id: Option<RoomId>) {
        let Some(user) = self.current_user else {
            return;
        };

        // Attention is a claim over a room this connection was admitted to. One
        // that arrives before the subscription is not refused, only deferred —
        // see `pending_focus`.
        self.pending_focus = room_id.filter(|id| !self.is_subscribed(*id));
        let room_id = room_id.filter(|id| self.is_subscribed(*id));
        self.focused_room = room_id;

        let recorded = match room_id {
            Some(room_id) => state.attention.focus(self.connection, user.user_id, room_id).await,
            None => state.attention.blur(self.connection).await,
        };

        if let Err(error) = recorded {
            tracing::warn!(%error, %user.user_id, "could not record what a connection is reading");
        }
    }

    /// This connection is still there.
    ///
    /// Attention expires so that a client whose runtime was frozen mid-room
    /// stops silencing its own notifications; anything the connection says
    /// pushes that expiry back, including the heartbeat it already sends.
    pub(super) async fn touch(&self, state: &AppState) {
        if self.focused_room.is_none() {
            return;
        }
        let _ = state.attention.touch(self.connection).await;
    }

    /// Accept a token, moving the presence count if the identity changed.
    ///
    /// Authenticating over an already-open socket is the normal path — the
    /// client connects first and sends the token after — so this has to count
    /// the connection, not just remember it.
    pub(super) async fn authenticate(&mut self, state: &AppState, token: &str) -> bool {
        let Ok(user) = state.auth.jwt().authenticate(token) else {
            return false;
        };

        self.current_user = Some(CurrentUser {
            user_id: user.user_id,
            session_id: user.session_id,
        });

        // Read once per connection rather than per event: the alternative is a
        // database round trip on every console signal delivered to every
        // socket. The cost is that a demotion only takes effect on this
        // connection's next authenticate — which is why the signals carry no
        // payload. Everything they point at is fetched over REST, where the
        // role *is* re-read per request, so a stale `true` here buys somebody
        // nothing but the knowledge that a list they cannot read has changed.
        self.is_staff = state
            .staff
            .role_of(user.user_id)
            .await
            .is_ok_and(|role| role.is_staff());

        if self.counted_as != Some(user.user_id) {
            if let Some(previous) = self.counted_as {
                announce_presence(state, previous, Connection::Closed).await;
                // Whatever the previous identity was reading is not this one's
                // to inherit; the client says what it is reading again.
                self.focused_room = None;
                let _ = state.attention.blur(self.connection).await;
            }
            self.counted_as = Some(user.user_id);
            announce_presence(state, user.user_id, Connection::Opened).await;
        }

        true
    }

    /// Undo whatever this connection was counted as. Called once, on the way out.
    ///
    /// The attention is dropped whether or not this socket ever authenticated:
    /// a closed socket is reading nothing, and an entry left behind would go on
    /// suppressing its owner's notifications until it expired.
    pub(super) async fn release(&mut self, state: &AppState) {
        self.focused_room = None;
        let _ = state.attention.blur(self.connection).await;

        if let Some(user_id) = self.counted_as.take() {
            announce_presence(state, user_id, Connection::Closed).await;
        }
    }

    /// May this connection say "typing" in this room right now?
    ///
    /// "Still typing" is throttled; "stopped" always goes through, and only
    /// when this connection said "typing" first. Dropping a stop would strand
    /// the indicator on every screen in the room until the sender happened to
    /// type again.
    pub(super) fn may_announce_typing(&mut self, room_id: RoomId, is_typing: bool) -> bool {
        let now = Instant::now();
        if is_typing {
            let due = self
                .typing_sent
                .get(&room_id)
                .is_none_or(|last| now.duration_since(*last) >= TYPING_INTERVAL);
            if !due {
                return false;
            }
            self.typing_sent.insert(room_id, now);
            true
        } else {
            self.typing_sent.remove(&room_id).is_some()
        }
    }

    /// Should a published event reach this connection?
    ///
    /// Two independent filters, and an event that is neither room-scoped nor
    /// user-scoped passes both — presence changes go to everybody by design.
    pub(super) fn accepts(&self, event: &ChatServerEvent) -> bool {
        // Checked first, and by denying rather than by falling through: a
        // console event is neither room- nor user-scoped, so every filter below
        // would pass it — to every connection, signed in or not.
        if event.requires_staff() && !self.is_staff {
            return false;
        }

        if let Some(room_id) = event.room_id()
            && !self.is_subscribed(room_id)
        {
            return false;
        }

        // A user-scoped event reaches exactly one person, which an
        // unauthenticated connection can never be.
        if let Some(target) = event.target_user() {
            return matches!(self.current_user, Some(user) if user.user_id == target);
        }

        true
    }
}
