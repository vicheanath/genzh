//! Egress: a fan-out channel becomes packets on one subscriber's wire.
//!
//! ```text
//!   broadcast channel ──▶ forward task ──▶ subscriber PC ──▶ client
//! ```
//!
//! One forward task per (track, subscriber) pair. The task owns the three
//! rewrites the module docs describe — SSRC, payload type, and the stripped
//! header extensions it inherits from the pump — and nothing else in the
//! workspace writes RTP.
//!
//! Payload type is the awkward one: it cannot be known until the subscriber
//! has finished negotiating, which happens *after* forwarding starts. The task
//! therefore retries discovery every [`PT_RESOLVE_INTERVAL`] packets and drops
//! what it cannot yet address, rather than blocking the fan-out for everyone
//! on one slow negotiation.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};

use async_trait::async_trait;

use genzh_media_core::codec::{CodecRegistry, MediaKind};
use genzh_media_core::track::TrackId;
use genzh_media_signaling::PeerTarget;
use rtc::media_stream::MediaStreamTrack;
use rtc::rtcp::payload_feedbacks::full_intra_request::FullIntraRequest;
use rtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use rtc::rtp_transceiver::rtp_sender::{
    RTCRtpCodec, RTCRtpCodingParameters, RTCRtpEncodingParameters, RtpCodecKind,
};
use tokio::sync::{Mutex, mpsc};
use webrtc::media_stream::track_local::TrackLocal;
use webrtc::media_stream::track_local::static_rtp::TrackLocalStaticRTP;
use webrtc::peer_connection::{
    PeerConnection, PeerConnectionEventHandler, RTCPeerConnectionIceEvent, RTCPeerConnectionState,
};
use webrtc::rtp_transceiver::RtpSender;

use crate::error::{MediaRoomError, MediaRoomResult};
use crate::participant::SubscriberSink;
use crate::track::PublishedTrack;

use super::config::codec_from_profile;
use super::{PeerEvent, emit_candidate};

/// How many consecutive write failures end a forwarding task.
///
/// Early failures are expected — packets can arrive before the subscriber has
/// finished negotiating — so the threshold has to tolerate a burst, while
/// still reclaiming the task when a connection is genuinely dead.
const MAX_CONSECUTIVE_WRITE_FAILURES: u32 = 500;

/// How often a forwarding task retries payload-type discovery while it is
/// still unresolved, in packets.
const PT_RESOLVE_INTERVAL: u32 = 25;

/// Handles the subscriber connection's events: ICE and connection state.
///
/// Deliberately thinner than [`super::publisher::PublisherHandler`]: nothing
/// arrives on this connection. Tracks are added by the server, which is what
/// [`WebRtcSubscriberSink`] does.
#[derive(Clone)]
pub(super) struct SubscriberHandler {
    events: mpsc::Sender<PeerEvent>,
}

impl SubscriberHandler {
    /// Build the handler for one participant's subscriber connection.
    pub(super) fn new(events: mpsc::Sender<PeerEvent>) -> Arc<Self> {
        Arc::new(Self { events })
    }
}

#[async_trait]
impl PeerConnectionEventHandler for SubscriberHandler {
    async fn on_ice_candidate(&self, event: RTCPeerConnectionIceEvent) {
        emit_candidate(&self.events, PeerTarget::Subscriber, event).await;
    }

    async fn on_connection_state_change(&self, state: RTCPeerConnectionState) {
        let _ = self
            .events
            .send(PeerEvent::ConnectionState {
                target: PeerTarget::Subscriber,
                state: super::map_connection_state(state),
                terminal: super::connection_state_is_terminal(state),
            })
            .await;
    }
}

/// One attached subscription: a local track, its sender, and its tasks.
struct Subscription {
    sender: Arc<dyn RtpSender>,
    forward: tokio::task::JoinHandle<()>,
    feedback: tokio::task::JoinHandle<()>,
}

