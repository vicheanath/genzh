//! Who is looking at which conversation right now.
//!
//! Presence answers "is this person connected"; this answers the narrower
//! question a notification actually depends on: *are they reading this room at
//! this moment*. Telling somebody about a message they are watching arrive is
//! the most annoying thing a chat app does, and being online is not enough to
//! know that — a user with forty rooms is connected to all of them and looking
//! at one.
//!
//! # Why it is keyed by connection
//!
//! A person looks at one conversation at a time, per device. Keying attention
//! by connection rather than by user makes both of the facts that matter fall
//! out for free: focusing a room replaces whatever that connection was looking
//! at before, and a socket closing takes its attention with it. A phone left on
//! a room and a laptop reading another are two entries, and the user is
//! watching both — which is the truth.
//!
//! # Why it goes stale
//!
//! A client that is honest says "I am looking at nothing" when its window is
//! hidden or its app is backgrounded. A client that is *frozen* says nothing at
//! all: a suspended mobile runtime stops its timers with the socket still open,
//! so its last word remains "I am reading this room" indefinitely. That would
//! silence notifications for somebody who is not there.
//!
//! So attention expires. Anything the connection does refreshes it — including
//! the heartbeat it already sends every 25 seconds — and a connection that has
//! said nothing for [`ATTENTION_TTL`] stops counting as a reader. The cost of
//! the timer being wrong is one notification for a message you were watching;
//! the cost of not having it is silence for somebody who left.
//!
//! # The port
//!
//! [`InMemoryAttentionStore`] is correct for one API instance and wrong for
//! several, exactly like [`crate::presence`]: each process would know only
//! about its own sockets, so a notification decided on one instance would not
//! see that the reader is attached to another. The replacement is a shared
//! store of per-connection entries with a TTL — which is what the expiry above
//! already models — and it implements this trait without a call site changing.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use genzh_domain::{RoomId, UserId};
use parking_lot::Mutex;

use crate::store::StoreResult;

/// How long a connection's attention survives without a word from it.
///
/// Comfortably longer than the client heartbeat (25s), so an idle reader who is
/// genuinely reading is never mistaken for one who has gone; short enough that
/// a phone whose runtime was frozen mid-room starts getting notifications again
/// within about a minute.
pub const ATTENTION_TTL: Duration = Duration::from_secs(75);

/// One socket, for as long as it is open.
///
/// Process-local by construction: it identifies a connection this instance is
/// holding, and a connection cannot outlive the process that terminates it. A
/// shared implementation would qualify it with the instance's own id rather
/// than trying to make this globally unique.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ConnectionId(u64);

impl ConnectionId {
    /// Take the next id.
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(1);
        Self(NEXT.fetch_add(1, Ordering::Relaxed))
    }
}

impl std::fmt::Display for ConnectionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

/// Tracks what each live connection is reading.
#[async_trait]
pub trait AttentionStore: Send + Sync + 'static {
    /// This connection is reading `room_id`, and nothing else.
    ///
    /// Replaces whatever it was reading before: moving between rooms is one
    /// call, not a blur and a focus that could be observed out of order.
    async fn focus(
        &self,
        connection: ConnectionId,
        user_id: UserId,
        room_id: RoomId,
    ) -> StoreResult<()>;

    /// This connection is reading nothing — screen closed, tab hidden, app
    /// backgrounded, socket gone.
    ///
    /// Blurring a connection that was not reading anything is not an error: a
    /// client may say it on becoming hidden whether or not it had a room open.
    async fn blur(&self, connection: ConnectionId) -> StoreResult<()>;

    /// Still here. Refreshes this connection's expiry, if it has attention.
    async fn touch(&self, connection: ConnectionId) -> StoreResult<()>;

    /// Which of `ids` are reading `room_id` right now.
    ///
    /// Takes a batch because the one caller is a notification fan-out with a
    /// list of recipients in hand; asking per person would be a round trip each
    /// the moment this is not in-process.
    async fn watching(&self, room_id: RoomId, ids: &[UserId]) -> StoreResult<Vec<UserId>>;
}

/// What one connection is reading, and when it last said so.
#[derive(Debug, Clone, Copy)]
struct Watcher {
    user_id: UserId,
    since: Instant,
}

