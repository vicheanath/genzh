//! What every peer connection on this server is built with.
//!
//! Separated from the connections themselves because configuration changes for
//! different reasons than transport code does: adding a codec or retuning VAD
//! is an operational decision, not a change to how packets move.

use genzh_media_core::codec::{CodecProfile, CodecRegistry, MediaKind};
use genzh_media_core::ice::IceConfig;
use genzh_media_core::vad::VadMode;
use rtc::rtp_transceiver::rtp_sender::{RTCRtpCodec, RTCRtpCodecParameters, RtpCodecKind};

/// Configuration shared by every peer connection this server creates.
#[derive(Debug, Clone)]
pub struct SfuConfig {
    /// Codecs to negotiate.
    pub codecs: CodecRegistry,
    /// STUN/TURN servers.
    pub ice: IceConfig,
    /// Local addresses to bind UDP sockets on, e.g. `["0.0.0.0:0"]`.
    pub udp_addrs: Vec<String>,
    /// Which voice-activity detector to run.
    pub vad_mode: VadMode,
    /// RTP header-extension id carrying `ssrc-audio-level`.
    ///
    /// See the crate README: the negotiated id is chosen by the offerer, so
    /// server-side VAD currently relies on this being configured to match.
    pub audio_level_ext_id: u8,
}

impl Default for SfuConfig {
    fn default() -> Self {
        Self {
            codecs: CodecRegistry::default(),
            ice: IceConfig::default(),
            udp_addrs: vec!["0.0.0.0:0".to_owned()],
            vad_mode: VadMode::default(),
            audio_level_ext_id: 1,
        }
    }
}

/// Translate this workspace's codec vocabulary into the transport's.
///
/// Three small functions rather than one, so a caller that needs only the
/// codec (the subscriber, picking a local track's format) does not have to
/// invent a payload type it will discard.
pub(crate) fn rtp_kind(kind: MediaKind) -> RtpCodecKind {
    match kind {
        MediaKind::Audio => RtpCodecKind::Audio,
        MediaKind::Video => RtpCodecKind::Video,
    }
}

pub(crate) fn codec_from_profile(profile: &CodecProfile) -> RTCRtpCodec {
    RTCRtpCodec {
        mime_type: profile.mime_type.to_owned(),
        clock_rate: profile.clock_rate,
        channels: profile.channels,
        sdp_fmtp_line: profile.fmtp.to_owned(),
        rtcp_feedback: Vec::new(),
    }
}

pub(crate) fn codec_parameters(profile: &CodecProfile) -> RTCRtpCodecParameters {
    RTCRtpCodecParameters {
        rtp_codec: codec_from_profile(profile),
        payload_type: profile.payload_type,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codec_profiles_translate_into_engine_parameters() {
        let parameters = codec_parameters(&genzh_media_core::codec::OPUS);
        assert_eq!(parameters.payload_type, 111);
        assert_eq!(parameters.rtp_codec.mime_type, "audio/opus");
        assert_eq!(parameters.rtp_codec.clock_rate, 48_000);
        assert_eq!(parameters.rtp_codec.channels, 2);
        assert!(
            parameters
                .rtp_codec
                .sdp_fmtp_line
                .contains("useinbandfec=1")
        );
    }
}
