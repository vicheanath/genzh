//! Track identity and kinds.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// What a track carries.
///
/// A screen share is *not* a special transport — it is a second video track
/// with its own lifecycle. Modelling it as a distinct kind (rather than a flag
/// on the camera track) is what lets a participant start and stop sharing
/// without disturbing their camera.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrackKind {
    /// Microphone audio.
    Audio,
    /// Camera video.
    Camera,
    /// Screen or window capture.
    ScreenShare,
}

impl TrackKind {
    /// Is this an audio track? Used to pick codec tables and the auto-subscribe
    /// policy.
    pub const fn is_audio(self) -> bool {
        matches!(self, TrackKind::Audio)
    }

    /// Stable lower-case name used on the wire and in `msid` conventions.
    pub const fn as_str(self) -> &'static str {
        match self {
            TrackKind::Audio => "audio",
            TrackKind::Camera => "camera",
            TrackKind::ScreenShare => "screen_share",
        }
    }

    /// Every kind, for iteration in tests and cleanup loops.
    pub const ALL: [TrackKind; 3] = [TrackKind::Audio, TrackKind::Camera, TrackKind::ScreenShare];
}

impl fmt::Display for TrackKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for TrackKind {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "audio" | "mic" | "microphone" => Ok(TrackKind::Audio),
            "camera" | "cam" | "video" => Ok(TrackKind::Camera),
            "screen_share" | "screen" | "screenshare" => Ok(TrackKind::ScreenShare),
            _ => Err(()),
        }
    }
}

/// Identifies a participant *within one media session*.
///
/// Deliberately not a `UserId`: the same account may legitimately be connected
/// from two devices, and the media server should treat those as two
/// participants. The owning `user_id` travels alongside it in the token.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ParticipantId(pub Uuid);

impl ParticipantId {
    /// Generate a fresh participant id.
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for ParticipantId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for ParticipantId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

impl FromStr for ParticipantId {
    type Err = uuid::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self(Uuid::parse_str(s)?))
    }
}

/// Identifies one published track.
///
/// This is the SFU's own identifier, not the client's `MediaStreamTrack.id`:
/// clients must never be able to name a track that isn't theirs, so the server
/// assigns these and the client echoes them back when subscribing.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct TrackId(pub String);

impl TrackId {
    /// Build the canonical id for a participant's track of a given kind.
    ///
    /// A participant publishes at most one track per kind, so deriving the id
    /// makes republish idempotent and makes logs readable.
    pub fn for_participant(participant: ParticipantId, kind: TrackKind) -> Self {
        Self(format!("{participant}:{}", kind.as_str()))
    }

    /// Borrow as a string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for TrackId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Public description of a published track, as sent to other participants.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrackInfo {
    /// Server-assigned track id.
    pub track_id: TrackId,
    /// Publishing participant.
    pub participant_id: ParticipantId,
    /// What the track carries.
    pub kind: TrackKind,
    /// Negotiated codec MIME type, e.g. `audio/opus`.
    pub mime_type: String,
    /// Whether the publisher currently has it muted/paused.
    pub muted: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_ids_are_derived_and_stable() {
        let p = ParticipantId::new();
        assert_eq!(
            TrackId::for_participant(p, TrackKind::Audio),
            TrackId::for_participant(p, TrackKind::Audio)
        );
        assert_ne!(
            TrackId::for_participant(p, TrackKind::Camera),
            TrackId::for_participant(p, TrackKind::ScreenShare)
        );
    }

    #[test]
    fn track_kinds_parse_from_client_aliases() {
        assert_eq!("mic".parse(), Ok(TrackKind::Audio));
        assert_eq!("screen".parse(), Ok(TrackKind::ScreenShare));
        assert_eq!("cam".parse(), Ok(TrackKind::Camera));
        assert!("hologram".parse::<TrackKind>().is_err());
    }
}
