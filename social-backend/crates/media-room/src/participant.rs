//! The participant model.
//!
//! A participant is split in two on purpose:
//!
//! * [`Participant`] — identity, permissions, published tracks, subscriptions
//!   and the mute/camera/screen flags. Pure bookkeeping.
//! * [`SubscriberSink`] — the transport that actually delivers other people's
//!   media to this participant.
//!
//! The split is the one abstraction in this crate that earns its keep. It lets
//! the entire room lifecycle — join, publish, subscribe, unpublish, leave,
//! destroy — be exercised in unit tests with no UDP sockets, no DTLS handshake
//! and no timing, while production plugs in the real peer connection. Without
//! it, "does leaving a room detach every subscriber?" would only be answerable
//! by hand with two browsers.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use social_media_core::permissions::MediaPermissions;
use social_media_core::track::{ParticipantId, TrackId, TrackInfo, TrackKind};
use social_media_signaling::limits::MAX_TRACKS_PER_PARTICIPANT;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::error::{MediaRoomError, MediaRoomResult};
use crate::track::PublishedTrack;

/// Where a participant's transport is in its lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ConnectionState {
    /// Signalling has started, ICE has not completed.
    #[default]
    Connecting,
    /// Media is flowing.
    Connected,
    /// Temporarily lost; ICE may still recover it.
    Reconnecting,
    /// Gone for good.
    Closed,
}

/// Mute/camera/screen flags, as reported by the participant.
///
/// These are *presentation* state, not enforcement. A muted participant is
/// expected to stop sending, but the server does not rely on that: permission
/// checks happen when the track is published, not when the flag flips.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MediaState {
    /// Microphone muted.
    pub audio_muted: bool,
    /// True when a moderator, rather than the participant, muted them.
    pub muted_by_moderator: bool,
    /// Camera on.
    pub camera_enabled: bool,
    /// Screen share running.
    pub screen_sharing: bool,
    /// Currently talking, per whichever VAD is configured.
    pub speaking: bool,
    /// Transport state.
    pub connection: ConnectionState,
}

impl Default for MediaState {
    fn default() -> Self {
        Self {
            audio_muted: true, // join muted; unmuting is an explicit act
            muted_by_moderator: false,
            camera_enabled: false,
            screen_sharing: false,
            speaking: false,
            connection: ConnectionState::Connecting,
        }
    }
}

/// Delivers other participants' media to one participant.
///
/// Implemented by [`crate::sfu::WebRtcSubscriberSink`] in production and by a
/// recording double in tests.
#[async_trait]
pub trait SubscriberSink: Send + Sync + 'static {
    /// Start delivering `track`.
    ///
    /// Must be idempotent: a client may legitimately ask to subscribe to a
    /// track it is already receiving after a reconnect.
    async fn attach(&self, track: Arc<PublishedTrack>) -> MediaRoomResult<()>;

    /// Stop delivering the named track. Detaching something not attached is
    /// not an error, for the same reason.
    async fn detach(&self, track_id: &TrackId) -> MediaRoomResult<()>;

    /// Tear down the transport. Called exactly once, when the participant
    /// leaves.
    async fn close(&self);
}

/// A sink that drops everything. Used for participants that are connected for
/// signalling only, and as the default before a transport is attached.
pub struct NullSink;

#[async_trait]
impl SubscriberSink for NullSink {
    async fn attach(&self, _track: Arc<PublishedTrack>) -> MediaRoomResult<()> {
        Ok(())
    }

    async fn detach(&self, _track_id: &TrackId) -> MediaRoomResult<()> {
        Ok(())
    }

    async fn close(&self) {}
}

/// One connected participant.
pub struct Participant {
    id: ParticipantId,
    user_id: Uuid,
    display_name: String,
    permissions: MediaPermissions,
    sink: Arc<dyn SubscriberSink>,
    state: RwLock<MediaState>,
    published: RwLock<HashMap<TrackKind, Arc<PublishedTrack>>>,
    subscriptions: RwLock<HashMap<TrackId, Arc<PublishedTrack>>>,
}

impl std::fmt::Debug for Participant {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Participant")
            .field("participant_id", &self.id)
            .field("user_id", &self.user_id)
            .finish_non_exhaustive()
    }
}

impl Participant {
    /// Build a participant from an already-verified media token.
    pub fn new(
        id: ParticipantId,
        user_id: Uuid,
        display_name: impl Into<String>,
        permissions: MediaPermissions,
        sink: Arc<dyn SubscriberSink>,
    ) -> Arc<Self> {
        Arc::new(Self {
            id,
            user_id,
            display_name: display_name.into(),
            permissions,
            sink,
            state: RwLock::new(MediaState::default()),
            published: RwLock::new(HashMap::new()),
            subscriptions: RwLock::new(HashMap::new()),
        })
    }