impl Subscription {
    /// Stop both tasks. Aborting is correct here: the tasks are pure forwarding
    /// loops with no state to unwind, and their channels close on drop.
    fn abort(&self) {
        self.forward.abort();
        self.feedback.abort();
    }
}

/// The production [`SubscriberSink`]: attaches published tracks to a
/// participant's subscriber peer connection.
pub struct WebRtcSubscriberSink {
    subscriber: Arc<dyn PeerConnection>,
    codecs: CodecRegistry,
    subscriptions: Mutex<HashMap<TrackId, Subscription>>,
    renegotiate: mpsc::Sender<()>,
}

impl WebRtcSubscriberSink {
    /// Build the sink that delivers other people's media to one participant.
    ///
    /// `renegotiate` is signalled whenever the track set changes, because
    /// adding or removing a track on this connection requires a fresh offer
    /// and only the signalling loop can send one.
    pub(super) fn new(
        subscriber: Arc<dyn PeerConnection>,
        codecs: CodecRegistry,
        renegotiate: mpsc::Sender<()>,
    ) -> Arc<Self> {
        Arc::new(Self {
            subscriber,
            codecs,
            subscriptions: Mutex::new(HashMap::new()),
            renegotiate,
        })
    }
}

#[async_trait]
impl SubscriberSink for WebRtcSubscriberSink {
    async fn attach(&self, track: Arc<PublishedTrack>) -> MediaRoomResult<()> {
        let track_id = track.id().clone();

        {
            let subscriptions = self.subscriptions.lock().await;
            if subscriptions.contains_key(&track_id) {
                return Ok(());
            }
        }

        let codec = resolve_subscriber_codec(&self.codecs, &track)?;
        let ssrc = rand::random::<u32>();
        let kind = if track.kind().is_audio() {
            RtpCodecKind::Audio
        } else {
            RtpCodecKind::Video
        };

        // The stream id groups a participant's tracks in the client's
        // `ontrack` handler, which is how a browser knows Alice's camera and
        // Alice's microphone belong to the same tile.
        let local = Arc::new(TrackLocalStaticRTP::new(MediaStreamTrack::new(
            track.publisher().to_string(),
            track_id.to_string(),
            track.kind().as_str().to_owned(),
            kind,
            vec![RTCRtpEncodingParameters {
                rtp_coding_parameters: RTCRtpCodingParameters {
                    ssrc: Some(ssrc),
                    ..Default::default()
                },
                active: true,
                codec: codec.clone(),
                ..Default::default()
            }],
        )));

        let sender = self
            .subscriber
            .add_track(local.clone() as Arc<dyn TrackLocal>)
            .await
            .map_err(MediaRoomError::from)?;

        let forward = spawn_forwarder(track.clone(), local.clone(), sender.clone(), ssrc, codec);
        let feedback = spawn_feedback_relay(track.clone(), local);

        self.subscriptions.lock().await.insert(
            track_id,
            Subscription {
                sender,
                forward,
                feedback,
            },
        );

        // For video tracks, request an immediate keyframe so the new subscriber
        // does not have to wait for the publisher's next periodic keyframe.
        if !track.kind().is_audio() {
            track.request_keyframe();
        }

        // Adding a track changes the SDP, so the client needs a new offer.
        // `try_send` on a depth-1 channel coalesces a burst of attachments
        // into a single renegotiation.
        let _ = self.renegotiate.try_send(());

        Ok(())
    }

    async fn detach(&self, track_id: &TrackId) -> MediaRoomResult<()> {
        let Some(subscription) = self.subscriptions.lock().await.remove(track_id) else {
            return Ok(());
        };

        subscription.abort();
        if let Err(error) = self.subscriber.remove_track(&subscription.sender).await {
            tracing::debug!(%track_id, %error, "remove_track failed");
        }

        let _ = self.renegotiate.try_send(());
        Ok(())
    }

    async fn close(&self) {
        let subscriptions: Vec<Subscription> = self
            .subscriptions
            .lock()
            .await
            .drain()
            .map(|(_, s)| s)
            .collect();
        for subscription in &subscriptions {
            subscription.abort();
        }
    }
}

