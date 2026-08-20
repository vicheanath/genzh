//! Who is online.
//!
//! Presence is derived from live WebSocket connections rather than stored: a
//! user is online exactly while at least one of their connections is open. That
//! makes it self-correcting — a crashed tab or a lost network drops the socket,
//! and the count goes with it — where a `last_seen_at` column would leave people
//! looking online until something remembered to clean up after them.
//!
//! The count matters because one person is routinely connected more than once:
//! two tabs, a phone and a laptop. Going offline is the *last* connection
//! closing, not any connection closing.
//!
//! # The port
//!
//! [`PresenceStore`] is what the API depends on; [`InMemoryPresenceStore`] is
//! the only implementation today. The split exists because presence is one of
//! the first things to break when a second API instance appears — each process
//! would know only about its own sockets, so half the fleet would report a
//! connected user as offline. The replacement is a shared store (a Redis hash
//! of per-instance counters, expiring with the instance), and it implements this
//! trait without a single call site changing.
//!
//! The trait stays a single interface rather than splitting reads from writes:
//! every caller that connects a user also reads presence back, so a split would
//! hand out two handles to the same thing and buy nothing.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use genzh_domain::UserId;
use parking_lot::Mutex;

use crate::store::{StoreError, StoreResult};

/// What a connect or disconnect did to a user's visible state.
///
/// Callers announce a change only on a transition, so opening a second tab does
/// not broadcast "came online" to everybody again.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PresenceChange {
    /// This user was offline and is now online.
    CameOnline,
    /// This user was online and is now offline.
    WentOffline,
    /// Still online, or still offline; nothing to announce.
    Unchanged,
}

impl PresenceChange {
    /// The online state to announce, or `None` when there is nothing to say.
    pub fn announced_state(self) -> Option<bool> {
        match self {
            Self::CameOnline => Some(true),
            Self::WentOffline => Some(false),
            Self::Unchanged => None,
        }
    }
}

/// Tracks live connections per user.
///
/// Implementations must count connections rather than store a boolean: a user
/// with two tabs who closes one is still online, and an implementation that
/// forgets this signs people out of their own session.
#[async_trait]
pub trait PresenceStore: Send + Sync + 'static {
    /// Register a live connection for `user_id`.
    async fn connect(&self, user_id: UserId) -> StoreResult<PresenceChange>;

    /// Drop a connection for `user_id`.
    ///
    /// Disconnecting a user with no recorded connections is not an error —
    /// a socket can close twice, and a shared store can lose a counter to an
    /// expiry — so this reports [`PresenceChange::Unchanged`] and moves on.
    async fn disconnect(&self, user_id: UserId) -> StoreResult<PresenceChange>;

    /// Is this user online right now?
    async fn is_online(&self, user_id: UserId) -> StoreResult<bool>;

    /// Which of `ids` are online.
    ///
    /// Takes a batch because every caller has one: a member list, a friend
    /// list, a sidebar of conversations. A per-id call would be one network
    /// round trip per row the moment this is not in-process.
    async fn online_among(&self, ids: &[UserId]) -> StoreResult<Vec<UserId>>;

    /// Everyone currently online.
    async fn online(&self) -> StoreResult<Vec<UserId>>;
}

/// Per-process connection counts, keyed by user.
///
/// Correct for a single API instance and wrong for several, which is exactly
/// what [`PresenceStore`] exists to make replaceable.
#[derive(Debug, Clone, Default)]
pub struct InMemoryPresenceStore {
    inner: Arc<Mutex<HashMap<UserId, usize>>>,
}

impl InMemoryPresenceStore {
    /// An empty registry.
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// How many users are online, for metrics and tests.
    pub fn len(&self) -> usize {
        self.inner.lock().len()
    }

    /// Is nobody connected?
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[async_trait]
impl PresenceStore for InMemoryPresenceStore {
    async fn connect(&self, user_id: UserId) -> StoreResult<PresenceChange> {
        let mut counts = self.inner.lock();
        let count = counts.entry(user_id).or_insert(0);
        *count += 1;
        Ok(if *count == 1 {
            PresenceChange::CameOnline
        } else {
            PresenceChange::Unchanged
        })
    }

    async fn disconnect(&self, user_id: UserId) -> StoreResult<PresenceChange> {
        let mut counts = self.inner.lock();
        let Some(count) = counts.get_mut(&user_id) else {
            return Ok(PresenceChange::Unchanged);
        };

        *count = count.saturating_sub(1);
        Ok(if *count == 0 {
            // Removed rather than left at zero, so the map tracks online users
            // rather than everyone who has ever connected.
            counts.remove(&user_id);
            PresenceChange::WentOffline
        } else {
            PresenceChange::Unchanged
        })
    }

    async fn is_online(&self, user_id: UserId) -> StoreResult<bool> {
        Ok(self.inner.lock().contains_key(&user_id))
    }