    /// Session-scoped id.
    pub fn id(&self) -> ParticipantId {
        self.id
    }

    /// Owning account.
    pub fn user_id(&self) -> Uuid {
        self.user_id
    }

    /// Display name captured at token-mint time.
    pub fn display_name(&self) -> &str {
        &self.display_name
    }

    /// Capabilities granted by the token.
    pub fn permissions(&self) -> MediaPermissions {
        self.permissions
    }

    /// Current flags.
    pub async fn state(&self) -> MediaState {
        *self.state.read().await
    }

    /// Mutate the flags under the lock.
    pub async fn update_state(&self, f: impl FnOnce(&mut MediaState)) -> MediaState {
        let mut state = self.state.write().await;
        f(&mut state);
        *state
    }

    /// Everything this participant publishes.
    pub async fn published_tracks(&self) -> Vec<Arc<PublishedTrack>> {
        self.published.read().await.values().cloned().collect()
    }

    /// A specific published track, by kind.
    pub async fn published_track(&self, kind: TrackKind) -> Option<Arc<PublishedTrack>> {
        self.published.read().await.get(&kind).cloned()
    }

    /// Register a new published track.
    ///
    /// Enforces the permission for that kind *here* rather than at the
    /// signalling edge, so there is exactly one place a track can enter the
    /// room and exactly one place the check can be forgotten.
    pub async fn add_published_track(
        &self,
        track: Arc<PublishedTrack>,
    ) -> MediaRoomResult<Arc<PublishedTrack>> {
        let kind = track.kind();

        if !self.permissions.may_publish(kind) {
            return Err(MediaRoomError::PublishDenied(kind));
        }

        let mut published = self.published.write().await;
        if published.len() >= MAX_TRACKS_PER_PARTICIPANT && !published.contains_key(&kind) {
            return Err(MediaRoomError::TooManyTracks);
        }
        if published.contains_key(&kind) {
            return Err(MediaRoomError::AlreadyPublishing(kind));
        }

        published.insert(kind, track.clone());
        Ok(track)
    }

    /// Remove a published track, returning it if it existed.
    pub async fn remove_published_track(&self, kind: TrackKind) -> Option<Arc<PublishedTrack>> {
        self.published.write().await.remove(&kind)
    }

    /// Everything this participant is receiving.
    pub async fn subscriptions(&self) -> Vec<TrackId> {
        self.subscriptions.read().await.keys().cloned().collect()
    }

    /// Is this participant receiving `track_id`?
    pub async fn is_subscribed(&self, track_id: &TrackId) -> bool {
        self.subscriptions.read().await.contains_key(track_id)
    }

    /// Start receiving a track.
    ///
    /// Returns `false` when the subscription already existed, so callers can
    /// skip the renegotiation that would otherwise follow.
    pub async fn subscribe(&self, track: Arc<PublishedTrack>) -> MediaRoomResult<bool> {
        if !self.permissions.may_subscribe() {
            return Err(MediaRoomError::SubscribeDenied);
        }
        if track.publisher() == self.id {
            // Never loop a participant's own audio back to them.
            return Ok(false);
        }

        {
            let subscriptions = self.subscriptions.read().await;
            if subscriptions.contains_key(track.id()) {
                return Ok(false);
            }
        }

        self.sink.attach(track.clone()).await?;
        self.subscriptions.write().await.insert(track.id().clone(), track);
        Ok(true)
    }

    /// Stop receiving a track. Returns `false` when there was nothing to do.
    pub async fn unsubscribe(&self, track_id: &TrackId) -> MediaRoomResult<bool> {
        let existed = self.subscriptions.write().await.remove(track_id).is_some();
        if existed {
            self.sink.detach(track_id).await?;
        }
        Ok(existed)
    }

    /// Tear down every subscription and close the transport.
    ///
    /// Called once on departure. Detaching before closing means the transport
    /// sees a clean removal of each track rather than inferring it from a
    /// closed connection.
    pub async fn shutdown(&self) {
        let track_ids: Vec<TrackId> = self.subscriptions.write().await.drain().map(|(k, _)| k).collect();
        for track_id in &track_ids {
            if let Err(error) = self.sink.detach(track_id).await {
                tracing::debug!(%track_id, %error, "detach during shutdown failed");
            }
        }
        self.published.write().await.clear();
        self.update_state(|s| s.connection = ConnectionState::Closed).await;
        self.sink.close().await;
    }