/// Pick the codec for a subscriber-side local track.
///
/// The publisher's negotiated codec is authoritative — forwarding Opus as VP8
/// would be nonsense — and the registry is the fallback for tracks that were
/// created without a negotiation (unit tests, and any future server-generated
/// track).
fn resolve_subscriber_codec(
    codecs: &CodecRegistry,
    track: &PublishedTrack,
) -> MediaRoomResult<RTCRtpCodec> {
    if let Some(codec) = track.codec() {
        return Ok(codec.clone());
    }

    let media_kind = MediaKind::from(track.kind());
    codecs
        .for_kind(media_kind)
        .find(|profile| {
            profile
                .mime_type
                .eq_ignore_ascii_case(&track.info().mime_type)
        })
        .or_else(|| codecs.for_kind(media_kind).next())
        .map(codec_from_profile)
        .ok_or_else(|| MediaRoomError::WebRtc(format!("no codec configured for {}", track.kind())))
}

/// Forward one published track to one subscriber.
fn spawn_forwarder(
    source: Arc<PublishedTrack>,
    local: Arc<TrackLocalStaticRTP>,
    sender: Arc<dyn RtpSender>,
    ssrc: u32,
    codec: RTCRtpCodec,
) -> tokio::task::JoinHandle<()> {
    let mut packets = source.subscribe_rtp();
    let track_id = source.id().clone();
    let is_video = !source.kind().is_audio();

    tokio::spawn(async move {
        // Discovered from the subscriber's own negotiated parameters, then
        // cached — see the module docs on why forwarding the publisher's
        // payload type does not work.
        let payload_type = AtomicU8::new(0);
        let mut since_resolve_attempt = 0_u32;
        let mut consecutive_failures = 0_u32;

        loop {
            let packet = match packets.recv().await {
                Ok(packet) => packet,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(missed)) => {
                    tracing::debug!(%track_id, missed, "subscriber lagged");
                    // Video cannot resynchronise without an intra frame.
                    if is_video {
                        source.request_keyframe();
                    }
                    continue;
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            };

            let mut pt = payload_type.load(Ordering::Relaxed);
            if pt == 0 {
                if since_resolve_attempt == 0 {
                    if let Some(resolved) = resolve_payload_type(&sender, &codec.mime_type).await {
                        payload_type.store(resolved, Ordering::Relaxed);
                        pt = resolved;
                    }
                }
                since_resolve_attempt = (since_resolve_attempt + 1) % PT_RESOLVE_INTERVAL;
                if pt == 0 {
                    // Not negotiated yet: drop rather than queue. A few tens of
                    // milliseconds of audio at the very start of a subscription
                    // is not worth buffering for.
                    continue;
                }
            }

            let mut packet = packet;
            packet.header.ssrc = ssrc;
            packet.header.payload_type = pt;

            match local.write_rtp(packet).await {
                Ok(()) => consecutive_failures = 0,
                Err(error) => {
                    consecutive_failures += 1;
                    if consecutive_failures == 1 {
                        tracing::debug!(%track_id, %error, "forward write failed");
                    }
                    // A codec mismatch means our cached PT went stale across a
                    // renegotiation; re-resolve it.
                    payload_type.store(0, Ordering::Relaxed);
                    since_resolve_attempt = 0;
                    if consecutive_failures >= MAX_CONSECUTIVE_WRITE_FAILURES {
                        tracing::warn!(%track_id, "giving up forwarding after repeated failures");
                        break;
                    }
                }
            }
        }

        tracing::debug!(%track_id, "forwarding task finished");
    })
}

/// Relay a subscriber's keyframe requests back to the publisher.
fn spawn_feedback_relay(
    source: Arc<PublishedTrack>,
    local: Arc<TrackLocalStaticRTP>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(event) = local.poll().await {
            let webrtc::media_stream::track_local::TrackLocalEvent::OnRtcpPacket(packets) = event;
            if packets.iter().any(is_keyframe_request) {
                source.request_keyframe();
            }
        }
    })
}

