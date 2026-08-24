//! A live media room.
//!
//! ## Lifecycle
//!
//! ```text
//!   first join ──▶ room created
//!        │
//!        ├── participant joins ──▶ auto-subscribed to existing tracks
//!        ├── participant publishes ──▶ everyone else auto-subscribed
//!        ├── participant unpublishes ──▶ every subscriber detached
//!        └── participant leaves ──▶ their tracks removed from every subscriber,
//!                                   their own transport closed
//!        │
//!   last leave ──▶ room destroyed by the manager
//! ```
//!
//! Everything is in memory. That is a deliberate first step, not an oversight:
//! a media room is inherently tied to the process holding its UDP sockets, so
//! replicating its state buys nothing until there are several media servers.
//! When that day comes, the thing that becomes shared is the *directory*
//! (which server hosts which room) — which is why every lookup goes through
//! [`crate::manager::MediaRoomManager`] and never touches a map directly.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use genzh_media_core::events::{ParticipantInfo, RoomEvent};
use genzh_media_core::track::{ParticipantId, TrackId, TrackKind};
use genzh_media_signaling::limits::MAX_PARTICIPANTS_PER_ROOM;
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

use crate::error::{MediaRoomError, MediaRoomResult};
use crate::participant::Participant;
use crate::speakers::{ActiveSpeakers, DEFAULT_SPEAKER_LIMIT};
use crate::track::PublishedTrack;

/// Depth of the room's event bus.
///
/// Bounded like everything else: a connection that stops draining its events
/// lags and is closed, rather than pinning memory for the whole room.
const EVENT_BUS_DEPTH: usize = 256;

/// What a joining participant is automatically subscribed to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AutoSubscribe {
    /// Audio only (the default).
    ///
    /// Voice is the product: nobody joins a hangout and then asks to hear each
    /// person individually. Video is the opposite — a 20-person room must not
    /// push 19 video streams at a phone on cellular — so cameras and screen
    /// shares stay explicit, driven by what the client actually renders.
    #[default]
    AudioOnly,
    /// Everything. Convenient for small rooms and for tests.
    All,
    /// Nothing; the client subscribes to each track by hand.
    Nothing,
}

impl AutoSubscribe {
    fn includes(self, kind: TrackKind) -> bool {
        match self {
            AutoSubscribe::AudioOnly => kind.is_audio(),
            AutoSubscribe::All => true,
            AutoSubscribe::Nothing => false,
        }
    }
}

/// Room-level knobs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RoomConfig {
    /// Hard participant cap.
    pub capacity: usize,
    /// Auto-subscription policy.
    pub auto_subscribe: AutoSubscribe,
    /// How many people's audio is forwarded at once. Zero means no limit.
    ///
    /// Inert until a room grows past it, so ordinary calls are unaffected —
    /// see [`crate::speakers`] for why a big room needs one at all.
    pub speaker_limit: usize,
}

impl Default for RoomConfig {
    fn default() -> Self {
        Self {
            capacity: MAX_PARTICIPANTS_PER_ROOM,
            auto_subscribe: AutoSubscribe::default(),
            speaker_limit: DEFAULT_SPEAKER_LIMIT,
        }
    }
}

/// One live media room.
pub struct MediaRoom {
    id: Uuid,
    config: RoomConfig,
    participants: RwLock<HashMap<ParticipantId, Arc<Participant>>>,
    events: broadcast::Sender<RoomEvent>,
    /// Who is worth forwarding audio for, once the room is big enough for that
    /// to be a question.
    speakers: RwLock<ActiveSpeakers>,
    /// Monotonically increasing stamp for speaker ordering.
    ///
    /// A counter rather than a clock: the ranking only needs to know what came
    /// after what, and a counter cannot be tested against a sleeping thread.
    tick: AtomicU64,
}

impl std::fmt::Debug for MediaRoom {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MediaRoom")
            .field("room_id", &self.id)
            .finish_non_exhaustive()
    }
}

impl MediaRoom {
    /// Create an empty room.
    pub fn new(id: Uuid, config: RoomConfig) -> Arc<Self> {
        let (events, _) = broadcast::channel(EVENT_BUS_DEPTH);
        Arc::new(Self {
            id,
            config,
            participants: RwLock::new(HashMap::new()),
            events,
            speakers: RwLock::new(ActiveSpeakers::new(config.speaker_limit)),
            tick: AtomicU64::new(0),
        })
    }

