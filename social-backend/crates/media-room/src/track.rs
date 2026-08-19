//! Published tracks and the RTP fan-out.
//!
//! ## How forwarding actually works
//!
//! ```text
//!   publisher's TrackRemote          tokio::broadcast          each subscriber's
//!   ─────────────────────────▶  [ 512 rtp::Packet slots ]  ──▶ TrackLocalStaticRTP
//!         one pump task                                          one task each
//! ```
//!
//! Three properties of this arrangement matter:
//!
//! * **No decode.** An `rtp::Packet` goes in and the same packet goes out. The
//!   SFU never looks at the payload, which is why adding a codec is a config
//!   change and why CPU stays flat as participants grow.
//! * **No copy.** `rtp::Packet`'s payload is a [`bytes::Bytes`]; cloning it for
//!   each subscriber bumps a refcount rather than memcpy-ing the frame. Only
//!   the 12-byte header is rewritten per subscriber (SSRC), and that happens on
//!   the subscriber's own clone.
//! * **Bounded.** The channel has a fixed depth. A subscriber that stops
//!   draining is *lagged* by the broadcast channel — it loses packets and
//!   recovers with a keyframe — rather than growing the server's heap. That is
//!   the correct failure mode for realtime media; buffering is worse than
//!   dropping.

use std::sync::Arc;

use social_media_core::track::{ParticipantId, TrackId, TrackInfo, TrackKind};
use rtc::rtp_transceiver::rtp_sender::RTCRtpCodec;
use social_media_signaling::limits::RTP_FANOUT_DEPTH;
use tokio::sync::broadcast;

/// A track one participant is publishing, plus its fan-out channel.
pub struct PublishedTrack {
    info: TrackInfo,
    rtp_tx: broadcast::Sender<rtc::rtp::Packet>,
    /// The codec the publisher negotiated.
    ///
    /// Kept so each subscriber's local track can be created with a matching
    /// codec. `None` in unit tests, where no negotiation happened; the sink
    /// then falls back to the codec registry.
    codec: Option<RTCRtpCodec>,
    /// Relays keyframe requests from subscribers back to the publisher.
    keyframe_requests: Option<KeyframeRequester>,
}

/// Asks the publisher for a fresh keyframe.
///
/// Video subscribers that join mid-stream, or that recover from loss, need an
/// intra frame before they can decode anything. The SFU cannot generate one —
/// it does not encode — so it forwards the request upstream as a PLI. Boxed as
/// a closure so the room layer does not have to know about RTCP types.
pub struct KeyframeRequester(Box<dyn Fn() + Send + Sync>);

impl KeyframeRequester {
    /// Wrap a callback.
    pub fn new(f: impl Fn() + Send + Sync + 'static) -> Self {
        Self(Box::new(f))
    }

    /// Request a keyframe from the publisher.
    pub fn request(&self) {
        (self.0)();
    }
}

impl std::fmt::Debug for PublishedTrack {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PublishedTrack")
            .field("track_id", &self.info.track_id)
            .field("kind", &self.info.kind)
            .field("mime_type", &self.info.mime_type)
            .field("subscribers", &self.rtp_tx.receiver_count())
            .finish()
    }
}

impl PublishedTrack {
    /// Create a track and its fan-out channel.
    pub fn new(
        participant_id: ParticipantId,
        kind: TrackKind,
        mime_type: impl Into<String>,
        keyframe_requests: Option<KeyframeRequester>,
    ) -> Arc<Self> {
        let (rtp_tx, _) = broadcast::channel(RTP_FANOUT_DEPTH);
        Arc::new(Self {
            info: TrackInfo {
                track_id: TrackId::for_participant(participant_id, kind),
                participant_id,
                kind,
                mime_type: mime_type.into(),
                muted: false,
            },
            rtp_tx,
            codec: None,
            keyframe_requests,
        })
    }

    /// Create a track from a negotiated codec.
    ///
    /// This is the production path: the MIME type and the parameters a
    /// subscriber's local track needs both come from what the publisher
    /// actually negotiated, rather than from a guess.
    pub fn with_codec(
        participant_id: ParticipantId,
        kind: TrackKind,
        codec: RTCRtpCodec,
        keyframe_requests: Option<KeyframeRequester>,
    ) -> Arc<Self> {
        let (rtp_tx, _) = broadcast::channel(RTP_FANOUT_DEPTH);
        Arc::new(Self {
            info: TrackInfo {
                track_id: TrackId::for_participant(participant_id, kind),
                participant_id,
                kind,
                mime_type: codec.mime_type.clone(),
                muted: false,
            },
            rtp_tx,
            codec: Some(codec),
            keyframe_requests,
        })
    }

