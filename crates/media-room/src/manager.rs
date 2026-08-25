//! The room registry.
//!
//! Every lookup, creation and destruction of a room goes through here, and the
//! map behind it is an implementation detail.
//!
//! # Why this is not behind a trait
//!
//! The volatile state in the control plane — presence, request budgets,
//! real-time fan-out — is defined as a trait in `genzh-infrastructure` with an
//! in-memory implementation, so a shared store can replace it. This registry
//! deliberately is not, and the difference is worth being explicit about.
//!
//! What this map holds is not *data about* rooms; it is the rooms themselves —
//! live peer connections, DTLS sessions and RTP fan-out tasks owned by this
//! process. None of that can be moved to Redis, because a socket cannot be
//! serialised. A trait here would be a seam nothing could ever be plugged into.
//!
//! Scaling the media plane is therefore a different problem, and it is already
//! solved a layer up: `MediaServerSelector` in `genzh-room` decides which media
//! server hosts a room, and every participant of a room is sent to the same
//! one. More capacity is more media servers behind that selector, not a shared
//! registry behind this one.

use std::collections::HashMap;
use std::sync::Arc;

use genzh_media_core::track::ParticipantId;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::error::{MediaRoomError, MediaRoomResult};
use crate::participant::{ConnectionState, Participant};
use crate::room::{MediaRoom, RoomConfig};
use crate::track::PublishedTrack;

/// Owns every live room on this media server.
#[derive(Debug, Default)]
pub struct MediaRoomManager {
    rooms: RwLock<HashMap<Uuid, Arc<MediaRoom>>>,
    default_config: RoomConfig,
}

impl MediaRoomManager {
    /// Build a manager with the given default room configuration.
    pub fn new(default_config: RoomConfig) -> Arc<Self> {
        Arc::new(Self {
            rooms: RwLock::new(HashMap::new()),
            default_config,
        })
    }

    /// Fetch a room without creating it.
    pub async fn get(&self, room_id: Uuid) -> Option<Arc<MediaRoom>> {
        self.rooms.read().await.get(&room_id).cloned()
    }

    /// Fetch a room, creating it if this is the first participant.
    ///
    /// Rooms are created lazily on join rather than provisioned by the API:
    /// the control plane owns *whether a room exists as a concept*, the media
    /// server owns *whether it currently has anyone in it*. Nothing has to be
    /// kept in sync between the two.
    pub async fn get_or_create(&self, room_id: Uuid) -> Arc<MediaRoom> {
        if let Some(room) = self.get(room_id).await {
            return room;
        }

        let mut rooms = self.rooms.write().await;
        // Re-check under the write lock: two joins can race here.
        rooms
            .entry(room_id)
            .or_insert_with(|| {
                tracing::info!(%room_id, "media room created");
                MediaRoom::new(room_id, self.default_config)
            })
            .clone()
    }

    /// Join a room, creating it if needed.
    ///
    /// Returns the room and the tracks the newcomer was auto-subscribed to. If
    /// the join fails, an empty room created by this call is cleaned up rather
    /// than leaked.
    pub async fn join(
        &self,
        room_id: Uuid,
        participant: Arc<Participant>,
    ) -> MediaRoomResult<(Arc<MediaRoom>, Vec<Arc<PublishedTrack>>)> {
        let room = self.get_or_create(room_id).await;
        match room.add_participant(participant).await {
            Ok(attached) => Ok((room, attached)),
            Err(error) => {
                self.destroy_if_empty(room_id).await;
                Err(error)
            }
        }
    }

    /// Remove a participant and destroy the room if it was the last one.
    pub async fn leave(&self, room_id: Uuid, participant_id: ParticipantId) -> MediaRoomResult<()> {
        let room = self
            .get(room_id)
            .await
            .ok_or(MediaRoomError::RoomNotFound)?;
        room.remove_participant(participant_id).await;
        self.destroy_if_empty(room_id).await;
        Ok(())
    }

    /// Drop a room if nobody is left in it.
    ///
    /// Checked under the registry write lock so a join racing with the last
    /// departure cannot resurrect a room that is about to be dropped, nor be
    /// dropped itself.
    pub async fn destroy_if_empty(&self, room_id: Uuid) -> bool {
        let mut rooms = self.rooms.write().await;
        let Some(room) = rooms.get(&room_id) else {
            return false;
        };
        if !room.is_empty().await {
            return false;
        }
        rooms.remove(&room_id);
        tracing::info!(%room_id, "media room destroyed");
        true
    }