    /// Record a voice-activity transition and re-apply the forwarding rule.
    ///
    /// Called on every start and stop of speech, which in a busy room is a few
    /// times a second — so the work is a sort of at most `capacity` entries and
    /// a flag write per audio track, and only the tracks whose state actually
    /// changed are touched.
    pub async fn note_speaking(&self, participant: ParticipantId, speaking: bool) {
        let tick = self.tick.fetch_add(1, Ordering::Relaxed);
        self.speakers
            .write()
            .await
            .set_speaking(participant, speaking, tick);
        self.apply_speaker_limit().await;
    }

    /// Push the current active set onto every audio track's forwarding flag.
    async fn apply_speaker_limit(&self) {
        let speakers = self.speakers.read().await;

        // Nothing to decide until the room is bigger than the limit; skipping
        // the walk keeps ordinary rooms free of this entirely.
        if speakers.len() <= self.config.speaker_limit && self.config.speaker_limit != 0 {
            return;
        }

        for participant in self.participants().await {
            let Some(track) = participant.published_track(TrackKind::Audio).await else {
                continue;
            };
            let active = speakers.is_active(participant.id());
            if track.set_forwarding(active) {
                tracing::debug!(
                    room_id = %self.id,
                    participant_id = %participant.id(),
                    active,
                    "audio forwarding toggled by the speaker limit"
                );
            }
        }
    }

    /// What every track in this room has been doing.
    ///
    /// Walks the room rather than keeping a running aggregate: it is called by
    /// an operator looking at a dashboard, not on the packet path, and a tree
    /// assembled on demand cannot drift from the tracks it describes.
    pub async fn report(&self) -> crate::stats::RoomReport {
        let mut participants = Vec::new();

        for participant in self.participants().await {
            let tracks = participant
                .published_tracks()
                .await
                .into_iter()
                .map(|track| {
                    let stats = track.stats_snapshot();
                    crate::stats::TrackReport {
                        track_id: track.id().to_string(),
                        kind: track.kind().as_str(),
                        mime_type: track.info().mime_type.clone(),
                        subscribers: track.subscriber_count(),
                        drop_rate: stats.drop_rate(),
                        stats,
                    }
                })
                .collect();

            participants.push(crate::stats::ParticipantReport {
                participant_id: participant.id().to_string(),
                display_name: participant.display_name().to_owned(),
                tracks,
            });
        }

        crate::stats::RoomReport {
            room_id: self.id.to_string(),
            participants,
        }
    }

    /// Room id, matching the control plane's `rooms.id`.
    pub fn id(&self) -> Uuid {
        self.id
    }

    /// Subscribe to this room's event stream.
    ///
    /// Each connection holds one receiver and forwards events to its socket.
    pub fn subscribe_events(&self) -> broadcast::Receiver<RoomEvent> {
        self.events.subscribe()
    }

    /// Broadcast an event. Failing to send means nobody is listening, which is
    /// normal for the last participant leaving.
    pub fn emit(&self, event: RoomEvent) {
        let _ = self.events.send(event);
    }

    /// How many participants are connected.
    pub async fn participant_count(&self) -> usize {
        self.participants.read().await.len()
    }

    /// Is the room empty and therefore ready to be destroyed?
    pub async fn is_empty(&self) -> bool {
        self.participants.read().await.is_empty()
    }

    /// Look up one participant.
    pub async fn participant(&self, id: ParticipantId) -> Option<Arc<Participant>> {
        self.participants.read().await.get(&id).cloned()
    }

    /// Every participant.
    pub async fn participants(&self) -> Vec<Arc<Participant>> {
        self.participants.read().await.values().cloned().collect()
    }

    /// Public snapshot for the `joined` payload.
    pub async fn participant_infos(&self) -> Vec<ParticipantInfo> {
        let participants = self.participants().await;
        let mut infos = Vec::with_capacity(participants.len());
        for participant in participants {
            infos.push(participant.info().await);
        }
        infos
    }