    /// The negotiated publisher-side codec, when there was one.
    pub fn codec(&self) -> Option<&RTCRtpCodec> {
        self.codec.as_ref()
    }

    /// Public description, for participant lists and `track_published` events.
    pub fn info(&self) -> &TrackInfo {
        &self.info
    }

    /// Server-assigned id.
    pub fn id(&self) -> &TrackId {
        &self.info.track_id
    }

    /// What the track carries.
    pub fn kind(&self) -> TrackKind {
        self.info.kind
    }

    /// Publisher.
    pub fn publisher(&self) -> ParticipantId {
        self.info.participant_id
    }

    /// The sender end, for the pump task reading from the publisher.
    pub fn sender(&self) -> broadcast::Sender<rtc::rtp::Packet> {
        self.rtp_tx.clone()
    }

    /// Open a new subscription to this track's packets.
    pub fn subscribe_rtp(&self) -> broadcast::Receiver<rtc::rtp::Packet> {
        self.rtp_tx.subscribe()
    }

    /// How many subscribers are currently attached.
    pub fn subscriber_count(&self) -> usize {
        self.rtp_tx.receiver_count()
    }

    /// Ask the publisher for a keyframe, if this track supports it.
    ///
    /// A no-op for audio, and for tracks created without a requester (tests).
    pub fn request_keyframe(&self) {
        if self.info.kind.is_audio() {
            return;
        }
        if let Some(requester) = &self.keyframe_requests {
            requester.request();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn packet(seq: u16) -> rtc::rtp::Packet {
        let mut p = rtc::rtp::Packet::default();
        p.header.sequence_number = seq;
        p
    }

    #[tokio::test]
    async fn packets_fan_out_to_every_subscriber() {
        let track = PublishedTrack::new(ParticipantId::new(), TrackKind::Audio, "audio/opus", None);

        let mut bob = track.subscribe_rtp();
        let mut sarah = track.subscribe_rtp();
        assert_eq!(track.subscriber_count(), 2);

        track.sender().send(packet(7)).expect("send");

        assert_eq!(bob.recv().await.unwrap().header.sequence_number, 7);
        assert_eq!(sarah.recv().await.unwrap().header.sequence_number, 7);
    }

    #[tokio::test]
    async fn a_track_with_no_subscribers_drops_packets_instead_of_buffering() {
        let track = PublishedTrack::new(ParticipantId::new(), TrackKind::Audio, "audio/opus", None);
        assert_eq!(track.subscriber_count(), 0);
        // No receivers: `send` reports an error rather than queueing forever.
        assert!(track.sender().send(packet(1)).is_err());
    }

    #[tokio::test]
    async fn a_slow_subscriber_is_lagged_rather_than_growing_the_heap() {
        let track = PublishedTrack::new(ParticipantId::new(), TrackKind::Camera, "video/VP8", None);
        let mut slow = track.subscribe_rtp();

        for seq in 0..(RTP_FANOUT_DEPTH as u16 + 50) {
            let _ = track.sender().send(packet(seq));
        }

        // The channel drops the oldest packets and tells the reader it lagged.
        assert!(matches!(slow.recv().await, Err(broadcast::error::RecvError::Lagged(_))));
        // …and the subscriber keeps working afterwards.
        assert!(slow.recv().await.is_ok());
    }

    #[test]
    fn keyframe_requests_are_forwarded_for_video_only() {
        let calls = Arc::new(AtomicUsize::new(0));

        let counter = calls.clone();
        let video = PublishedTrack::new(
            ParticipantId::new(),
            TrackKind::Camera,
            "video/VP8",
            Some(KeyframeRequester::new(move || {
                counter.fetch_add(1, Ordering::SeqCst);
            })),
        );
        video.request_keyframe();
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        let counter = calls.clone();
        let audio = PublishedTrack::new(
            ParticipantId::new(),
            TrackKind::Audio,
            "audio/opus",
            Some(KeyframeRequester::new(move || {
                counter.fetch_add(1, Ordering::SeqCst);
            })),
        );
        audio.request_keyframe();
        assert_eq!(calls.load(Ordering::SeqCst), 1, "audio has no keyframes to request");
    }

    #[test]
    fn track_ids_are_derived_from_publisher_and_kind() {
        let p = ParticipantId::new();
        let track = PublishedTrack::new(p, TrackKind::ScreenShare, "video/VP8", None);
        assert_eq!(*track.id(), TrackId::for_participant(p, TrackKind::ScreenShare));
        assert_eq!(track.publisher(), p);
        assert_eq!(track.kind(), TrackKind::ScreenShare);
    }
}
