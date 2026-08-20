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
//! This is deliberately per-process and in-memory. It is the right shape for a
//! single API instance; running several would need the registry behind Redis or
//! a similar shared store, and this is the seam to replace.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use genzh_domain::UserId;

/// Live connection counts, keyed by user.
#[derive(Debug, Clone, Default)]
pub struct PresenceRegistry {
    inner: Arc<Mutex<HashMap<UserId, usize>>>,
}

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

impl PresenceRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a live connection for `user_id`.
    pub fn connect(&self, user_id: UserId) -> PresenceChange {
        let mut counts = self.lock();
        let count = counts.entry(user_id).or_insert(0);
        *count += 1;
        if *count == 1 {
            PresenceChange::CameOnline
        } else {
            PresenceChange::Unchanged
        }
    }

    /// Drop a connection for `user_id`.
    pub fn disconnect(&self, user_id: UserId) -> PresenceChange {
        let mut counts = self.lock();
        let Some(count) = counts.get_mut(&user_id) else {
            return PresenceChange::Unchanged;
        };

        *count = count.saturating_sub(1);
        if *count == 0 {
            // Removed rather than left at zero, so the map tracks online users
            // rather than everyone who has ever connected.
            counts.remove(&user_id);
            PresenceChange::WentOffline
        } else {
            PresenceChange::Unchanged
        }
    }

    /// Is this user online right now?
    pub fn is_online(&self, user_id: UserId) -> bool {
        self.lock().contains_key(&user_id)
    }

    /// Which of `ids` are online.
    ///
    /// Takes a batch because every caller has one: a member list, a friend
    /// list, a sidebar of conversations.
    pub fn online_among(&self, ids: &[UserId]) -> Vec<UserId> {
        let counts = self.lock();
        ids.iter()
            .copied()
            .filter(|id| counts.contains_key(id))
            .collect()
    }

    /// Everyone currently online.
    pub fn online(&self) -> Vec<UserId> {
        self.lock().keys().copied().collect()
    }

    /// A poisoned lock here means another thread panicked mid-update. The
    /// counts are recoverable — worst case one user's state is briefly wrong —
    /// so this takes the guard rather than propagating the panic.
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<UserId, usize>> {
        self.inner.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_connection_brings_a_user_online_and_the_last_takes_them_off() {
        let registry = PresenceRegistry::new();
        let user = UserId::new();

        assert_eq!(registry.connect(user), PresenceChange::CameOnline);
        assert!(registry.is_online(user));
        assert_eq!(registry.disconnect(user), PresenceChange::WentOffline);
        assert!(!registry.is_online(user));
    }

    #[test]
    fn a_second_tab_does_not_re_announce_and_closing_it_does_not_sign_you_out() {
        let registry = PresenceRegistry::new();
        let user = UserId::new();

        registry.connect(user);
        assert_eq!(registry.connect(user), PresenceChange::Unchanged);

        // One of two tabs closing leaves the user online.
        assert_eq!(registry.disconnect(user), PresenceChange::Unchanged);
        assert!(registry.is_online(user));

        assert_eq!(registry.disconnect(user), PresenceChange::WentOffline);
        assert!(!registry.is_online(user));
    }

    #[test]
    fn disconnecting_an_unknown_user_is_harmless() {
        let registry = PresenceRegistry::new();
        assert_eq!(registry.disconnect(UserId::new()), PresenceChange::Unchanged);
    }

    #[test]
    fn online_among_filters_to_the_ids_asked_about() {
        let registry = PresenceRegistry::new();
        let here = UserId::new();
        let away = UserId::new();
        registry.connect(here);

        assert_eq!(registry.online_among(&[here, away]), vec![here]);
        assert!(registry.online_among(&[away]).is_empty());
    }
}
