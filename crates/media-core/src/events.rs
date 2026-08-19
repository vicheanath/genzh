//! Realtime room events.
//!
//! These are the facts the media server broadcasts to everyone in a room:
//! who arrived, who is publishing what, who is talking. They are **ephemeral
//! by design** and never written to PostgreSQL — a speaking indicator that
//! flips several times a second is worthless a minute later, and persisting it
//! would put the media plane back on the database's critical path.
//!
//! Events travel over the same signalling WebSocket as offers and answers, so
//! ordering with respect to negotiation is preserved: a client always learns a
//! track exists before it is asked to renegotiate for it.

use serde::{Deserialize, Serialize};

use crate::track::{ParticipantId, TrackId, TrackInfo, TrackKind};

/// A participant as seen by everyone else in the room.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParticipantInfo {
    /// Session-scoped participant id.
    pub participant_id: ParticipantId,
    /// Owning account, so clients can link to a profile.
    pub user_id: uuid::Uuid,
    /// Display name captured when the token was minted.
    pub display_name: String,
    /// Tracks this participant is currently publishing.
    pub tracks: Vec<TrackInfo>,
    /// Microphone muted (either by the user or by a moderator).
    pub audio_muted: bool,
    /// Camera on.
    pub camera_enabled: bool,
    /// Screen share running.
    pub screen_sharing: bool,
}

/// Something that happened in a media room.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum RoomEvent {
    /// Someone joined.
    ParticipantJoined {
        /// The new participant, including any tracks they already publish.
        participant: ParticipantInfo,
    },

    /// Someone left or dropped.
    ParticipantLeft {
        /// Who left.
        participant_id: ParticipantId,
    },

    /// A new track is available to subscribe to.
    TrackPublished {
        /// The track.
        track: TrackInfo,
    },

    /// A track went away.
    TrackUnpublished {
        /// Publisher.
        participant_id: ParticipantId,
        /// Track that ended.
        track_id: TrackId,
        /// What it carried, so clients can tear down the right UI.
        kind: TrackKind,
    },

    /// Voice activity started. Drives the animated avatar ring in the client.
    SpeakingStarted {
        /// Who started talking.
        participant_id: ParticipantId,
    },

    /// Voice activity stopped.
    SpeakingStopped {
        /// Who stopped talking.
        participant_id: ParticipantId,
    },

    /// Microphone muted.
    MicrophoneMuted {
        /// Whose microphone.
        participant_id: ParticipantId,
        /// True when a moderator did it rather than the participant.
        by_moderator: bool,
    },

    /// Microphone unmuted.
    MicrophoneUnmuted {
        /// Whose microphone.
        participant_id: ParticipantId,
    },

    /// Camera turned on.
    CameraEnabled {
        /// Whose camera.
        participant_id: ParticipantId,
    },

    /// Camera turned off.
    CameraDisabled {
        /// Whose camera.
        participant_id: ParticipantId,
    },

    /// Screen share started.
    ScreenShareStarted {
        /// Who is sharing.
        participant_id: ParticipantId,
    },

    /// Screen share stopped.
    ScreenShareStopped {
        /// Who stopped sharing.
        participant_id: ParticipantId,
    },
}

impl RoomEvent {
    /// The participant an event is about, for log correlation.
    pub fn subject(&self) -> ParticipantId {
        match self {
            RoomEvent::ParticipantJoined { participant } => participant.participant_id,
            RoomEvent::TrackPublished { track } => track.participant_id,
            RoomEvent::ParticipantLeft { participant_id }
            | RoomEvent::TrackUnpublished { participant_id, .. }
            | RoomEvent::SpeakingStarted { participant_id }
            | RoomEvent::SpeakingStopped { participant_id }
            | RoomEvent::MicrophoneMuted { participant_id, .. }
            | RoomEvent::MicrophoneUnmuted { participant_id }
            | RoomEvent::CameraEnabled { participant_id }
            | RoomEvent::CameraDisabled { participant_id }
            | RoomEvent::ScreenShareStarted { participant_id }
            | RoomEvent::ScreenShareStopped { participant_id } => *participant_id,
        }
    }

    /// Speaking events fire many times a minute per participant. Marking them
    /// lets the transport drop them under back-pressure while never dropping a
    /// join or a track announcement, which clients cannot re-derive.
    pub fn is_droppable(&self) -> bool {
        matches!(
            self,
            RoomEvent::SpeakingStarted { .. } | RoomEvent::SpeakingStopped { .. }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_are_tagged_for_the_client() {
        let event = RoomEvent::SpeakingStarted {
            participant_id: ParticipantId::new(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "speaking_started");
    }

    #[test]
    fn only_speaking_events_may_be_dropped() {
        let p = ParticipantId::new();
        assert!(RoomEvent::SpeakingStarted { participant_id: p }.is_droppable());
        assert!(RoomEvent::SpeakingStopped { participant_id: p }.is_droppable());
        assert!(!RoomEvent::ParticipantLeft { participant_id: p }.is_droppable());
        assert!(
            !RoomEvent::TrackUnpublished {
                participant_id: p,
                track_id: TrackId::for_participant(p, TrackKind::Camera),
                kind: TrackKind::Camera,
            }
            .is_droppable()
        );
    }

    #[test]
    fn every_event_names_its_subject() {
        let p = ParticipantId::new();
        let events = [
            RoomEvent::ParticipantLeft { participant_id: p },
            RoomEvent::MicrophoneMuted {
                participant_id: p,
                by_moderator: true,
            },
            RoomEvent::CameraEnabled { participant_id: p },
            RoomEvent::ScreenShareStopped { participant_id: p },
            RoomEvent::TrackPublished {
                track: TrackInfo {
                    track_id: TrackId::for_participant(p, TrackKind::Audio),
                    participant_id: p,
                    kind: TrackKind::Audio,
                    mime_type: "audio/opus".into(),
                    muted: false,
                },
            },
        ];
        for event in events {
            assert_eq!(event.subject(), p);
        }
    }
}
