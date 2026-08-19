//! Voice activity detection.
//!
//! Speaking indicators are a *presentation* concern that happens to need
//! access to the audio path, so the room manager talks to this trait and never
//! to a concrete detector. Three implementations are plausible and all three
//! should be swappable without touching the SFU:
//!
//! 1. **Client-reported** ([`NoopVad`]). The publisher runs `AnalyserNode` (or
//!    the platform equivalent) and sends `speaking: true/false` over the
//!    signalling socket. Costs the server nothing and is the MVP default.
//! 2. **RTP audio level** ([`AudioLevelVad`]). Reads the RFC 6464
//!    `ssrc-audio-level` header extension, which browsers already attach to
//!    every Opus packet. The server learns who is talking without decoding a
//!    single frame — this is the interesting one, and it is implemented here.
//! 3. **Decoded-signal VAD.** Real DSP on PCM. Requires decoding Opus, which
//!    the SFU explicitly does not do; it would live in a side-car.
//!
//! Whatever the source, the room manager turns transitions into
//! [`crate::events::RoomEvent::SpeakingStarted`] /
//! [`crate::events::RoomEvent::SpeakingStopped`].

/// One observation about an audio packet.
///
/// Carries no payload: a detector must never need the media itself, which is
/// what keeps the forwarding path copy-free.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioLevelSample {
    /// RFC 6464 level: 0 = loudest (0 dBov), 127 = silence (-127 dBov).
    /// `None` when the sender did not negotiate the header extension.
    pub level: Option<u8>,
    /// Monotonic milliseconds. Supplied by the caller so tests and future
    /// replay tooling control the clock.
    pub now_ms: u64,
}

/// A change in speaking state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpeakingTransition {
    /// Silence → speech.
    Started,
    /// Speech → silence.
    Stopped,
}

/// Decides whether a participant is currently talking.
///
/// Implementations are per-participant and are driven from that participant's
/// RTP task, so they need no interior locking.
pub trait VoiceActivityDetector: Send + 'static {
    /// Feed one packet's worth of information.
    ///
    /// Returns `Some` only on a state *change*, so callers can broadcast an
    /// event without tracking previous state themselves.
    fn observe(&mut self, sample: AudioLevelSample) -> Option<SpeakingTransition>;

    /// Current state.
    fn is_speaking(&self) -> bool;

    /// Called when the publisher mutes, or the track ends.
    ///
    /// Without this a muted participant would keep a stale "speaking" ring
    /// until the hold timer expired.
    fn reset(&mut self) -> Option<SpeakingTransition>;
}

/// Placeholder detector: always silent.
///
/// Used when speaking state is reported by clients. It exists so that the room
/// manager has exactly one code path whether or not server-side detection is
/// enabled.
#[derive(Debug, Default, Clone, Copy)]
pub struct NoopVad;

impl VoiceActivityDetector for NoopVad {
    fn observe(&mut self, _sample: AudioLevelSample) -> Option<SpeakingTransition> {
        None
    }

    fn is_speaking(&self) -> bool {
        false
    }

    fn reset(&mut self) -> Option<SpeakingTransition> {
        None
    }
}

/// Tuning for [`AudioLevelVad`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioLevelVadConfig {
    /// Packets at or below this RFC 6464 level count as speech. Lower is
    /// louder; 45 (≈ -45 dBov) sits above typical room noise.
    pub threshold: u8,
    /// Consecutive loud packets required before declaring speech. At the usual
    /// 20 ms Opus frame this turns into ~60 ms of hysteresis, which is enough
    /// to ignore a cough or a keyboard click.
    pub activation_packets: u8,
    /// How long silence must persist before declaring the participant quiet.
    /// Too short and the indicator strobes between words.
    pub release_ms: u64,
}

impl Default for AudioLevelVadConfig {
    fn default() -> Self {
        Self {
            threshold: 45,
            activation_packets: 3,
            release_ms: 250,
        }
    }
}

/// Detector driven by the RFC 6464 audio-level RTP header extension.
#[derive(Debug, Clone)]
pub struct AudioLevelVad {
    config: AudioLevelVadConfig,
    speaking: bool,
    consecutive_loud: u8,
    last_loud_ms: u64,
}

impl AudioLevelVad {
    /// Build a detector with the given tuning.
    pub fn new(config: AudioLevelVadConfig) -> Self {
        Self {
            config,
            speaking: false,
            consecutive_loud: 0,
            last_loud_ms: 0,
        }
    }
}

impl Default for AudioLevelVad {
    fn default() -> Self {
        Self::new(AudioLevelVadConfig::default())
    }
}

impl VoiceActivityDetector for AudioLevelVad {
    fn observe(&mut self, sample: AudioLevelSample) -> Option<SpeakingTransition> {
        // No extension negotiated: we cannot tell, so we say nothing rather
        // than guessing from packet sizes (which DTX makes meaningless).
        let Some(level) = sample.level else {
            return None;
        };

        let loud = level <= self.config.threshold;

        if loud {
            self.last_loud_ms = sample.now_ms;
            self.consecutive_loud = self.consecutive_loud.saturating_add(1);

            if !self.speaking && self.consecutive_loud >= self.config.activation_packets {
                self.speaking = true;
                return Some(SpeakingTransition::Started);
            }
        } else {
            self.consecutive_loud = 0;

            if self.speaking
                && sample.now_ms.saturating_sub(self.last_loud_ms) >= self.config.release_ms
            {
                self.speaking = false;
                return Some(SpeakingTransition::Stopped);
            }
        }

        None
    }

