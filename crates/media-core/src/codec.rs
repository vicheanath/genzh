//! The codec allow-list.
//!
//! Codecs are described once, here, in a form that has nothing to do with any
//! particular WebRTC library. `genzh-room` translates these profiles
//! into the media engine's own types when it builds a peer connection.
//!
//! Why bother with the indirection:
//!
//! * Enabling H.264 for iOS hardware decode, or disabling VP9 because a device
//!   family handles it badly, becomes a config change instead of a code change
//!   scattered across the SFU.
//! * The SFU forwards RTP; it never needs to *understand* a codec. Keeping the
//!   payload-type table out of the forwarding path makes that obvious.
//! * When simulcast and SVC land, the per-codec knobs have an existing home.

use serde::{Deserialize, Serialize};

use crate::track::TrackKind;

/// Audio or video, in codec terms.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MediaKind {
    /// Audio codecs.
    Audio,
    /// Video codecs.
    Video,
}

impl From<TrackKind> for MediaKind {
    fn from(kind: TrackKind) -> Self {
        if kind.is_audio() {
            MediaKind::Audio
        } else {
            MediaKind::Video
        }
    }
}

/// One negotiable codec.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CodecProfile {
    /// MIME type as it appears in SDP, e.g. `audio/opus`.
    pub mime_type: &'static str,
    /// Audio or video.
    pub kind: MediaKind,
    /// RTP clock rate in Hz.
    pub clock_rate: u32,
    /// Channel count; 0 for video.
    pub channels: u16,
    /// `a=fmtp` parameters.
    pub fmtp: &'static str,
    /// Preferred static payload type. The remote peer may renumber it during
    /// negotiation; nothing in the forwarding path depends on this value.
    pub payload_type: u8,
}

/// Opus — the only audio codec we negotiate.
///
/// `minptime=10;useinbandfec=1` is the WebRTC default and matters on mobile:
/// in-band FEC recovers isolated packet loss without a retransmit round trip.
pub const OPUS: CodecProfile = CodecProfile {
    mime_type: "audio/opus",
    kind: MediaKind::Audio,
    clock_rate: 48_000,
    channels: 2,
    fmtp: "minptime=10;useinbandfec=1",
    payload_type: 111,
};

/// VP8 — universally supported, the safe default for camera and screen share.
pub const VP8: CodecProfile = CodecProfile {
    mime_type: "video/VP8",
    kind: MediaKind::Video,
    clock_rate: 90_000,
    channels: 0,
    fmtp: "",
    payload_type: 96,
};

/// VP9 — better quality per bit, and the path to SVC.
pub const VP9: CodecProfile = CodecProfile {
    mime_type: "video/VP9",
    kind: MediaKind::Video,
    clock_rate: 90_000,
    channels: 0,
    fmtp: "profile-id=0",
    payload_type: 98,
};

/// H.264 constrained baseline — hardware encode/decode on essentially every
/// phone, which is what keeps battery drain sane in long video rooms.
pub const H264: CodecProfile = CodecProfile {
    mime_type: "video/H264",
    kind: MediaKind::Video,
    clock_rate: 90_000,
    channels: 0,
    fmtp: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f",
    payload_type: 102,
};

/// Every codec this build knows how to describe.
pub const ALL_CODECS: &[CodecProfile] = &[OPUS, VP9, H264, VP8];

/// The set of codecs a media server will negotiate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodecRegistry {
    codecs: Vec<CodecProfile>,
}

impl Default for CodecRegistry {
    fn default() -> Self {
        Self {
            codecs: ALL_CODECS.to_vec(),
        }
    }
}

