//! The room registry.
//!
//! Every lookup, creation and destruction of a room goes through here. That is
//! the whole point: the map behind it is an implementation detail, so swapping
//! in a shared directory (Redis, or a gossip layer between media servers) later
//! is a change to this file and nothing else.

use std::collections::HashMap;
use std::sync::Arc;

use social_media_core::track::ParticipantId;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::error::{MediaRoomError, MediaRoomResult};
use crate::participant::Participant;
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
        Arc::new(Self { rooms: RwLock::new(HashMap::new()), default_config })
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
        let room = self.get(room_id).await.ok_or(MediaRoomError::RoomNotFound)?;
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::participant::test_support::RecordingSink;
    use social_media_core::permissions::MediaPermissions;
    use social_media_core::track::TrackKind;

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
                manager.join(room_id, participant).await.map(|(room, _)| room.id())
            }));
        }

        for handle in handles {
            assert_eq!(handle.await.expect("task").expect("join"), room_id);
        }

        assert_eq!(manager.room_count().await, 1, "the create race must not duplicate rooms");
        assert_eq!(manager.participant_count().await, 8);
    }

    #[tokio::test]
    async fn a_failed_join_does_not_leave_an_empty_room_behind() {
        let manager = MediaRoomManager::new(RoomConfig { capacity: 0, ..RoomConfig::default() });
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
}