    fn is_speaking(&self) -> bool {
        self.speaking
    }

    fn reset(&mut self) -> Option<SpeakingTransition> {
        self.consecutive_loud = 0;
        if std::mem::take(&mut self.speaking) {
            Some(SpeakingTransition::Stopped)
        } else {
            None
        }
    }
}

/// Which detector a deployment uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VadMode {
    /// Clients report their own speaking state (default).
    #[default]
    ClientReported,
    /// The server reads RTP audio levels.
    ServerAudioLevel,
}

impl VadMode {
    /// Parse from configuration. Unknown values fall back to the safe default.
    pub fn from_env_value(value: Option<&str>) -> Self {
        match value.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
            Some("server" | "server_audio_level" | "rtp") => VadMode::ServerAudioLevel,
            _ => VadMode::ClientReported,
        }
    }

    /// Build a detector for one participant.
    pub fn build(self) -> Box<dyn VoiceActivityDetector> {
        match self {
            VadMode::ClientReported => Box::new(NoopVad),
            VadMode::ServerAudioLevel => Box::new(AudioLevelVad::default()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn loud(now_ms: u64) -> AudioLevelSample {
        AudioLevelSample {
            level: Some(20),
            now_ms,
        }
    }

    fn quiet(now_ms: u64) -> AudioLevelSample {
        AudioLevelSample {
            level: Some(110),
            now_ms,
        }
    }

    #[test]
    fn the_placeholder_detector_never_speaks() {
        let mut vad = NoopVad;
        assert!(vad.observe(loud(0)).is_none());
        assert!(!vad.is_speaking());
        assert!(vad.reset().is_none());
    }

    #[test]
    fn speech_needs_several_loud_packets_in_a_row() {
        let mut vad = AudioLevelVad::default();
        assert_eq!(vad.observe(loud(0)), None);
        assert_eq!(vad.observe(loud(20)), None);
        assert_eq!(vad.observe(loud(40)), Some(SpeakingTransition::Started));
        assert!(vad.is_speaking());
    }

    #[test]
    fn a_single_click_does_not_trigger_speech() {
        let mut vad = AudioLevelVad::default();
        assert_eq!(vad.observe(loud(0)), None);
        assert_eq!(vad.observe(quiet(20)), None);
        assert_eq!(vad.observe(loud(40)), None);
        assert_eq!(vad.observe(quiet(60)), None);
        assert!(!vad.is_speaking());
    }

    #[test]
    fn a_pause_between_words_does_not_stop_the_indicator() {
        let mut vad = AudioLevelVad::default();
        for t in [0, 20, 40] {
            vad.observe(loud(t));
        }
        assert!(vad.is_speaking());

        // 100 ms of quiet: shorter than the 250 ms release.
        for t in [60, 80, 100, 120, 140] {
            assert_eq!(vad.observe(quiet(t)), None);
        }
        assert!(vad.is_speaking(), "should still be speaking mid-sentence");
    }

    #[test]
    fn sustained_silence_stops_the_indicator_exactly_once() {
        let mut vad = AudioLevelVad::default();
        for t in [0, 20, 40] {
            vad.observe(loud(t));
        }

        let mut transitions = Vec::new();
        for t in (60..=500).step_by(20) {
            if let Some(t) = vad.observe(quiet(t)) {
                transitions.push(t);
            }
        }
        assert_eq!(transitions, vec![SpeakingTransition::Stopped]);
        assert!(!vad.is_speaking());
    }

    #[test]
    fn muting_stops_the_indicator_immediately() {
        let mut vad = AudioLevelVad::default();
        for t in [0, 20, 40] {
            vad.observe(loud(t));
        }
        assert_eq!(vad.reset(), Some(SpeakingTransition::Stopped));
        assert!(!vad.is_speaking());
        assert_eq!(vad.reset(), None, "reset is idempotent");
    }

    #[test]
    fn packets_without_the_extension_are_ignored() {
        let mut vad = AudioLevelVad::default();
        for now_ms in 0..10 {
            assert_eq!(
                vad.observe(AudioLevelSample {
                    level: None,
                    now_ms
                }),
                None
            );
        }
        assert!(!vad.is_speaking());
    }

    #[test]
    fn the_mode_selects_the_implementation_and_defaults_safely() {
        assert_eq!(
            VadMode::from_env_value(Some("server")),
            VadMode::ServerAudioLevel
        );
        assert_eq!(
            VadMode::from_env_value(Some("RTP")),
            VadMode::ServerAudioLevel
        );
        assert_eq!(
            VadMode::from_env_value(Some("client")),
            VadMode::ClientReported
        );
        assert_eq!(VadMode::from_env_value(None), VadMode::ClientReported);
        assert_eq!(
            VadMode::from_env_value(Some("nonsense")),
            VadMode::ClientReported
        );

        assert!(!VadMode::ClientReported.build().is_speaking());
    }
}