    /// Number of live rooms; surfaced by the health endpoint.
    /// Every room this server is carrying, with counters.
    pub async fn report(&self) -> crate::stats::ServerReport {
        let rooms: Vec<Arc<MediaRoom>> = self.rooms.read().await.values().cloned().collect();

        let mut reports = Vec::with_capacity(rooms.len());
        for room in rooms {
            reports.push(room.report().await);
        }

        crate::stats::ServerReport::with_totals(reports)
    }

    pub async fn room_count(&self) -> usize {
        self.rooms.read().await.len()
    }

    /// Total participants across all rooms.
    pub async fn participant_count(&self) -> usize {
        let rooms: Vec<Arc<MediaRoom>> = self.rooms.read().await.values().cloned().collect();
        let mut total = 0;
        for room in rooms {
            total += room.participant_count().await;
        }
        total
    }

    /// Close every room. Called on shutdown so peer connections are torn down
    /// rather than dropped on the floor.
    pub async fn shutdown(&self) {
        let rooms: Vec<Arc<MediaRoom>> = self.rooms.write().await.drain().map(|(_, r)| r).collect();
        for room in rooms {
            for participant in room.participants().await {
                room.remove_participant(participant.id()).await;
            }
        }
    }

    /// Drop participants whose connection has closed, then destroy the rooms
    /// that leaves empty.
    ///
    /// The clean paths already do this: a participant who leaves properly goes
    /// through [`Self::leave`], which destroys the room behind them. This is for
    /// the unclean ones — a peer connection that failed, a browser tab closed
    /// mid-call — where the connection is known to be dead but nothing ever came
    /// back to say so. Without a sweep those rooms stay in the registry holding
    /// their tracks open for the life of the process.
    pub async fn prune(&self) -> PruneReport {
        // Snapshot first: the per-room work below awaits, and holding the
        // registry lock across it would block every join for the duration.
        let rooms: Vec<(Uuid, Arc<MediaRoom>)> = self
            .rooms
            .read()
            .await
            .iter()
            .map(|(&id, room)| (id, Arc::clone(room)))
            .collect();

        let mut report = PruneReport::default();

        for (room_id, room) in rooms {
            for participant in room.participants().await {
                if participant.state().await.connection != ConnectionState::Closed {
                    continue;
                }

                if room.remove_participant(participant.id()).await.is_some() {
                    report.participants_removed += 1;
                    tracing::debug!(
                        %room_id,
                        participant_id = %participant.id(),
                        "pruned participant with a closed connection"
                    );
                }
            }

            // Re-checked under the registry write lock rather than here, so a
            // join arriving between the emptiness check and the removal cannot
            // have its room dropped underneath it.
            if self.destroy_if_empty(room_id).await {
                report.rooms_removed += 1;
            }
        }

        report
    }
}

/// Statistics from a prune cycle.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PruneReport {
    /// Number of empty rooms destroyed.
    pub rooms_removed: usize,
    /// Number of closed / disconnected participants cleaned up.
    pub participants_removed: usize,
}