    /// Admit a participant.
    ///
    /// Returns the tracks that were auto-subscribed, so the caller can trigger
    /// exactly one renegotiation instead of one per track.
    pub async fn add_participant(
        &self,
        participant: Arc<Participant>,
    ) -> MediaRoomResult<Vec<Arc<PublishedTrack>>> {
        {
            let mut participants = self.participants.write().await;
            if participants.len() >= self.config.capacity {
                return Err(MediaRoomError::RoomFull);
            }
            if participants.contains_key(&participant.id()) {
                return Err(MediaRoomError::DuplicateParticipant(participant.id()));
            }
            participants.insert(participant.id(), participant.clone());
        }

        {
            let tick = self.tick.fetch_add(1, Ordering::Relaxed);
            self.speakers.write().await.insert(participant.id(), tick);
        }

        // Catch the newcomer up on what is already being published.
        let mut attached = Vec::new();
        for existing in self.participants().await {
            if existing.id() == participant.id() {
                continue;
            }
            for track in existing.published_tracks().await {
                if !self.config.auto_subscribe.includes(track.kind()) {
                    continue;
                }
                match participant.subscribe(track.clone()).await {
                    Ok(true) => attached.push(track),
                    Ok(false) => {}
                    // A permission failure here is not fatal: a listener who
                    // may not subscribe still belongs in the room.
                    Err(error) => {
                        tracing::debug!(
                            room_id = %self.id,
                            participant_id = %participant.id(),
                            %error,
                            "auto-subscribe skipped"
                        );
                    }
                }
            }
        }

        self.emit(RoomEvent::ParticipantJoined {
            participant: participant.info().await,
        });
        Ok(attached)
    }

    /// Remove a participant and clean up everything they touched.
    ///
    /// This is the function that must not miss anything: their published tracks
    /// have to be detached from every *other* participant's transport, and
    /// their own transport has to be closed.
    pub async fn remove_participant(&self, id: ParticipantId) -> Option<Arc<Participant>> {
        let participant = self.participants.write().await.remove(&id)?;

        // Frees their slot in the active set, which may let somebody who was
        // being held back through.
        self.speakers.write().await.remove(id);
        self.apply_speaker_limit().await;

        // 1. Everyone who was receiving this participant's media stops.
        for track in participant.published_tracks().await {
            self.detach_from_subscribers(track.id(), id).await;
            self.emit(RoomEvent::TrackUnpublished {
                participant_id: id,
                track_id: track.id().clone(),
                kind: track.kind(),
            });
        }

        // 2. This participant stops receiving anyone, and their peer
        //    connections are closed.
        participant.shutdown().await;

        self.emit(RoomEvent::ParticipantLeft { participant_id: id });
        Some(participant)
    }

    /// Register a published track and fan it out per the auto-subscribe policy.
    ///
    /// Returns the participants that were newly subscribed, so the caller can
    /// renegotiate exactly those connections.
    pub async fn publish_track(
        &self,
        publisher_id: ParticipantId,
        track: Arc<PublishedTrack>,
    ) -> MediaRoomResult<Vec<Arc<Participant>>> {
        let publisher = self
            .participant(publisher_id)
            .await
            .ok_or(MediaRoomError::ParticipantNotFound(publisher_id))?;

        let track = publisher.add_published_track(track).await?;
        self.emit(RoomEvent::TrackPublished {
            track: track.info().clone(),
        });

        // A track that appears in an already-crowded room needs the current
        // verdict applied to it, not the default of "forward everything".
        if track.kind().is_audio() {
            self.apply_speaker_limit().await;
        }

        if !self.config.auto_subscribe.includes(track.kind()) {
            return Ok(Vec::new());
        }

        let mut subscribed = Vec::new();
        for participant in self.participants().await {
            if participant.id() == publisher_id {
                continue;
            }
            match participant.subscribe(track.clone()).await {
                Ok(true) => subscribed.push(participant),
                Ok(false) => {}
                Err(error) => tracing::debug!(
                    room_id = %self.id,
                    participant_id = %participant.id(),
                    %error,
                    "auto-subscribe on publish skipped"
                ),
            }
        }

        Ok(subscribed)
    }