/// Per-process attention, indexed both ways.
///
/// `by_room` is what the read path needs — the watchers of one room, without
/// walking every connection in the process — and `rooms` is what the write path
/// needs, because focusing elsewhere or hanging up has to find the entry to
/// remove and only the connection id is in hand.
#[derive(Debug, Default)]
struct Inner {
    by_room: HashMap<RoomId, HashMap<ConnectionId, Watcher>>,
    rooms: HashMap<ConnectionId, RoomId>,
}

impl Inner {
    /// Detach a connection from whatever it was reading.
    fn remove(&mut self, connection: ConnectionId) {
        let Some(room_id) = self.rooms.remove(&connection) else {
            return;
        };
        if let Some(watchers) = self.by_room.get_mut(&room_id) {
            watchers.remove(&connection);
            if watchers.is_empty() {
                // Dropped rather than left empty, so the map tracks rooms
                // somebody is reading rather than every room ever opened.
                self.by_room.remove(&room_id);
            }
        }
    }
}

/// Attention held in this process, expiring on [`ATTENTION_TTL`].
#[derive(Debug, Clone, Default)]
pub struct InMemoryAttentionStore {
    inner: Arc<Mutex<Inner>>,
}

impl InMemoryAttentionStore {
    /// An empty store.
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// How many connections are reading something, for metrics and tests.
    pub fn len(&self) -> usize {
        self.inner.lock().rooms.len()
    }

    /// Is nobody reading anything?
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[async_trait]
impl AttentionStore for InMemoryAttentionStore {
    async fn focus(
        &self,
        connection: ConnectionId,
        user_id: UserId,
        room_id: RoomId,
    ) -> StoreResult<()> {
        let mut inner = self.inner.lock();
        inner.remove(connection);
        inner.rooms.insert(connection, room_id);
        inner.by_room.entry(room_id).or_default().insert(
            connection,
            Watcher {
                user_id,
                since: Instant::now(),
            },
        );
        Ok(())
    }

    async fn blur(&self, connection: ConnectionId) -> StoreResult<()> {
        self.inner.lock().remove(connection);
        Ok(())
    }

    async fn touch(&self, connection: ConnectionId) -> StoreResult<()> {
        let mut inner = self.inner.lock();
        let Some(room_id) = inner.rooms.get(&connection).copied() else {
            return Ok(());
        };
        if let Some(watcher) = inner
            .by_room
            .get_mut(&room_id)
            .and_then(|watchers| watchers.get_mut(&connection))
        {
            watcher.since = Instant::now();
        }
        Ok(())
    }

    async fn watching(&self, room_id: RoomId, ids: &[UserId]) -> StoreResult<Vec<UserId>> {
        let inner = self.inner.lock();
        let Some(watchers) = inner.by_room.get(&room_id) else {
            return Ok(Vec::new());
        };

        let now = Instant::now();
        Ok(ids
            .iter()
            .copied()
            .filter(|id| {
                watchers.values().any(|watcher| {
                    watcher.user_id == *id && now.duration_since(watcher.since) < ATTENTION_TTL
                })
            })
            .collect())
    }
}

/// An attention store that never reports anybody as reading.
///
/// The safe degradation, and the one a caller should behave sensibly under: it
/// means every notification is written, which is the pre-existing behaviour and
/// merely noisier — where a store that guessed "yes" would silently swallow
/// them. Used where attention tracking is not wanted at all, and in tests that
/// are about something else.
#[derive(Debug, Default)]
pub struct InattentiveStore;

#[async_trait]
impl AttentionStore for InattentiveStore {
    async fn focus(&self, _: ConnectionId, _: UserId, _: RoomId) -> StoreResult<()> {
        Ok(())
    }

    async fn blur(&self, _: ConnectionId) -> StoreResult<()> {
        Ok(())
    }

    async fn touch(&self, _: ConnectionId) -> StoreResult<()> {
        Ok(())
    }