impl PruneReport {
    /// Whether the sweep found nothing to do, so the caller can stay quiet.
    /// Most passes reclaim nothing and are not worth a log line.
    pub fn is_empty(&self) -> bool {
        self.rooms_removed == 0 && self.participants_removed == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::participant::test_support::RecordingSink;
    use genzh_media_core::permissions::MediaPermissions;
    use genzh_media_core::track::TrackKind;

    fn member(name: &str) -> (Arc<Participant>, Arc<RecordingSink>) {
        let sink = Arc::new(RecordingSink::default());
        let p = Participant::new(
            ParticipantId::new(),
            Uuid::new_v4(),
            name,
            MediaPermissions::SUBSCRIBE | MediaPermissions::PUBLISH_AUDIO,
            sink.clone(),
        );
        (p, sink)
    }

    #[tokio::test]
    async fn rooms_are_created_on_first_join_and_destroyed_on_last_leave() {
        let manager = MediaRoomManager::new(RoomConfig::default());
        let room_id = Uuid::new_v4();
        assert_eq!(manager.room_count().await, 0);
        assert!(manager.get(room_id).await.is_none());

        let (alice, _) = member("Alice");
        manager.join(room_id, alice.clone()).await.expect("join");
        assert_eq!(manager.room_count().await, 1);
        assert_eq!(manager.participant_count().await, 1);

        manager.leave(room_id, alice.id()).await.expect("leave");
        assert_eq!(manager.room_count().await, 0, "empty rooms must not linger");
        assert!(manager.get(room_id).await.is_none());
    }

    #[tokio::test]
    async fn a_room_survives_while_anyone_remains() {
        let manager = MediaRoomManager::new(RoomConfig::default());
        let room_id = Uuid::new_v4();
        let (alice, _) = member("Alice");
        let (bob, _) = member("Bob");

        manager.join(room_id, alice.clone()).await.expect("join");
        manager.join(room_id, bob.clone()).await.expect("join");

        manager.leave(room_id, alice.id()).await.expect("leave");
        assert_eq!(manager.room_count().await, 1);
        assert_eq!(manager.participant_count().await, 1);

        manager.leave(room_id, bob.id()).await.expect("leave");
        assert_eq!(manager.room_count().await, 0);
    }

    #[tokio::test]
    async fn concurrent_joins_share_one_room() {
        let manager = MediaRoomManager::new(RoomConfig::default());
        let room_id = Uuid::new_v4();

        let mut handles = Vec::new();
        for i in 0..8 {
            let manager = manager.clone();
            let (participant, _) = member(&format!("p{i}"));
            handles.push(tokio::spawn(async move {
                manager
                    .join(room_id, participant)
                    .await
                    .map(|(room, _)| room.id())
            }));
        }

        for handle in handles {
            assert_eq!(handle.await.expect("task").expect("join"), room_id);
        }

        assert_eq!(
            manager.room_count().await,
            1,
            "the create race must not duplicate rooms"
        );
        assert_eq!(manager.participant_count().await, 8);
    }

    #[tokio::test]
    async fn a_failed_join_does_not_leave_an_empty_room_behind() {
        let manager = MediaRoomManager::new(RoomConfig {
            capacity: 0,
            ..RoomConfig::default()
        });
        let room_id = Uuid::new_v4();
        let (alice, _) = member("Alice");

        assert!(manager.join(room_id, alice).await.is_err());
        assert_eq!(manager.room_count().await, 0);
    }

    #[tokio::test]
    async fn leaving_a_room_that_does_not_exist_is_an_error_not_a_panic() {
        let manager = MediaRoomManager::new(RoomConfig::default());
        assert!(matches!(
            manager.leave(Uuid::new_v4(), ParticipantId::new()).await,
            Err(MediaRoomError::RoomNotFound)
        ));
    }

    #[tokio::test]
    async fn shutdown_closes_every_transport() {
        let manager = MediaRoomManager::new(RoomConfig::default());
        let room_id = Uuid::new_v4();
        let (alice, alice_sink) = member("Alice");
        let (bob, bob_sink) = member("Bob");
        manager.join(room_id, alice.clone()).await.expect("join");
        manager.join(room_id, bob.clone()).await.expect("join");

        let track = PublishedTrack::new(alice.id(), TrackKind::Audio, "audio/opus", None);
        manager
            .get(room_id)
            .await
            .expect("room")
            .publish_track(alice.id(), track)
            .await
            .expect("publish");

        manager.shutdown().await;

        assert_eq!(manager.room_count().await, 0);
        assert!(alice_sink.is_closed().await);
        assert!(bob_sink.is_closed().await);
    }

    #[tokio::test]
    async fn prune_cleans_up_closed_participants_and_empty_rooms() {
        let manager = MediaRoomManager::new(RoomConfig::default());
        let room_id = Uuid::new_v4();
        let (alice, alice_sink) = member("Alice");
        let (bob, _) = member("Bob");

        manager.join(room_id, alice.clone()).await.expect("join");
        manager.join(room_id, bob.clone()).await.expect("join");

        // Alice drops connection abruptly (connection state Closed)
        alice
            .update_state(|s| s.connection = ConnectionState::Closed)
            .await;

        let report = manager.prune().await;
        assert_eq!(report.participants_removed, 1);
        assert_eq!(report.rooms_removed, 0);
        assert_eq!(manager.participant_count().await, 1);

        // Bob leaves cleanly
        manager.leave(room_id, bob.id()).await.expect("leave");
        assert_eq!(manager.room_count().await, 0);

        // Also test an explicitly orphaned empty room
        let empty_room_id = Uuid::new_v4();
        let _ = manager.get_or_create(empty_room_id).await;
        assert_eq!(manager.room_count().await, 1);

        let report = manager.prune().await;
        assert_eq!(report.rooms_removed, 1);
        assert_eq!(manager.room_count().await, 0);
        assert!(alice_sink.is_closed().await);
    }
}