/// Is this RTCP packet asking for a keyframe?
///
/// Receiver reports and transport feedback arrive constantly; only PLI and FIR
/// mean "I cannot decode, please send an intra frame".
fn is_keyframe_request(packet: &Box<dyn rtc::rtcp::packet::Packet>) -> bool {
    let any = packet.as_any();
    any.is::<PictureLossIndication>() || any.is::<FullIntraRequest>()
}

/// Look up the payload type this subscriber negotiated for `mime_type`.
async fn resolve_payload_type(sender: &Arc<dyn RtpSender>, mime_type: &str) -> Option<u8> {
    let parameters = sender.get_parameters().await.ok()?;
    parameters
        .rtp_parameters
        .codecs
        .iter()
        .find(|codec| codec.rtp_codec.mime_type.eq_ignore_ascii_case(mime_type))
        .map(|codec| codec.payload_type)
        .filter(|pt| *pt != 0)
}


#[cfg(test)]
mod tests {
    use super::*;
    use genzh_media_core::track::{ParticipantId, TrackKind};

    #[test]
    fn keyframe_requests_are_recognised_by_type() {
        let pli: Box<dyn rtc::rtcp::packet::Packet> = Box::new(PictureLossIndication {
            sender_ssrc: 1,
            media_ssrc: 2,
        });
        assert!(is_keyframe_request(&pli));

        let fir: Box<dyn rtc::rtcp::packet::Packet> = Box::new(FullIntraRequest::default());
        assert!(is_keyframe_request(&fir));

        let report: Box<dyn rtc::rtcp::packet::Packet> =
            Box::new(rtc::rtcp::receiver_report::ReceiverReport::default());
        assert!(
            !is_keyframe_request(&report),
            "receiver reports are not keyframe requests"
        );
    }

    #[test]
    fn a_negotiated_publisher_codec_wins_over_the_registry() {
        let registry = CodecRegistry::from_allow_list(Some("opus,vp8"));
        let negotiated = RTCRtpCodec {
            mime_type: "video/VP9".to_owned(),
            clock_rate: 90_000,
            channels: 0,
            sdp_fmtp_line: "profile-id=0".to_owned(),
            rtcp_feedback: Vec::new(),
        };
        let track =
            PublishedTrack::with_codec(ParticipantId::new(), TrackKind::Camera, negotiated, None);

        let resolved = resolve_subscriber_codec(&registry, &track).expect("resolve");
        assert_eq!(
            resolved.mime_type, "video/VP9",
            "forwarding must use what the publisher actually negotiated"
        );
    }

    #[test]
    fn a_track_without_a_negotiated_codec_falls_back_to_the_registry() {
        let registry = CodecRegistry::from_allow_list(Some("opus,vp8"));

        let audio = PublishedTrack::new(ParticipantId::new(), TrackKind::Audio, "audio/opus", None);
        assert_eq!(
            resolve_subscriber_codec(&registry, &audio)
                .unwrap()
                .mime_type,
            "audio/opus"
        );

        // The mime type is unknown to this registry, so the first video codec
        // is used rather than failing the subscription outright.
        let video = PublishedTrack::new(ParticipantId::new(), TrackKind::Camera, "video/AV1", None);
        assert_eq!(
            resolve_subscriber_codec(&registry, &video)
                .unwrap()
                .mime_type,
            "video/VP8"
        );
    }

    #[test]
    fn a_registry_with_no_video_codec_cannot_serve_a_video_track() {
        let audio_only = CodecRegistry::from_allow_list(Some("opus"));
        let video = PublishedTrack::new(ParticipantId::new(), TrackKind::Camera, "video/VP8", None);
        assert!(matches!(
            resolve_subscriber_codec(&audio_only, &video),
            Err(MediaRoomError::WebRtc(_))
        ));
    }
}
