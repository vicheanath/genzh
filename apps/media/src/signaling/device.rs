//! Mute, camera, screen share, speaking.
//!
//! These are *presentation* state: what the client says it is doing, mirrored
//! to everyone else so the UI agrees. They are not enforcement — permission is
//! checked when a track is published, not when a flag flips — and keeping that
//! distinction in one file is why it stays true.
//!
//! Two of them do have a side effect on the transport, and it is not obvious:
//! turning a camera or a screen share *off* unpublishes the track even if the
//! client never renegotiates. Without that, the kind stays registered as
//! published and the next publish of it is rejected — which would make the
//! toggle work exactly once.

use genzh_media_core::events::RoomEvent;
use genzh_media_core::track::TrackKind;
use genzh_media_core::vad::VadMode;

use crate::error::MediaError;

use super::session::Session;

impl Session {
    /// The client muted or unmuted its own microphone.
    pub(super) async fn set_muted(&mut self, muted: bool) -> Result<(), MediaError> {
        let participant_id = self.participant_id();

        self.participant()
            .update_state(|s| {
                s.audio_muted = muted;
                s.muted_by_moderator = false;
                if muted {
                    // A muted participant is not speaking, whatever the last
                    // VAD sample said.
                    s.speaking = false;
                }
            })
            .await;

        self.room().emit(if muted {
            RoomEvent::MicrophoneMuted {
                participant_id,
                by_moderator: false,
            }
        } else {
            RoomEvent::MicrophoneUnmuted { participant_id }
        });
        Ok(())
    }

    /// The client turned its camera on or off.
    pub(super) async fn set_camera(&mut self, enabled: bool) -> Result<(), MediaError> {
        self.set_video_source(TrackKind::Camera, enabled).await
    }

    /// The client started or stopped sharing its screen.
    pub(super) async fn set_screen_share(&mut self, enabled: bool) -> Result<(), MediaError> {
        self.set_video_source(TrackKind::ScreenShare, enabled).await
    }

    /// Toggle one video source: flag, event, and — when turning off — the track.
    ///
    /// Camera and screen share differ only in which flag and which pair of
    /// events they use, so they share the part that is easy to get wrong.
    async fn set_video_source(
        &mut self,
        kind: TrackKind,
        enabled: bool,
    ) -> Result<(), MediaError> {
        let participant_id = self.participant_id();

        self.participant()
            .update_state(|s| match kind {
                TrackKind::Camera => s.camera_enabled = enabled,
                TrackKind::ScreenShare => s.screen_sharing = enabled,
                TrackKind::Audio => {}
            })
            .await;

        self.room().emit(match (kind, enabled) {
            (TrackKind::ScreenShare, true) => RoomEvent::ScreenShareStarted { participant_id },
            (TrackKind::ScreenShare, false) => RoomEvent::ScreenShareStopped { participant_id },
            (_, true) => RoomEvent::CameraEnabled { participant_id },
            (_, false) => RoomEvent::CameraDisabled { participant_id },
        });

        // See the module docs: the track has to go even if the client never
        // renegotiates, or the next publish of this kind is rejected.
        if !enabled {
            let _ = self.room().unpublish_track(participant_id, kind).await;
        }
        Ok(())
    }

    /// The client reported its own voice activity.
    ///
    /// Honoured only when the server is not deriving this itself. Otherwise a
    /// client could claim the speaking ring at will.
    pub(super) async fn report_speaking(&mut self, speaking: bool) -> Result<(), MediaError> {
        if self.server().config.vad_mode == VadMode::ClientReported {
            self.set_speaking(speaking).await;
        }
        Ok(())
    }