    async fn online_among(&self, ids: &[UserId]) -> StoreResult<Vec<UserId>> {
        let counts = self.inner.lock();
        Ok(ids
            .iter()
            .copied()
            .filter(|id| counts.contains_key(id))
            .collect())
    }

    async fn online(&self) -> StoreResult<Vec<UserId>> {
        Ok(self.inner.lock().keys().copied().collect())
    }
}

/// A presence store that fails every call.
///
/// Exists so callers can be tested against the degraded path they will meet
/// once this is a network service — the one an in-memory store can never
/// produce.
#[derive(Debug, Default)]
pub struct UnavailablePresenceStore;

#[async_trait]
impl PresenceStore for UnavailablePresenceStore {
    async fn connect(&self, _user_id: UserId) -> StoreResult<PresenceChange> {
        Err(unavailable())
    }

    async fn disconnect(&self, _user_id: UserId) -> StoreResult<PresenceChange> {
        Err(unavailable())
    }

    async fn is_online(&self, _user_id: UserId) -> StoreResult<bool> {
        Err(unavailable())
    }

    async fn online_among(&self, _ids: &[UserId]) -> StoreResult<Vec<UserId>> {
        Err(unavailable())
    }

    async fn online(&self) -> StoreResult<Vec<UserId>> {
        Err(unavailable())
    }
}

fn unavailable() -> StoreError {
    StoreError::unavailable("presence", "no presence backend configured")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> InMemoryPresenceStore {
        InMemoryPresenceStore::default()
    }

    #[tokio::test]
    async fn the_first_connection_brings_a_user_online_and_the_last_takes_them_off() {
        let presence = store();
        let user = UserId::new();

        assert_eq!(
            presence.connect(user).await.expect("connect"),
            PresenceChange::CameOnline
        );
        assert!(presence.is_online(user).await.expect("is_online"));
        assert_eq!(
            presence.disconnect(user).await.expect("disconnect"),
            PresenceChange::WentOffline
        );
        assert!(!presence.is_online(user).await.expect("is_online"));
    }

    #[tokio::test]
    async fn a_second_tab_does_not_re_announce_and_closing_it_does_not_sign_you_out() {
        let presence = store();
        let user = UserId::new();

        presence.connect(user).await.expect("connect");
        assert_eq!(
            presence.connect(user).await.expect("connect"),
            PresenceChange::Unchanged
        );

        // One of two tabs closing leaves the user online.
        assert_eq!(
            presence.disconnect(user).await.expect("disconnect"),
            PresenceChange::Unchanged
        );
        assert!(presence.is_online(user).await.expect("is_online"));

        assert_eq!(
            presence.disconnect(user).await.expect("disconnect"),
            PresenceChange::WentOffline
        );
        assert!(!presence.is_online(user).await.expect("is_online"));
    }

    #[tokio::test]
    async fn disconnecting_an_unknown_user_is_harmless() {
        let presence = store();
        assert_eq!(
            presence.disconnect(UserId::new()).await.expect("disconnect"),
            PresenceChange::Unchanged
        );
    }

    #[tokio::test]
    async fn online_among_filters_to_the_ids_asked_about() {
        let presence = store();
        let here = UserId::new();
        let away = UserId::new();
        presence.connect(here).await.expect("connect");

        assert_eq!(
            presence.online_among(&[here, away]).await.expect("among"),
            vec![here]
        );
        assert!(
            presence
                .online_among(&[away])
                .await
                .expect("among")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn the_registry_tracks_online_users_not_every_user_ever_seen() {
        let presence = store();
        let user = UserId::new();

        presence.connect(user).await.expect("connect");
        assert_eq!(presence.len(), 1);
        presence.disconnect(user).await.expect("disconnect");
        assert!(presence.is_empty(), "a departed user must not linger");
    }

    #[tokio::test]
    async fn only_transitions_are_announced() {
        assert_eq!(PresenceChange::CameOnline.announced_state(), Some(true));
        assert_eq!(PresenceChange::WentOffline.announced_state(), Some(false));
        assert_eq!(PresenceChange::Unchanged.announced_state(), None);
    }

    #[tokio::test]
    async fn callers_can_be_exercised_against_a_store_that_is_down() {
        let presence = UnavailablePresenceStore;
        let error = presence.connect(UserId::new()).await.expect_err("down");
        assert_eq!(error.backend_name(), "presence");
    }

    #[tokio::test]
    async fn the_port_is_object_safe() {
        // The whole design rests on this: if it is not usable as a trait
        // object, `AppState` cannot hold an implementation it does not name.
        let presence: Arc<dyn PresenceStore> = InMemoryPresenceStore::new();
        let user = UserId::new();
        presence.connect(user).await.expect("connect");
        assert_eq!(presence.online().await.expect("online"), vec![user]);
    }
}