impl CodecRegistry {
    /// Build a registry from a comma-separated allow-list such as
    /// `opus,vp8,h264`. Unknown names are ignored with a warning rather than
    /// failing startup — a typo in an env var should not take the media
    /// server down, and the resulting set is still logged.
    ///
    /// An empty or absent list means "everything".
    pub fn from_allow_list(list: Option<&str>) -> Self {
        let Some(list) = list.map(str::trim).filter(|s| !s.is_empty()) else {
            return Self::default();
        };

        let mut codecs = Vec::new();
        for name in list.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            match Self::lookup(name) {
                Some(profile) => {
                    if !codecs.contains(&profile) {
                        codecs.push(profile);
                    }
                }
                None => tracing::warn!(codec = %name, "unknown codec in allow-list, ignoring"),
            }
        }

        if codecs.is_empty() {
            tracing::warn!("codec allow-list matched nothing; falling back to all codecs");
            return Self::default();
        }

        Self { codecs }
    }

    fn lookup(name: &str) -> Option<CodecProfile> {
        match name.to_ascii_lowercase().as_str() {
            "opus" | "audio/opus" => Some(OPUS),
            "vp8" | "video/vp8" => Some(VP8),
            "vp9" | "video/vp9" => Some(VP9),
            "h264" | "h.264" | "video/h264" => Some(H264),
            _ => None,
        }
    }

    /// All enabled codecs.
    pub fn codecs(&self) -> &[CodecProfile] {
        &self.codecs
    }

    /// Enabled codecs of one media kind.
    pub fn for_kind(&self, kind: MediaKind) -> impl Iterator<Item = &CodecProfile> {
        self.codecs.iter().filter(move |c| c.kind == kind)
    }

    /// Is this MIME type negotiable? Comparison is case-insensitive because
    /// SDP casing varies between stacks (`video/VP8` vs `video/vp8`).
    pub fn allows_mime(&self, mime_type: &str) -> bool {
        self.codecs
            .iter()
            .any(|c| c.mime_type.eq_ignore_ascii_case(mime_type))
    }

    /// A room cannot carry audio at all without an audio codec; startup checks
    /// this so the failure is a clear log line rather than a silent, empty SDP.
    pub fn has_audio(&self) -> bool {
        self.for_kind(MediaKind::Audio).next().is_some()
    }

    /// As above, for video.
    pub fn has_video(&self) -> bool {
        self.for_kind(MediaKind::Video).next().is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_registry_carries_audio_and_video() {
        let registry = CodecRegistry::default();
        assert!(registry.has_audio());
        assert!(registry.has_video());
        assert!(registry.allows_mime("audio/opus"));
        assert!(
            registry.allows_mime("video/vp8"),
            "mime matching is case-insensitive"
        );
    }

    #[test]
    fn an_allow_list_narrows_the_registry() {
        let registry = CodecRegistry::from_allow_list(Some("opus, h264"));
        assert_eq!(registry.codecs().len(), 2);
        assert!(registry.allows_mime("video/H264"));
        assert!(!registry.allows_mime("video/VP9"));
    }

    #[test]
    fn duplicates_and_unknown_names_are_tolerated() {
        let registry = CodecRegistry::from_allow_list(Some("opus,opus,quantum-codec"));
        assert_eq!(registry.codecs().len(), 1);
        assert!(registry.has_audio());
        assert!(!registry.has_video());
    }

    #[test]
    fn an_entirely_unknown_list_falls_back_to_everything() {
        let registry = CodecRegistry::from_allow_list(Some("nonsense,more-nonsense"));
        assert_eq!(registry, CodecRegistry::default());
    }

    #[test]
    fn an_absent_list_means_everything() {
        assert_eq!(
            CodecRegistry::from_allow_list(None),
            CodecRegistry::default()
        );
        assert_eq!(
            CodecRegistry::from_allow_list(Some("   ")),
            CodecRegistry::default()
        );
    }

    #[test]
    fn payload_types_do_not_collide() {
        let mut seen = Vec::new();
        for codec in ALL_CODECS {
            assert!(
                !seen.contains(&codec.payload_type),
                "duplicate PT {}",
                codec.payload_type
            );
            seen.push(codec.payload_type);
        }
    }
}