    /// Remove a published track.
    pub async fn unpublish_track(
        &self,
        publisher_id: ParticipantId,
        kind: TrackKind,
    ) -> MediaRoomResult<Option<TrackId>> {
        let publisher = self
            .participant(publisher_id)
            .await
            .ok_or(MediaRoomError::ParticipantNotFound(publisher_id))?;

        let Some(track) = publisher.remove_published_track(kind).await else {
            return Ok(None);
        };

        self.detach_from_subscribers(track.id(), publisher_id).await;
        self.emit(RoomEvent::TrackUnpublished {
            participant_id: publisher_id,
            track_id: track.id().clone(),
            kind,
        });

        Ok(Some(track.id().clone()))
    }

    /// Explicit subscription, as requested by a client.
    ///
    /// The track is looked up by id in the room's own registry — a client
    /// cannot conjure a track that nobody published, and cannot name a track
    /// belonging to another room.
    pub async fn subscribe(
        &self,
        subscriber_id: ParticipantId,
        track_id: &TrackId,
    ) -> MediaRoomResult<bool> {
        let subscriber = self
            .participant(subscriber_id)
            .await
            .ok_or(MediaRoomError::ParticipantNotFound(subscriber_id))?;

        let track = self
            .find_track(track_id)
            .await
            .ok_or_else(|| MediaRoomError::TrackNotFound(track_id.clone()))?;

        let attached = subscriber.subscribe(track.clone()).await?;
        if attached {
            // A late subscriber to video has no decodable frames until the
            // publisher emits an intra frame.
            track.request_keyframe();
        }
        Ok(attached)
    }

    /// Explicit unsubscription.
    pub async fn unsubscribe(
        &self,
        subscriber_id: ParticipantId,
        track_id: &TrackId,
    ) -> MediaRoomResult<bool> {
        let subscriber = self
            .participant(subscriber_id)
            .await
            .ok_or(MediaRoomError::ParticipantNotFound(subscriber_id))?;
        subscriber.unsubscribe(track_id).await
    }

    /// Find a published track anywhere in the room.
    pub async fn find_track(&self, track_id: &TrackId) -> Option<Arc<PublishedTrack>> {
        for participant in self.participants().await {
            for track in participant.published_tracks().await {
                if track.id() == track_id {
                    return Some(track);
                }
            }
        }
        None
    }