    /// Public view for participant lists and join payloads.
    pub async fn info(&self) -> social_media_core::events::ParticipantInfo {
        let state = self.state().await;
        let tracks: Vec<TrackInfo> =
            self.published.read().await.values().map(|t| t.info().clone()).collect();

        social_media_core::events::ParticipantInfo {
            participant_id: self.id,
            user_id: self.user_id,
            display_name: self.display_name.clone(),
            tracks,
            audio_muted: state.audio_muted,
            camera_enabled: state.camera_enabled,
            screen_sharing: state.screen_sharing,
        }
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    //! A [`SubscriberSink`] that records what it was asked to do.

    use super::*;
    use tokio::sync::Mutex;

    /// One thing that happened to a sink.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum SinkCall {
        /// `attach` was called with this track.
        Attach(TrackId),
        /// `detach` was called with this track.
        Detach(TrackId),
        /// `close` was called.
        Close,
    }

    /// Test double for a participant's transport.
    #[derive(Default)]
    pub struct RecordingSink {
        calls: Mutex<Vec<SinkCall>>,
    }

    impl RecordingSink {
        /// Everything that has happened so far, in order.
        pub async fn calls(&self) -> Vec<SinkCall> {
            self.calls.lock().await.clone()
        }

        /// Tracks currently attached, in attach order.
        pub async fn attached(&self) -> Vec<TrackId> {
            let calls = self.calls.lock().await;
            let mut live: Vec<TrackId> = Vec::new();
            for call in calls.iter() {
                match call {
                    SinkCall::Attach(id) => live.push(id.clone()),
                    SinkCall::Detach(id) => live.retain(|t| t != id),
                    SinkCall::Close => live.clear(),
                }
            }
            live
        }

        /// Has `close` been called?
        pub async fn is_closed(&self) -> bool {
            self.calls.lock().await.contains(&SinkCall::Close)
        }
    }

    #[async_trait]
    impl SubscriberSink for RecordingSink {
        async fn attach(&self, track: Arc<PublishedTrack>) -> MediaRoomResult<()> {
            self.calls.lock().await.push(SinkCall::Attach(track.id().clone()));
            Ok(())
        }

        async fn detach(&self, track_id: &TrackId) -> MediaRoomResult<()> {
            self.calls.lock().await.push(SinkCall::Detach(track_id.clone()));
            Ok(())
        }