    /// Update and broadcast speaking state, but only on a change.
    ///
    /// The single point both VAD sources funnel through — the server-side
    /// detector in the publisher pump, and the client's own report — so the
    /// "only on a transition" and "never while muted" rules cannot diverge
    /// between them.
    pub(super) async fn set_speaking(&mut self, speaking: bool) {
        let participant_id = self.participant_id();
        let before = self.participant().state().await;

        if before.speaking == speaking {
            return;
        }
        // A muted participant never lights up, whatever the source claims.
        if speaking && before.audio_muted {
            return;
        }

        self.participant()
            .update_state(|s| s.speaking = speaking)
            .await;

        // The room decides whose audio is still worth forwarding once it is
        // big enough for that to be a question.
        self.room().note_speaking(participant_id, speaking).await;

        self.room().emit(if speaking {
            RoomEvent::SpeakingStarted { participant_id }
        } else {
            RoomEvent::SpeakingStopped { participant_id }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::signaling::session::test_support::SharedSink;
    use crate::signaling::session::Session;
    use genzh_media_core::permissions::MediaPermissions;
    use genzh_media_core::track::ParticipantId;
    use genzh_media_room::room::RoomConfig;
    use genzh_media_room::transport::test_support::FakeTransport;
    use genzh_media_room::{MediaRoom, Participant, ParticipantTransport};
    use std::sync::Arc;

    /// A session with a real room and participant, and a fake socket and
    /// transport — everything the device rules actually touch.
    fn session() -> (Session, SharedSink, Arc<MediaRoom>, Arc<Participant>) {
        session_with_vad(VadMode::default())
    }

    /// The same, over a server running a particular voice-activity detector.
    fn session_with_vad(
        vad_mode: VadMode,
    ) -> (Session, SharedSink, Arc<MediaRoom>, Arc<Participant>) {
        let room = MediaRoom::new(uuid::Uuid::new_v4(), RoomConfig::default());
        let transport = FakeTransport::new();
        let participant = Participant::new(
            ParticipantId::new(),
            uuid::Uuid::new_v4(),
            "Tester",
            MediaPermissions::all(),
            transport.sink(),
        );
        let sink = SharedSink::default();
        let session = Session::for_test_on(
            crate::state::MediaState::for_test_with_vad(vad_mode),
            Box::new(sink.clone()),
            room.clone(),
            participant.clone(),
            transport,
        );
        (session, sink, room, participant)
    }

    #[tokio::test]
    async fn unmuting_announces_it_to_the_room() {
        let (mut session, _sink, room, participant) = session();
        let mut events = room.subscribe_events();

        session.set_muted(false).await.expect("unmute");

        assert!(!participant.state().await.audio_muted);
        assert!(matches!(
            events.recv().await.expect("event"),
            RoomEvent::MicrophoneUnmuted { .. }
        ));
    }

    #[tokio::test]
    async fn muting_stops_the_speaking_ring_immediately() {
        let (mut session, _sink, _room, participant) = session();
        session.set_muted(false).await.expect("unmute");
        session.set_speaking(true).await;
        assert!(participant.state().await.speaking);

        session.set_muted(true).await.expect("mute");

        assert!(
            !participant.state().await.speaking,
            "a muted participant must not be left lit up"
        );
    }

    #[tokio::test]
    async fn a_muted_participant_never_lights_up() {
        let (mut session, _sink, _room, participant) = session();
        // Participants join muted, so this is the default state.
        assert!(participant.state().await.audio_muted);

        session.set_speaking(true).await;

        assert!(
            !participant.state().await.speaking,
            "voice activity while muted must be ignored, whatever reported it"
        );
    }

    #[tokio::test]
    async fn only_a_change_in_speaking_is_announced() {
        let (mut session, _sink, room, _participant) = session();
        session.set_muted(false).await.expect("unmute");
        let mut events = room.subscribe_events();

        session.set_speaking(true).await;
        session.set_speaking(true).await;
        session.set_speaking(true).await;

        assert!(matches!(
            events.recv().await.expect("event"),
            RoomEvent::SpeakingStarted { .. }
        ));
        assert!(
            events.try_recv().is_err(),
            "repeating the same state must not re-announce it"
        );
    }

    #[tokio::test]
    async fn a_client_reported_speaking_claim_is_ignored_under_server_vad() {
        let (mut session, _sink, _room, participant) =
            session_with_vad(VadMode::ServerAudioLevel);
        session.set_muted(false).await.expect("unmute");

        session.report_speaking(true).await.expect("report");

        assert!(
            !participant.state().await.speaking,
            "when the server derives voice activity, a client must not be able \
             to claim the speaking ring at will"
        );
    }

    #[tokio::test]
    async fn a_client_reported_speaking_claim_is_honoured_when_it_is_the_source() {
        let (mut session, _sink, _room, participant) = session_with_vad(VadMode::ClientReported);
        session.set_muted(false).await.expect("unmute");

        session.report_speaking(true).await.expect("report");

        assert!(
            participant.state().await.speaking,
            "with no server-side detector, the client's report is all there is"
        );
    }

    #[tokio::test]
    async fn turning_a_camera_off_unpublishes_its_track() {
        use genzh_media_room::PublishedTrack;

        let (mut session, _sink, room, participant) = session();
        room.add_participant(participant.clone())
            .await
            .expect("join");

        let track = PublishedTrack::new(
            participant.id(),
            TrackKind::Camera,
            "video/VP8",
            None,
        );
        room.publish_track(participant.id(), track)
            .await
            .expect("publish");
        session.set_camera(true).await.expect("camera on");

        session.set_camera(false).await.expect("camera off");

        // Without this the kind stays registered and the *next* publish is
        // rejected, so the toggle would work exactly once.
        assert!(
            participant.published_track(TrackKind::Camera).await.is_none(),
            "the track must go even though the client never renegotiated"
        );
    }

    #[tokio::test]
    async fn a_screen_share_has_its_own_flag_and_events() {
        let (mut session, _sink, room, participant) = session();
        let mut events = room.subscribe_events();

        session.set_screen_share(true).await.expect("share");

        let state = participant.state().await;
        assert!(state.screen_sharing);
        assert!(
            !state.camera_enabled,
            "sharing a screen must not claim the camera flag"
        );
        assert!(matches!(
            events.recv().await.expect("event"),
            RoomEvent::ScreenShareStarted { .. }
        ));
    }
}
