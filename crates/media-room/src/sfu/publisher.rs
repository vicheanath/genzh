//! Ingress: a client's track becomes a fan-out channel.
//!
//! ```text
//!   client ──publisher PC──▶ on_track ──▶ pump task ──▶ broadcast channel
//! ```
//!
//! Everything here runs once per published track, on the way in. The pump task
//! is the only place a publisher's packet is touched: header extensions are
//! stripped once here rather than remapped per subscriber (see the module docs
//! on why ids cannot be forwarded), and audio levels are sampled here for
//! server-side voice activity detection.
//!
//! Doing both in the pump rather than per subscriber is what keeps cost
//! proportional to *published* tracks instead of to the square of the room.

use std::sync::Arc;


use async_trait::async_trait;

use genzh_media_core::track::{ParticipantId, TrackKind};
use genzh_media_core::vad::{AudioLevelSample, SpeakingTransition, VadMode, VoiceActivityDetector};
use genzh_media_signaling::PeerTarget;
use rtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use rtc::rtp_transceiver::rtp_sender::RTCRtpCodec;
use tokio::sync::{Mutex, mpsc};
use webrtc::media_stream::track_remote::{TrackRemote, TrackRemoteEvent};
use webrtc::peer_connection::{
    PeerConnectionEventHandler, RTCPeerConnectionIceEvent, RTCPeerConnectionState,
};
use webrtc::runtime::Runtime;

use crate::track::{KeyframeRequester, PublishedTrack};

use super::{PeerEvent, TrackIntents, emit_candidate};

/// Handles the publisher connection's events: ICE, state, and inbound tracks.
#[derive(Clone)]
pub(super) struct PublisherHandler {
    participant_id: ParticipantId,
    events: mpsc::Sender<PeerEvent>,
    intents: TrackIntents,
    published_kinds: Arc<Mutex<Vec<TrackKind>>>,
    vad_mode: VadMode,
    audio_level_ext_id: u8,
    runtime: Arc<dyn Runtime>,
}

impl PublisherHandler {
    /// Build the handler for one participant's publisher connection.
    ///
    /// `intents` is shared with the signalling side rather than owned here:
    /// the declaration arrives over the WebSocket and is consumed when the
    /// track lands, and those are two different tasks.
    pub(super) fn new(
        participant_id: ParticipantId,
        events: mpsc::Sender<PeerEvent>,
        intents: TrackIntents,
        vad_mode: VadMode,
        audio_level_ext_id: u8,
        runtime: Arc<dyn Runtime>,
    ) -> Arc<Self> {
        Arc::new(Self {
            participant_id,
            events,
            intents,
            // Owned outright: only this handler ever reads or writes it.
            published_kinds: Arc::new(Mutex::new(Vec::new())),
            vad_mode,
            audio_level_ext_id,
            runtime,
        })
    }
}

#[async_trait]
impl PeerConnectionEventHandler for PublisherHandler {
    async fn on_ice_candidate(&self, event: RTCPeerConnectionIceEvent) {
        emit_candidate(&self.events, PeerTarget::Publisher, event).await;
    }

    async fn on_connection_state_change(&self, state: RTCPeerConnectionState) {
        let _ = self
            .events
            .send(PeerEvent::ConnectionState {
                target: PeerTarget::Publisher,
                state: super::map_connection_state(state),
                terminal: super::connection_state_is_terminal(state),
            })
            .await;
    }

    async fn on_track(&self, track: Arc<dyn TrackRemote>) {
        let Some(ssrc) = track.ssrcs().await.first().copied() else {
            tracing::warn!(
                participant_id = %self.participant_id,
                "published track arrived with no SSRC; ignoring"
            );
            return;
        };

        let Some(codec) = track.codec(ssrc).await else {
            tracing::warn!(
                participant_id = %self.participant_id,
                ssrc,
                "published track arrived with no negotiated codec; ignoring"
            );
            return;
        };

        let client_track_id = track.track_id().await;
        let kind = self.resolve_kind(&client_track_id, &codec).await;

        tracing::info!(
            participant_id = %self.participant_id,
            %kind,
            ssrc,
            mime_type = %codec.mime_type,
            "track published"
        );

        let published = PublishedTrack::with_codec(
            self.participant_id,
            kind,
            codec,
            Some(keyframe_requester(
                track.clone(),
                ssrc,
                self.runtime.clone(),
            )),
        );

        if !kind.is_audio() {
            published.request_keyframe();
        }

        self.spawn_pump(track, published.clone(), kind);

        if self
            .events
            .send(PeerEvent::TrackReady { track: published })
            .await
            .is_err()
        {
            tracing::debug!(
                participant_id = %self.participant_id,
                "connection loop gone; dropping published track"
            );
        }
    }
}