        async fn close(&self) {
            self.calls.lock().await.push(SinkCall::Close);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::*;
    use super::*;

    fn speaker_sink() -> (Arc<Participant>, Arc<RecordingSink>) {
        let sink = Arc::new(RecordingSink::default());
        let p = Participant::new(
            ParticipantId::new(),
            Uuid::new_v4(),
            "Ada",
            MediaPermissions::SUBSCRIBE
                | MediaPermissions::PUBLISH_AUDIO
                | MediaPermissions::PUBLISH_VIDEO,
            sink.clone(),
        );
        (p, sink)
    }

    #[tokio::test]
    async fn participants_join_muted() {
        let (p, _) = speaker_sink();
        let state = p.state().await;
        assert!(state.audio_muted, "joining unmuted would be a privacy bug");
        assert!(!state.camera_enabled);
        assert!(!state.screen_sharing);
        assert_eq!(state.connection, ConnectionState::Connecting);
    }

    #[tokio::test]
    async fn publishing_requires_the_matching_permission() {
        let (p, _) = speaker_sink();

        let audio = PublishedTrack::new(p.id(), TrackKind::Audio, "audio/opus", None);
        assert!(p.add_published_track(audio).await.is_ok());

        // The fixture grants audio and camera but not screen share.
        let screen = PublishedTrack::new(p.id(), TrackKind::ScreenShare, "video/VP8", None);
        assert!(matches!(
            p.add_published_track(screen).await,
            Err(MediaRoomError::PublishDenied(TrackKind::ScreenShare))
        ));
    }

    #[tokio::test]
    async fn a_second_track_of_the_same_kind_is_rejected() {
        let (p, _) = speaker_sink();
        let first = PublishedTrack::new(p.id(), TrackKind::Audio, "audio/opus", None);
        let second = PublishedTrack::new(p.id(), TrackKind::Audio, "audio/opus", None);

        p.add_published_track(first).await.expect("first");
        assert!(matches!(
            p.add_published_track(second).await,
            Err(MediaRoomError::AlreadyPublishing(TrackKind::Audio))
        ));
    }

    #[tokio::test]
    async fn republishing_after_removal_is_allowed() {
        let (p, _) = speaker_sink();
        let track = PublishedTrack::new(p.id(), TrackKind::Camera, "video/VP8", None);
        p.add_published_track(track).await.expect("publish");

        assert!(p.remove_published_track(TrackKind::Camera).await.is_some());
        assert!(p.remove_published_track(TrackKind::Camera).await.is_none());

        let again = PublishedTrack::new(p.id(), TrackKind::Camera, "video/VP8", None);
        assert!(p.add_published_track(again).await.is_ok());
    }

    #[tokio::test]
    async fn subscribing_attaches_exactly_once() {
        let (bob, sink) = speaker_sink();
        let alice = ParticipantId::new();
        let track = PublishedTrack::new(alice, TrackKind::Audio, "audio/opus", None);

        assert!(bob.subscribe(track.clone()).await.expect("subscribe"));
        assert!(!bob.subscribe(track.clone()).await.expect("idempotent"), "already subscribed");

        assert_eq!(sink.attached().await, vec![track.id().clone()]);
        assert!(bob.is_subscribed(track.id()).await);
    }

    #[tokio::test]
    async fn a_participant_never_subscribes_to_their_own_track() {
        let (alice, sink) = speaker_sink();
        let own = PublishedTrack::new(alice.id(), TrackKind::Audio, "audio/opus", None);

        assert!(!alice.subscribe(own).await.expect("no-op"));
        assert!(sink.attached().await.is_empty(), "loopback would echo the speaker");
    }

    #[tokio::test]
    async fn a_listener_cannot_subscribe_without_the_permission() {
        let sink = Arc::new(RecordingSink::default());
        let muted_out = Participant::new(
            ParticipantId::new(),
            Uuid::new_v4(),
            "Blocked",
            MediaPermissions::empty(),
            sink.clone(),
        );

        let track = PublishedTrack::new(ParticipantId::new(), TrackKind::Audio, "audio/opus", None);
        assert!(matches!(
            muted_out.subscribe(track).await,
            Err(MediaRoomError::SubscribeDenied)
        ));
        assert!(sink.attached().await.is_empty());
    }

    #[tokio::test]
    async fn unsubscribing_detaches_and_is_idempotent() {
        let (bob, sink) = speaker_sink();
        let track = PublishedTrack::new(ParticipantId::new(), TrackKind::Camera, "video/VP8", None);

        bob.subscribe(track.clone()).await.expect("subscribe");
        assert!(bob.unsubscribe(track.id()).await.expect("unsubscribe"));
        assert!(!bob.unsubscribe(track.id()).await.expect("idempotent"));

        assert!(sink.attached().await.is_empty());
        assert!(!bob.is_subscribed(track.id()).await);
    }

    #[tokio::test]
    async fn shutdown_detaches_everything_and_closes_the_transport() {
        let (bob, sink) = speaker_sink();
        let a = PublishedTrack::new(ParticipantId::new(), TrackKind::Audio, "audio/opus", None);
        let b = PublishedTrack::new(ParticipantId::new(), TrackKind::Camera, "video/VP8", None);
        bob.subscribe(a).await.expect("subscribe a");
        bob.subscribe(b).await.expect("subscribe b");

        let own = PublishedTrack::new(bob.id(), TrackKind::Audio, "audio/opus", None);
        bob.add_published_track(own).await.expect("publish");

        bob.shutdown().await;

        assert!(sink.attached().await.is_empty(), "every subscription must be detached");
        assert!(sink.is_closed().await, "transport must be closed");
        assert!(bob.subscriptions().await.is_empty());
        assert!(bob.published_tracks().await.is_empty());
        assert_eq!(bob.state().await.connection, ConnectionState::Closed);
    }

    #[tokio::test]
    async fn shutdown_detaches_before_it_closes() {
        // Ordering matters: the transport should see each track removed
        // explicitly rather than having to infer it from a dead connection.
        let (bob, sink) = speaker_sink();
        let track = PublishedTrack::new(ParticipantId::new(), TrackKind::Audio, "audio/opus", None);
        bob.subscribe(track.clone()).await.expect("subscribe");

        bob.shutdown().await;

        assert_eq!(
            sink.calls().await,
            vec![
                SinkCall::Attach(track.id().clone()),
                SinkCall::Detach(track.id().clone()),
                SinkCall::Close,
            ]
        );
    }

    #[tokio::test]
    async fn info_reflects_published_tracks_and_flags() {
        let (p, _) = speaker_sink();
        let track = PublishedTrack::new(p.id(), TrackKind::Camera, "video/VP8", None);
        p.add_published_track(track).await.expect("publish");
        p.update_state(|s| {
            s.audio_muted = false;
            s.camera_enabled = true;
        })
        .await;

        let info = p.info().await;
        assert_eq!(info.participant_id, p.id());
        assert_eq!(info.display_name, "Ada");
        assert_eq!(info.tracks.len(), 1);
        assert_eq!(info.tracks[0].kind, TrackKind::Camera);
        assert!(!info.audio_muted);
        assert!(info.camera_enabled);
        assert!(!info.screen_sharing);
    }
}