    async fn watching(&self, _: RoomId, _: &[UserId]) -> StoreResult<Vec<UserId>> {
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_focused_connection_is_reading_its_room_and_no_other() {
        let attention = InMemoryAttentionStore::default();
        let connection = ConnectionId::new();
        let user = UserId::new();
        let room = RoomId::new();
        let elsewhere = RoomId::new();

        attention
            .focus(connection, user, room)
            .await
            .expect("focus");

        assert_eq!(attention.watching(room, &[user]).await.expect("watching"), vec![user]);
        assert!(
            attention
                .watching(elsewhere, &[user])
                .await
                .expect("watching")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn moving_between_rooms_leaves_the_first_one_behind() {
        let attention = InMemoryAttentionStore::default();
        let connection = ConnectionId::new();
        let user = UserId::new();
        let first = RoomId::new();
        let second = RoomId::new();

        attention.focus(connection, user, first).await.expect("focus");
        attention.focus(connection, user, second).await.expect("focus");

        assert!(
            attention
                .watching(first, &[user])
                .await
                .expect("watching")
                .is_empty(),
            "the room they left must not still count as read"
        );
        assert_eq!(
            attention.watching(second, &[user]).await.expect("watching"),
            vec![user]
        );
        assert_eq!(attention.len(), 1, "one connection, one entry");
    }

    #[tokio::test]
    async fn two_devices_on_two_rooms_are_reading_both() {
        let attention = InMemoryAttentionStore::default();
        let phone = ConnectionId::new();
        let laptop = ConnectionId::new();
        let user = UserId::new();
        let first = RoomId::new();
        let second = RoomId::new();

        attention.focus(phone, user, first).await.expect("focus");
        attention.focus(laptop, user, second).await.expect("focus");

        assert_eq!(
            attention.watching(first, &[user]).await.expect("watching"),
            vec![user]
        );
        assert_eq!(
            attention.watching(second, &[user]).await.expect("watching"),
            vec![user]
        );

        // Closing one device leaves the other reading.
        attention.blur(phone).await.expect("blur");
        assert!(
            attention
                .watching(first, &[user])
                .await
                .expect("watching")
                .is_empty()
        );
        assert_eq!(
            attention.watching(second, &[user]).await.expect("watching"),
            vec![user]
        );
    }

    #[tokio::test]
    async fn blurring_a_connection_that_was_reading_nothing_is_harmless() {
        let attention = InMemoryAttentionStore::default();
        attention.blur(ConnectionId::new()).await.expect("blur");
        assert!(attention.is_empty());
    }

    #[tokio::test]
    async fn attention_that_has_gone_quiet_stops_counting() {
        let attention = InMemoryAttentionStore::default();
        let connection = ConnectionId::new();
        let user = UserId::new();
        let room = RoomId::new();

        attention.focus(connection, user, room).await.expect("focus");

        // Age the entry past its expiry rather than waiting out the clock.
        {
            let mut inner = attention.inner.lock();
            let watcher = inner
                .by_room
                .get_mut(&room)
                .and_then(|watchers| watchers.get_mut(&connection))
                .expect("the entry just written");
            watcher.since = Instant::now() - (ATTENTION_TTL + Duration::from_secs(1));
        }

        assert!(
            attention
                .watching(room, &[user])
                .await
                .expect("watching")
                .is_empty(),
            "a frozen client must not silence notifications forever"
        );

        // A heartbeat brings it back.
        attention.touch(connection).await.expect("touch");
        assert_eq!(
            attention.watching(room, &[user]).await.expect("watching"),
            vec![user]
        );
    }

    #[tokio::test]
    async fn watching_answers_only_about_the_ids_it_was_asked_about() {
        let attention = InMemoryAttentionStore::default();
        let reader = UserId::new();
        let absent = UserId::new();
        let room = RoomId::new();

        attention
            .focus(ConnectionId::new(), reader, room)
            .await
            .expect("focus");

        assert_eq!(
            attention
                .watching(room, &[reader, absent])
                .await
                .expect("watching"),
            vec![reader]
        );
        assert!(
            attention
                .watching(room, &[absent])
                .await
                .expect("watching")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn the_degraded_store_reports_nobody_reading() {
        let attention = InattentiveStore;
        let user = UserId::new();
        let room = RoomId::new();
        attention
            .focus(ConnectionId::new(), user, room)
            .await
            .expect("focus");
        assert!(
            attention
                .watching(room, &[user])
                .await
                .expect("watching")
                .is_empty(),
            "failing open means notifying, not silencing"
        );
    }

    #[tokio::test]
    async fn the_port_is_object_safe() {
        let attention: Arc<dyn AttentionStore> = InMemoryAttentionStore::new();
        let user = UserId::new();
        let room = RoomId::new();
        attention
            .focus(ConnectionId::new(), user, room)
            .await
            .expect("focus");
        assert_eq!(
            attention.watching(room, &[user]).await.expect("watching"),
            vec![user]
        );
    }
}