impl PublisherHandler {
    /// Decide what an incoming track is for.
    ///
    /// Preference order: the client's declared intent, then a fallback that
    /// assumes the first video track is a camera and the second is a screen
    /// share. The fallback exists so a client that never declares intent still
    /// produces something sensible rather than a dropped track.
    async fn resolve_kind(&self, client_track_id: &str, codec: &RTCRtpCodec) -> TrackKind {
        if let Some(kind) = self.intents.lock().await.remove(client_track_id) {
            return kind;
        }

        let is_audio = codec.mime_type.to_ascii_lowercase().starts_with("audio/");
        if is_audio {
            return TrackKind::Audio;
        }

        let mut published = self.published_kinds.lock().await;
        let kind = if published.contains(&TrackKind::Camera) {
            TrackKind::ScreenShare
        } else {
            TrackKind::Camera
        };
        published.push(kind);
        kind
    }

    /// Spawn the single task that drains one remote track.
    ///
    /// One task per published track — not one per packet, and not one per
    /// subscriber — so a room's task count grows with tracks, not traffic.
    fn spawn_pump(
        &self,
        remote: Arc<dyn TrackRemote>,
        published: Arc<PublishedTrack>,
        kind: TrackKind,
    ) {
        let sender = published.sender();
        let stats = published.clone();
        let events = self.events.clone();
        let participant_id = self.participant_id;
        let audio_level_ext_id = self.audio_level_ext_id;
        let mut vad = self.vad_mode.build();

        tokio::spawn(async move {
            while let Some(event) = remote.poll().await {
                match event {
                    TrackRemoteEvent::OnRtpPacket(mut packet) => {
                        // Read the audio level *before* stripping extensions;
                        // it is the only thing the SFU looks at in a packet.
                        if kind.is_audio()
                            && let Some(transition) =
                                observe_audio_level(vad.as_mut(), &packet, audio_level_ext_id)
                        {
                            let _ = events.try_send(PeerEvent::Speaking { transition });
                        }

                        strip_header_extensions(&mut packet);

                        stats.stats().packet_published();

                        // `send` fails only when nobody is subscribed, which is
                        // the normal state of a room of one.
                        let _ = sender.send(packet);
                    }
                    TrackRemoteEvent::OnEnded | TrackRemoteEvent::OnError => break,
                    TrackRemoteEvent::OnMute => {
                        if let Some(transition) = vad.reset() {
                            let _ = events.try_send(PeerEvent::Speaking { transition });
                        }
                    }
                    _ => {}
                }
            }

            tracing::debug!(%participant_id, %kind, "publisher track pump finished");
            let _ = events.send(PeerEvent::TrackEnded { kind }).await;
        });
    }
}

/// Build the callback that relays keyframe requests to a publisher.
///
/// Unconditional: whatever reaches here is sent. The rationing that stops ten
/// subscribers becoming ten PLIs happens one layer up, in
/// [`crate::keyframe::KeyframeGate`], which is where the track that owns the
/// decision lives.
///
/// This used to carry a cooldown of its own, measuring against a process-wide
/// monotonic base that started at zero — so for the first half-second of the
/// server's life, `now - 0 < 500` and the very first keyframe request of the
/// process was silently dropped. The gate distinguishes "no request yet" from
/// "a request 0ms ago", and is tested on exactly that.
fn keyframe_requester(
    remote: Arc<dyn TrackRemote>,
    media_ssrc: u32,
    runtime: Arc<dyn Runtime>,
) -> KeyframeRequester {
    KeyframeRequester::new(move || {
        let remote = remote.clone();
        runtime.spawn(Box::pin(async move {
            let pli = PictureLossIndication {
                sender_ssrc: 0,
                media_ssrc,
            };
            if let Err(error) = remote.write_rtcp(vec![Box::new(pli)]).await {
                tracing::debug!(%error, media_ssrc, "keyframe request failed");
            }
        }));
    })
}