    async fn detach_from_subscribers(&self, track_id: &TrackId, publisher_id: ParticipantId) {
        for participant in self.participants().await {
            if participant.id() == publisher_id {
                continue;
            }
            if let Err(error) = participant.unsubscribe(track_id).await {
                tracing::debug!(
                    room_id = %self.id,
                    participant_id = %participant.id(),
                    %error,
                    "detach on unpublish failed"
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::participant::test_support::RecordingSink;
    use genzh_media_core::permissions::MediaPermissions;

    fn full_permissions() -> MediaPermissions {
        MediaPermissions::SUBSCRIBE
            | MediaPermissions::PUBLISH_AUDIO
            | MediaPermissions::PUBLISH_VIDEO
            | MediaPermissions::PUBLISH_SCREEN
    }

    fn member(name: &str) -> (Arc<Participant>, Arc<RecordingSink>) {
        let sink = Arc::new(RecordingSink::default());
        let p = Participant::new(
            ParticipantId::new(),
            Uuid::new_v4(),
            name,
            full_permissions(),
            sink.clone(),
        );
        (p, sink)
    }

    fn room() -> Arc<MediaRoom> {
        MediaRoom::new(Uuid::new_v4(), RoomConfig::default())
    }

    async fn publish(
        room: &MediaRoom,
        participant: &Arc<Participant>,
        kind: TrackKind,
    ) -> Arc<PublishedTrack> {
        let mime = if kind.is_audio() {
            "audio/opus"
        } else {
            "video/VP8"
        };
        let track = PublishedTrack::new(participant.id(), kind, mime, None);
        room.publish_track(participant.id(), track.clone())
            .await
            .expect("publish");
        track
    }

    #[tokio::test]
    async fn the_first_vertical_slice_two_people_hear_each_other() {
        let room = room();
        let (alice, alice_sink) = member("Alice");
        let (bob, bob_sink) = member("Bob");

        room.add_participant(alice.clone())
            .await
            .expect("alice joins");
        let alice_audio = publish(&room, &alice, TrackKind::Audio).await;

        // Bob joins after Alice is already talking and is caught up.
        room.add_participant(bob.clone()).await.expect("bob joins");
        assert_eq!(bob_sink.attached().await, vec![alice_audio.id().clone()]);

        // Bob unmutes; Alice starts receiving him.
        let bob_audio = publish(&room, &bob, TrackKind::Audio).await;
        assert_eq!(alice_sink.attached().await, vec![bob_audio.id().clone()]);

        assert_eq!(room.participant_count().await, 2);
    }

    #[tokio::test]
    async fn video_is_not_auto_subscribed_by_default() {
        let room = room();
        let (alice, _) = member("Alice");
        let (bob, bob_sink) = member("Bob");
        room.add_participant(alice.clone()).await.expect("join");
        room.add_participant(bob.clone()).await.expect("join");

        let camera = publish(&room, &alice, TrackKind::Camera).await;
        assert!(
            bob_sink.attached().await.is_empty(),
            "cellular clients must opt in to video"
        );

        // …until the client asks for it.
        assert!(
            room.subscribe(bob.id(), camera.id())
                .await
                .expect("subscribe")
        );
        assert_eq!(bob_sink.attached().await, vec![camera.id().clone()]);
    }

    #[tokio::test]
    async fn auto_subscribe_all_catches_video_too() {
        let room = MediaRoom::new(
            Uuid::new_v4(),
            RoomConfig {
                auto_subscribe: AutoSubscribe::All,
                ..RoomConfig::default()
            },
        );
        let (alice, _) = member("Alice");
        let (bob, bob_sink) = member("Bob");
        room.add_participant(alice.clone()).await.expect("join");
        room.add_participant(bob.clone()).await.expect("join");

        let camera = publish(&room, &alice, TrackKind::Camera).await;
        assert_eq!(bob_sink.attached().await, vec![camera.id().clone()]);
    }

    #[tokio::test]
    async fn unpublishing_detaches_every_subscriber_but_not_the_publisher() {
        let room = room();
        let (alice, alice_sink) = member("Alice");
        let (bob, bob_sink) = member("Bob");
        room.add_participant(alice.clone()).await.expect("join");
        room.add_participant(bob.clone()).await.expect("join");

        publish(&room, &alice, TrackKind::Audio).await;
        assert_eq!(bob_sink.attached().await.len(), 1);

        room.unpublish_track(alice.id(), TrackKind::Audio)
            .await
            .expect("unpublish");

        assert!(bob_sink.attached().await.is_empty());
        assert!(alice_sink.attached().await.is_empty());
        assert!(alice.published_tracks().await.is_empty());
        assert!(
            !alice_sink.is_closed().await,
            "unpublishing must not close the transport"
        );
    }

    #[tokio::test]
    async fn unpublishing_something_that_is_not_published_is_a_no_op() {
        let room = room();
        let (alice, _) = member("Alice");
        room.add_participant(alice.clone()).await.expect("join");
        assert_eq!(
            room.unpublish_track(alice.id(), TrackKind::ScreenShare)
                .await
                .unwrap(),
            None
        );
    }

    #[tokio::test]
    async fn screen_share_has_a_lifecycle_independent_of_the_camera() {
        let room = MediaRoom::new(
            Uuid::new_v4(),
            RoomConfig {
                auto_subscribe: AutoSubscribe::All,
                ..RoomConfig::default()
            },
        );
        let (alice, _) = member("Alice");
        let (bob, bob_sink) = member("Bob");
        room.add_participant(alice.clone()).await.expect("join");
        room.add_participant(bob.clone()).await.expect("join");

        let camera = publish(&room, &alice, TrackKind::Camera).await;
        let screen = publish(&room, &alice, TrackKind::ScreenShare).await;
        assert_eq!(bob_sink.attached().await.len(), 2);

        room.unpublish_track(alice.id(), TrackKind::ScreenShare)
            .await
            .expect("stop sharing");

        assert_eq!(bob_sink.attached().await, vec![camera.id().clone()]);
        assert!(alice.published_track(TrackKind::Camera).await.is_some());
        assert!(
            alice
                .published_track(TrackKind::ScreenShare)
                .await
                .is_none()
        );
        let _ = screen;
    }

    #[tokio::test]
    async fn leaving_removes_the_departed_from_everyone_elses_transport() {
        let room = room();
        let (alice, alice_sink) = member("Alice");
        let (bob, bob_sink) = member("Bob");
        let (sarah, sarah_sink) = member("Sarah");
        for p in [&alice, &bob, &sarah] {
            room.add_participant(p.clone()).await.expect("join");
        }

        publish(&room, &alice, TrackKind::Audio).await;
        publish(&room, &bob, TrackKind::Audio).await;
        assert_eq!(sarah_sink.attached().await.len(), 2);

        room.remove_participant(alice.id())
            .await
            .expect("alice leaves");

        assert_eq!(room.participant_count().await, 2);
        assert_eq!(
            bob_sink.attached().await.len(),
            0,
            "alice's track is gone from bob"
        );
        assert_eq!(
            sarah_sink.attached().await.len(),
            1,
            "only bob remains audible"
        );
        assert!(
            alice_sink.is_closed().await,
            "alice's own transport is closed"
        );
    }

    #[tokio::test]
    async fn a_room_becomes_empty_after_the_last_departure() {
        let room = room();
        let (alice, _) = member("Alice");
        room.add_participant(alice.clone()).await.expect("join");
        assert!(!room.is_empty().await);

        room.remove_participant(alice.id()).await.expect("leave");
        assert!(room.is_empty().await);
        assert!(
            room.remove_participant(alice.id()).await.is_none(),
            "leaving twice is a no-op"
        );
    }

    #[tokio::test]
    async fn capacity_is_enforced() {
        let room = MediaRoom::new(
            Uuid::new_v4(),
            RoomConfig {
                capacity: 2,
                ..RoomConfig::default()
            },
        );
        let (a, _) = member("A");
        let (b, _) = member("B");
        let (c, _) = member("C");

        room.add_participant(a).await.expect("first");
        room.add_participant(b).await.expect("second");
        assert!(matches!(
            room.add_participant(c).await,
            Err(MediaRoomError::RoomFull)
        ));
    }

    #[tokio::test]
    async fn the_same_participant_id_cannot_connect_twice() {
        let room = room();
        let (alice, _) = member("Alice");
        room.add_participant(alice.clone()).await.expect("first");
        assert!(matches!(
            room.add_participant(alice.clone()).await,
            Err(MediaRoomError::DuplicateParticipant(_))
        ));
    }

    #[tokio::test]
    async fn subscribing_to_an_unknown_track_is_rejected() {
        let room = room();
        let (bob, _) = member("Bob");
        room.add_participant(bob.clone()).await.expect("join");

        let phantom = TrackId::for_participant(ParticipantId::new(), TrackKind::Audio);
        assert!(matches!(
            room.subscribe(bob.id(), &phantom).await,
            Err(MediaRoomError::TrackNotFound(_))
        ));
    }

    #[tokio::test]
    async fn a_participant_that_left_cannot_subscribe() {
        let room = room();
        let (alice, _) = member("Alice");
        let (bob, _) = member("Bob");
        room.add_participant(alice.clone()).await.expect("join");
        room.add_participant(bob.clone()).await.expect("join");
        let track = publish(&room, &alice, TrackKind::Camera).await;

        room.remove_participant(bob.id()).await.expect("bob leaves");
        assert!(matches!(
            room.subscribe(bob.id(), track.id()).await,
            Err(MediaRoomError::ParticipantNotFound(_))
        ));
    }

    #[tokio::test]
    async fn events_are_broadcast_in_lifecycle_order() {
        let room = room();
        let mut events = room.subscribe_events();

        let (alice, _) = member("Alice");
        room.add_participant(alice.clone()).await.expect("join");
        publish(&room, &alice, TrackKind::Audio).await;
        room.unpublish_track(alice.id(), TrackKind::Audio)
            .await
            .expect("unpublish");
        room.remove_participant(alice.id()).await.expect("leave");

        let mut seen = Vec::new();
        while let Ok(event) = events.try_recv() {
            seen.push(match event {
                RoomEvent::ParticipantJoined { .. } => "joined",
                RoomEvent::TrackPublished { .. } => "published",
                RoomEvent::TrackUnpublished { .. } => "unpublished",
                RoomEvent::ParticipantLeft { .. } => "left",
                _ => "other",
            });
        }
        assert_eq!(seen, vec!["joined", "published", "unpublished", "left"]);
    }
}
