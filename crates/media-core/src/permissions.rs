//! The media-plane view of permissions.
//!
//! The control plane has a much richer permission model (managing roles,
//! kicking members, editing rooms). None of that is the media server's
//! business. What it needs to know is narrow and entirely about tracks:
//!
//! * may this participant publish audio?
//! * …video? …a screen share?
//! * may they mute or move other people?
//!
//! Keeping this a separate, smaller bitflag set is what stops the media server
//! from growing opinions about community administration. The API translates
//! from its own `PermissionSet` when it mints a token.

use bitflags::bitflags;
use serde::{Deserialize, Serialize};

bitflags! {
    /// Capabilities carried inside a media token.
    ///
    /// Serialised as a plain integer so tokens stay compact.
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
    #[serde(transparent)]
    pub struct MediaPermissions: u32 {
        /// Join the room and receive other participants' media.
        const SUBSCRIBE    = 1 << 0;
        /// Publish an audio track.
        const PUBLISH_AUDIO  = 1 << 1;
        /// Publish a camera track.
        const PUBLISH_VIDEO  = 1 << 2;
        /// Publish a screen-share track.
        const PUBLISH_SCREEN = 1 << 3;
        /// Publish a high-bitrate stream / activity capture.
        const PUBLISH_STREAM = 1 << 4;
        /// Server-mute other participants.
        const MODERATE_MUTE  = 1 << 5;
        /// Disconnect or move other participants.
        const MODERATE_MOVE  = 1 << 6;
    }
}

impl MediaPermissions {
    /// A listener: receives everything, publishes nothing.
    pub const LISTENER: MediaPermissions = MediaPermissions::SUBSCRIBE;

    /// Can this participant publish the given track kind?
    ///
    /// Single entry point so the SFU never spells out a bit test inline and
    /// screen-share can never be accidentally checked against the camera bit.
    pub fn may_publish(self, kind: crate::track::TrackKind) -> bool {
        match kind {
            crate::track::TrackKind::Audio => self.contains(MediaPermissions::PUBLISH_AUDIO),
            crate::track::TrackKind::Camera => self.contains(MediaPermissions::PUBLISH_VIDEO),
            crate::track::TrackKind::ScreenShare => self.contains(MediaPermissions::PUBLISH_SCREEN),
        }
    }

    /// Can this participant receive other people's media at all?
    pub fn may_subscribe(self) -> bool {
        self.contains(MediaPermissions::SUBSCRIBE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::track::TrackKind;

    #[test]
    fn a_listener_publishes_nothing() {
        let p = MediaPermissions::LISTENER;
        assert!(p.may_subscribe());
        assert!(!p.may_publish(TrackKind::Audio));
        assert!(!p.may_publish(TrackKind::Camera));
        assert!(!p.may_publish(TrackKind::ScreenShare));
    }

    #[test]
    fn publish_bits_do_not_bleed_into_each_other() {
        let audio_only = MediaPermissions::SUBSCRIBE | MediaPermissions::PUBLISH_AUDIO;
        assert!(audio_only.may_publish(TrackKind::Audio));
        assert!(!audio_only.may_publish(TrackKind::Camera));
        assert!(!audio_only.may_publish(TrackKind::ScreenShare));

        let screen_only = MediaPermissions::PUBLISH_SCREEN;
        assert!(screen_only.may_publish(TrackKind::ScreenShare));
        assert!(!screen_only.may_publish(TrackKind::Camera));
        assert!(!screen_only.may_subscribe());
    }
}