/// Remove every RTP header extension from a packet.
///
/// Extension ids are negotiated per connection, so a publisher's ids are
/// meaningless — and rejected — on a subscriber's leg. Stripping once here is
/// cheaper than remapping per subscriber, and the SFU has no use for them
/// downstream.
pub(crate) fn strip_header_extensions(packet: &mut rtc::rtp::Packet) {
    if !packet.header.extension && packet.header.extensions.is_empty() {
        return;
    }
    packet.header.extension = false;
    packet.header.extensions.clear();
    packet.header.extension_profile = 0;
    packet.header.extensions_padding = 0;
}

/// Feed one packet's audio level to a detector.
///
/// The RFC 6464 payload is a single byte: the top bit is voice activity, the
/// low seven bits are the level in -dBov.
pub(crate) fn observe_audio_level(
    vad: &mut dyn VoiceActivityDetector,
    packet: &rtc::rtp::Packet,
    extension_id: u8,
) -> Option<SpeakingTransition> {
    let level = packet
        .header
        .get_extension(extension_id)
        .and_then(|bytes| bytes.first().copied())
        .map(|byte| byte & 0x7F);

    vad.observe(AudioLevelSample {
        level,
        now_ms: monotonic_millis(),
    })
}

/// Milliseconds from a monotonic clock, for VAD and rate limiting.
fn monotonic_millis() -> u64 {
    use std::sync::OnceLock;
    use std::time::Instant;

    static ORIGIN: OnceLock<Instant> = OnceLock::new();
    ORIGIN.get_or_init(Instant::now).elapsed().as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use genzh_media_core::vad::{AudioLevelVad, NoopVad};

    fn packet_with_extension(id: u8, value: u8) -> rtc::rtp::Packet {
        let mut packet = rtc::rtp::Packet::default();
        packet.header.extension = true;
        packet.header.extension_profile = 0xBEDE;
        packet
            .header
            .set_extension(id, bytes::Bytes::copy_from_slice(&[value]))
            .expect("set extension");
        packet
    }

    #[test]
    fn header_extensions_are_stripped_before_forwarding() {
        let mut packet = packet_with_extension(1, 0x20);
        assert!(packet.header.extension);
        assert!(!packet.header.extensions.is_empty());

        strip_header_extensions(&mut packet);

        assert!(!packet.header.extension);
        assert!(packet.header.extensions.is_empty());
        assert_eq!(packet.header.extension_profile, 0);
    }

    #[test]
    fn stripping_a_packet_without_extensions_is_a_no_op() {
        let mut packet = rtc::rtp::Packet::default();
        packet.header.sequence_number = 42;
        strip_header_extensions(&mut packet);
        assert_eq!(
            packet.header.sequence_number, 42,
            "the rest of the header is untouched"
        );
    }

    #[test]
    fn the_payload_survives_stripping() {
        let mut packet = packet_with_extension(3, 0x10);
        packet.payload = bytes::Bytes::from_static(b"opus-frame-bytes");
        strip_header_extensions(&mut packet);
        assert_eq!(
            &packet.payload[..],
            b"opus-frame-bytes",
            "the SFU must not touch media"
        );
    }

    #[test]
    fn audio_levels_are_read_from_the_configured_extension_id() {
        let mut vad = AudioLevelVad::default();
        // 0x14 = level 20 dBov, comfortably above the speech threshold.
        let packet = packet_with_extension(1, 0x14);

        assert_eq!(observe_audio_level(&mut vad, &packet, 1), None);
        assert_eq!(observe_audio_level(&mut vad, &packet, 1), None);
        assert_eq!(
            observe_audio_level(&mut vad, &packet, 1),
            Some(SpeakingTransition::Started)
        );
    }

    #[test]
    fn the_voice_activity_bit_is_masked_off_the_level() {
        let mut vad = AudioLevelVad::default();
        // 0x94 = voice-activity bit set, level 20.
        let packet = packet_with_extension(1, 0x94);
        for _ in 0..3 {
            observe_audio_level(&mut vad, &packet, 1);
        }
        assert!(
            vad.is_speaking(),
            "the top bit must not be read as part of the level"
        );
    }

    #[test]
    fn a_mismatched_extension_id_yields_no_level() {
        let mut vad = AudioLevelVad::default();
        let packet = packet_with_extension(1, 0x14);
        for _ in 0..10 {
            assert_eq!(observe_audio_level(&mut vad, &packet, 7), None);
        }
        assert!(!vad.is_speaking());
    }

    #[test]
    fn the_placeholder_detector_ignores_levels_entirely() {
        let mut vad = NoopVad;
        let packet = packet_with_extension(1, 0x00);
        for _ in 0..50 {
            assert_eq!(observe_audio_level(&mut vad, &packet, 1), None);
        }
    }
}
