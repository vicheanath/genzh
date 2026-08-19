//! The SFU: WebRTC transport for one participant.
//!
//! This is the only module in the workspace that talks to `webrtc-rs`, and the
//! only one where the difficult parts live. Read this before changing
//! anything here.
//!
//! ## Selective forwarding, concretely
//!
//! ```text
//!   Alice ──publisher PC──▶ on_track ──▶ pump task ──▶ broadcast channel
//!                                                              │
//!                                     ┌────────────────────────┼────────────────┐
//!                                     ▼                        ▼                ▼
//!                               Bob's forward task      Sarah's           Mike's
//!                                     │                        │                │
//!                               subscriber PC            subscriber PC    subscriber PC
//! ```
//!
//! One decode is never performed. One encode is never performed. The packet
//! that arrives is the packet that leaves, with three fields of its header
//! rewritten. That is what "selective forwarding" means, and it is why CPU
//! grows with *packets* rather than with *pixels*.
//!
//! ## The three rewrites, and why each is mandatory
//!
//! `rtc`'s sender validates every packet before it goes out (see
//! `RtpSender::write_rtp`), and rejects anything that does not match what that
//! particular connection negotiated. So a forwarded packet must be adjusted:
//!
//! 1. **SSRC.** Each subscriber's local track has its own synchronisation
//!    source. Forwarding Alice's SSRC verbatim is rejected with
//!    `ErrSenderWithNoSSRCs`.
//! 2. **Payload type.** Alice's browser may have negotiated Opus as PT 111
//!    while Bob's negotiated 109. Forwarding PT 111 to Bob is rejected with
//!    `ErrRTPTransceiverCodecUnsupported`. The correct PT is discovered from
//!    the subscriber's own sender parameters once negotiation completes, and
//!    cached.
//! 3. **Header extensions.** Extension *ids* are per-connection. Alice's
//!    `mid` extension might be id 4 on her leg and id 9 on Bob's; forwarding
//!    hers is rejected with `ErrHeaderExtensionNotFound`. Since the SFU has no
//!    use for re-signalling them, they are stripped once in the pump task
//!    rather than remapped per subscriber.
//!
//! Everything else — sequence numbers, timestamps, marker bits, the payload —
//! passes through untouched, which is exactly what keeps the stream decodable.
//!
//! ## Keyframes
//!
//! An SFU cannot make a keyframe; it has no encoder. When a video subscriber
//! joins mid-stream or loses packets, it sends a PLI. That PLI is meaningful
//! only to the *publisher*, so it is relayed upstream (rate-limited, because
//! ten subscribers joining at once must not turn into ten keyframe requests).
//!
//! ## Back-pressure
//!
//! Every channel here is bounded. A subscriber that stops draining is lagged
//! by the broadcast channel and loses packets; for video it then gets a
//! keyframe. Buffering instead would trade a momentary glitch for unbounded
//! memory and ever-growing latency — the wrong trade for realtime media.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering};

use async_trait::async_trait;
use genzh_media_core::codec::{CodecProfile, CodecRegistry, MediaKind};
use genzh_media_core::ice::{IceConfig, IceTransportPolicy};
use genzh_media_core::track::{ParticipantId, TrackId, TrackKind};
use genzh_media_core::vad::{AudioLevelSample, SpeakingTransition, VadMode, VoiceActivityDetector};
use genzh_media_signaling::PeerTarget;
use rtc::interceptor::Registry;
use rtc::media_stream::MediaStreamTrack;
use rtc::peer_connection::configuration::interceptor_registry::register_default_interceptors;
use rtc::peer_connection::configuration::media_engine::MediaEngine;
use rtc::rtcp::payload_feedbacks::full_intra_request::FullIntraRequest;
use rtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use rtc::rtp_transceiver::rtp_sender::{
    RTCRtpCodec, RTCRtpCodecParameters, RTCRtpCodingParameters, RTCRtpEncodingParameters,
    RtpCodecKind,
};
use rtc::rtp_transceiver::{RTCRtpTransceiverDirection, RTCRtpTransceiverInit};
use tokio::sync::{Mutex, mpsc};
use webrtc::media_stream::track_local::TrackLocal;
use webrtc::media_stream::track_local::static_rtp::TrackLocalStaticRTP;
use webrtc::media_stream::track_remote::{TrackRemote, TrackRemoteEvent};
use webrtc::peer_connection::{
    PeerConnection, PeerConnectionBuilder, PeerConnectionEventHandler, RTCConfigurationBuilder,
    RTCIceCandidateInit, RTCIceServer, RTCIceTransportPolicy, RTCPeerConnectionIceEvent,
    RTCPeerConnectionState, RTCSessionDescription,
};
use webrtc::rtp_transceiver::RtpSender;
use webrtc::runtime::Runtime;

use crate::error::{MediaRoomError, MediaRoomResult};
use crate::participant::SubscriberSink;
use crate::track::{KeyframeRequester, PublishedTrack};

/// Depth of the per-connection peer-event channel.
const PEER_EVENT_DEPTH: usize = 64;

/// Minimum gap between keyframe requests relayed to one publisher.
const PLI_MIN_INTERVAL_MS: u64 = 500;

/// How many consecutive write failures end a forwarding task.
///
/// Early failures are expected — packets can arrive before the subscriber has
/// finished negotiating — so the threshold has to tolerate a burst, while
/// still reclaiming the task when a connection is genuinely dead.
const MAX_CONSECUTIVE_WRITE_FAILURES: u32 = 500;

/// How often a forwarding task retries payload-type discovery while it is
/// still unresolved, in packets.
const PT_RESOLVE_INTERVAL: u32 = 25;

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

/// Something that happened on a participant's peer connections and that the
/// connection loop must act on.
#[derive(Debug)]
pub enum PeerEvent {
    /// A local ICE candidate to trickle to the client.
    IceCandidate {
        /// Which connection it belongs to.
        target: PeerTarget,
        /// The candidate attribute.
        candidate: String,
        /// Media-section id.
        sdp_mid: Option<String>,
        /// Media-section index.
        sdp_mline_index: Option<u16>,
    },

    /// A connection changed state.
    ConnectionState {
        /// Which connection.
        target: PeerTarget,
        /// New state.
        state: RTCPeerConnectionState,
    },

    /// The publisher started sending a track; it is ready to be registered
    /// with the room.
    TrackReady {
        /// The track, with its fan-out channel already pumping.
        track: Arc<PublishedTrack>,
    },

    /// A published track ended (the publisher stopped it, or the connection
    /// dropped).
    TrackEnded {
        /// What ended.
        kind: TrackKind,
    },

    /// Server-side voice activity detection fired.
    Speaking {
        /// Whether speech started or stopped.
        transition: SpeakingTransition,
    },
}

/// Builds peer connections with this server's shared configuration.
pub struct PeerFactory {
    config: Arc<SfuConfig>,
    runtime: Arc<dyn Runtime>,
}

impl std::fmt::Debug for PeerFactory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PeerFactory")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

impl PeerFactory {
    /// Create a factory.
    ///
    /// Fails if no async runtime feature is compiled in, which would otherwise
    /// surface as a confusing error on the first join.
    pub fn new(config: SfuConfig) -> MediaRoomResult<Arc<Self>> {
        let runtime = webrtc::runtime::default_runtime().ok_or_else(|| {
            MediaRoomError::WebRtc("no webrtc runtime feature enabled".to_owned())
        })?;
        Ok(Arc::new(Self {
            config: Arc::new(config),
            runtime,
        }))
    }

    /// The configuration in use.
    pub fn config(&self) -> &SfuConfig {
        &self.config
    }

    fn ice_servers(&self) -> Vec<RTCIceServer> {
        self.config
            .ice
            .ice_servers
            .iter()
            .map(|server| RTCIceServer {
                urls: server.urls.clone(),
                username: server.username.clone().unwrap_or_default(),
                credential: server.credential.clone().unwrap_or_default(),
            })
            .collect()
    }

    /// Build a media engine carrying exactly the configured codecs.
    ///
    /// Deliberately *not* `register_default_codecs`: the whole point of the
    /// codec registry is that a deployment decides what it negotiates.
    fn media_engine(&self) -> MediaRoomResult<MediaEngine> {
        let mut engine = MediaEngine::default();

        for profile in self.config.codecs.codecs() {
            engine
                .register_codec(codec_parameters(profile), rtp_kind(profile.kind))
                .map_err(MediaRoomError::from)?;
        }

        Ok(engine)
    }

    async fn build(
        &self,
        handler: Arc<dyn PeerConnectionEventHandler>,
    ) -> MediaRoomResult<Arc<dyn PeerConnection>> {
        let mut media_engine = self.media_engine()?;
        let registry = register_default_interceptors(Registry::new(), &mut media_engine)
            .map_err(MediaRoomError::from)?;

        let configuration = RTCConfigurationBuilder::new()
            .with_ice_servers(self.ice_servers())
            .with_ice_transport_policy(match self.config.ice.ice_transport_policy {
                IceTransportPolicy::All => RTCIceTransportPolicy::All,
                IceTransportPolicy::Relay => RTCIceTransportPolicy::Relay,
            })
            .build();

        let peer = PeerConnectionBuilder::new()
            .with_configuration(configuration)
            .with_media_engine(media_engine)
            .with_interceptor_registry(registry)
            .with_handler(handler)
            .with_runtime(self.runtime.clone())
            .with_udp_addrs(self.config.udp_addrs.clone())
            .build()
            .await
            .map_err(MediaRoomError::from)?;

        Ok(Arc::new(peer))
    }

    /// Create both peer connections for one participant.
    ///
    /// Returns the transport plus the event stream the connection loop drives.
    pub async fn create(
        self: &Arc<Self>,
        participant_id: ParticipantId,
    ) -> MediaRoomResult<(Arc<ParticipantPeers>, PeerEvents)> {
        let (event_tx, event_rx) = mpsc::channel(PEER_EVENT_DEPTH);
        // Capacity 1 with `try_send` gives free coalescing: a pending signal
        // already covers any further need to renegotiate.
        let (renegotiate_tx, renegotiate_rx) = mpsc::channel(1);

        let intents = Arc::new(Mutex::new(HashMap::new()));
        let published_kinds = Arc::new(Mutex::new(Vec::new()));

        let publisher = self
            .build(Arc::new(PublisherHandler {
                participant_id,
                events: event_tx.clone(),
                intents: intents.clone(),
                published_kinds,
                vad_mode: self.config.vad_mode,
                audio_level_ext_id: self.config.audio_level_ext_id,
                runtime: self.runtime.clone(),
            }))
            .await?;

        // The publisher connection only ever receives. Pre-declaring the
        // directions means the client's first offer has somewhere to land
        // without an extra round trip.
        for kind in [RtpCodecKind::Audio, RtpCodecKind::Video] {
            publisher
                .add_transceiver_from_kind(
                    kind,
                    Some(RTCRtpTransceiverInit {
                        direction: RTCRtpTransceiverDirection::Recvonly,
                        ..Default::default()
                    }),
                )
                .await
                .map_err(MediaRoomError::from)?;
        }

        let subscriber = self
            .build(Arc::new(SubscriberHandler {
                events: event_tx.clone(),
            }))
            .await?;

        let sink = Arc::new(WebRtcSubscriberSink {
            subscriber: subscriber.clone(),
            codecs: self.config.codecs.clone(),
            subscriptions: Mutex::new(HashMap::new()),
            renegotiate: renegotiate_tx,
        });

        let peers = Arc::new(ParticipantPeers {
            participant_id,
            publisher,
            subscriber,
            sink,
            intents,
            negotiation: NegotiationState::default(),
        });

        Ok((
            peers,
            PeerEvents {
                events: event_rx,
                renegotiate: renegotiate_rx,
            },
        ))
    }
}

/// The receiving halves of a participant's transport channels.
pub struct PeerEvents {
    /// Events from the peer connections.
    pub events: mpsc::Receiver<PeerEvent>,
    /// Fires when the subscriber connection needs a fresh offer.
    pub renegotiate: mpsc::Receiver<()>,
}

/// Tracks whether a subscriber offer is outstanding.
///
/// Only one offer/answer exchange may be in flight on a connection. If tracks
/// are added while we are waiting for an answer, the need is remembered and a
/// second offer goes out as soon as the first exchange completes.
#[derive(Debug, Default)]
struct NegotiationState {
    awaiting_answer: AtomicBool,
    dirty: AtomicBool,
}

/// One participant's pair of peer connections.
pub struct ParticipantPeers {
    participant_id: ParticipantId,
    publisher: Arc<dyn PeerConnection>,
    subscriber: Arc<dyn PeerConnection>,
    sink: Arc<WebRtcSubscriberSink>,
    intents: Arc<Mutex<HashMap<String, TrackKind>>>,
    negotiation: NegotiationState,
}

impl std::fmt::Debug for ParticipantPeers {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ParticipantPeers")
            .field("participant_id", &self.participant_id)
            .finish_non_exhaustive()
    }
}

impl ParticipantPeers {
    /// The sink to hand to [`crate::participant::Participant`].
    pub fn sink(&self) -> Arc<dyn SubscriberSink> {
        self.sink.clone()
    }

    /// Record what a client says its next track is for.
    ///
    /// SDP cannot distinguish a camera from a screen capture — both are just
    /// video — so the client declares intent and the server correlates it with
    /// the `msid` that arrives in the offer.
    pub async fn declare_intent(&self, client_track_id: String, kind: TrackKind) {
        self.intents.lock().await.insert(client_track_id, kind);
    }

    /// Handle the client's offer on the publisher connection and produce the
    /// answer.
    ///
    /// The answer is returned immediately rather than after ICE gathering
    /// completes: candidates trickle separately, which is what keeps
    /// time-to-first-audio low on mobile networks.
    pub async fn accept_publisher_offer(&self, sdp: String) -> MediaRoomResult<String> {
        let offer = RTCSessionDescription::offer(sdp).map_err(MediaRoomError::from)?;
        self.publisher
            .set_remote_description(offer)
            .await
            .map_err(MediaRoomError::from)?;

        let answer = self
            .publisher
            .create_answer(None)
            .await
            .map_err(MediaRoomError::from)?;
        let sdp = answer.sdp.clone();
        self.publisher
            .set_local_description(answer)
            .await
            .map_err(MediaRoomError::from)?;

        Ok(sdp)
    }

    /// Create an offer on the subscriber connection, if one is not already in
    /// flight.
    ///
    /// Returns `None` when an exchange is outstanding; the need is remembered
    /// and [`ParticipantPeers::accept_subscriber_answer`] will report that a
    /// follow-up offer is required.
    pub async fn create_subscriber_offer(&self) -> MediaRoomResult<Option<String>> {
        if self
            .negotiation
            .awaiting_answer
            .swap(true, Ordering::SeqCst)
        {
            self.negotiation.dirty.store(true, Ordering::SeqCst);
            return Ok(None);
        }

        let offer = match self.subscriber.create_offer(None).await {
            Ok(offer) => offer,
            Err(error) => {
                self.negotiation
                    .awaiting_answer
                    .store(false, Ordering::SeqCst);
                return Err(MediaRoomError::from(error));
            }
        };

        let sdp = offer.sdp.clone();
        if let Err(error) = self.subscriber.set_local_description(offer).await {
            self.negotiation
                .awaiting_answer
                .store(false, Ordering::SeqCst);
            return Err(MediaRoomError::from(error));
        }

        Ok(Some(sdp))
    }

    /// Apply the client's answer on the subscriber connection.
    ///
    /// Returns `true` when tracks were added while the exchange was in flight
    /// and another offer is needed.
    pub async fn accept_subscriber_answer(&self, sdp: String) -> MediaRoomResult<bool> {
        let answer = RTCSessionDescription::answer(sdp).map_err(MediaRoomError::from)?;
        self.subscriber
            .set_remote_description(answer)
            .await
            .map_err(MediaRoomError::from)?;

        self.negotiation
            .awaiting_answer
            .store(false, Ordering::SeqCst);
        Ok(self.negotiation.dirty.swap(false, Ordering::SeqCst))
    }

    /// Add a remote ICE candidate to the named connection.
    pub async fn add_ice_candidate(
        &self,
        target: PeerTarget,
        candidate: String,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u16>,
    ) -> MediaRoomResult<()> {
        let init = RTCIceCandidateInit {
            candidate,
            sdp_mid,
            sdp_mline_index,
            username_fragment: None,
            ..Default::default()
        };

        let peer = match target {
            PeerTarget::Publisher => &self.publisher,
            PeerTarget::Subscriber => &self.subscriber,
        };
        peer.add_ice_candidate(init)
            .await
            .map_err(MediaRoomError::from)
    }

    /// Close both connections and stop every forwarding task.
    pub async fn close(&self) {
        self.sink.close().await;
        if let Err(error) = self.publisher.close().await {
            tracing::debug!(participant_id = %self.participant_id, %error, "publisher close failed");
        }
        if let Err(error) = self.subscriber.close().await {
            tracing::debug!(participant_id = %self.participant_id, %error, "subscriber close failed");
        }
    }
}

// ─────────────────────────────── publisher ───────────────────────────────

#[derive(Clone)]
struct PublisherHandler {
    participant_id: ParticipantId,
    events: mpsc::Sender<PeerEvent>,
    intents: Arc<Mutex<HashMap<String, TrackKind>>>,
    published_kinds: Arc<Mutex<Vec<TrackKind>>>,
    vad_mode: VadMode,
    audio_level_ext_id: u8,
    runtime: Arc<dyn Runtime>,
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
                state,
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
/// Rate-limited: ten subscribers joining at once must not become ten PLIs, or
/// the publisher spends its whole bitrate on intra frames.
fn keyframe_requester(
    remote: Arc<dyn TrackRemote>,
    media_ssrc: u32,
    runtime: Arc<dyn Runtime>,
) -> KeyframeRequester {
    let last_sent_ms = Arc::new(AtomicU64::new(0));

    KeyframeRequester::new(move || {
        let now_ms = monotonic_millis();
        let previous = last_sent_ms.load(Ordering::Relaxed);
        if now_ms.saturating_sub(previous) < PLI_MIN_INTERVAL_MS {
            return;
        }
        if last_sent_ms
            .compare_exchange(previous, now_ms, Ordering::SeqCst, Ordering::Relaxed)
            .is_err()
        {
            // Somebody else just sent one.
            return;
        }

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

// ─────────────────────────────── subscriber ──────────────────────────────

#[derive(Clone)]
struct SubscriberHandler {
    events: mpsc::Sender<PeerEvent>,
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
                state,
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

// ──────────────────────────────── helpers ────────────────────────────────

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

/// Translate a WebRTC connection state into the room layer's own.
///
/// The room model deliberately has fewer states than WebRTC does: it does not
/// care about the difference between "new" and "connecting", only about
/// whether media can flow and whether the participant is gone.
pub fn map_connection_state(state: RTCPeerConnectionState) -> crate::ConnectionState {
    match state {
        RTCPeerConnectionState::Connected => crate::ConnectionState::Connected,
        RTCPeerConnectionState::Disconnected => crate::ConnectionState::Reconnecting,
        RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed => {
            crate::ConnectionState::Closed
        }
        _ => crate::ConnectionState::Connecting,
    }
}

/// Is this state unrecoverable?
///
/// `Disconnected` is explicitly *not* terminal: ICE routinely reports it
/// during a network handover and recovers on its own a second later. Tearing
/// the session down there would drop every call that changes from Wi-Fi to
/// cellular. `Failed` is the state that means ICE has given up.
pub fn connection_state_is_terminal(state: RTCPeerConnectionState) -> bool {
    matches!(
        state,
        RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed
    )
}

/// Milliseconds from a monotonic clock, for VAD and rate limiting.
fn monotonic_millis() -> u64 {
    use std::sync::OnceLock;
    use std::time::Instant;

    static ORIGIN: OnceLock<Instant> = OnceLock::new();
    ORIGIN.get_or_init(Instant::now).elapsed().as_millis() as u64
}

fn rtp_kind(kind: MediaKind) -> RtpCodecKind {
    match kind {
        MediaKind::Audio => RtpCodecKind::Audio,
        MediaKind::Video => RtpCodecKind::Video,
    }
}

fn codec_from_profile(profile: &CodecProfile) -> RTCRtpCodec {
    RTCRtpCodec {
        mime_type: profile.mime_type.to_owned(),
        clock_rate: profile.clock_rate,
        channels: profile.channels,
        sdp_fmtp_line: profile.fmtp.to_owned(),
        rtcp_feedback: Vec::new(),
    }
}

fn codec_parameters(profile: &CodecProfile) -> RTCRtpCodecParameters {
    RTCRtpCodecParameters {
        rtp_codec: codec_from_profile(profile),
        payload_type: profile.payload_type,
    }
}

async fn emit_candidate(
    events: &mpsc::Sender<PeerEvent>,
    target: PeerTarget,
    event: RTCPeerConnectionIceEvent,
) {
    let Ok(init) = event.candidate.to_json() else {
        tracing::debug!(
            target = target.as_str(),
            "could not serialise local ICE candidate"
        );
        return;
    };

    let _ = events
        .send(PeerEvent::IceCandidate {
            target,
            candidate: init.candidate,
            sdp_mid: init.sdp_mid,
            sdp_mline_index: init.sdp_mline_index,
        })
        .await;
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

    #[test]
    fn a_network_handover_does_not_end_the_session() {
        // ICE reports Disconnected during a Wi-Fi to cellular switch and
        // usually recovers; only Failed and Closed are the end.
        assert!(!connection_state_is_terminal(
            RTCPeerConnectionState::Disconnected
        ));
        assert!(!connection_state_is_terminal(
            RTCPeerConnectionState::Connecting
        ));
        assert!(!connection_state_is_terminal(RTCPeerConnectionState::New));
        assert!(connection_state_is_terminal(RTCPeerConnectionState::Failed));
        assert!(connection_state_is_terminal(RTCPeerConnectionState::Closed));
    }

    #[test]
    fn connection_states_map_onto_the_room_model() {
        use crate::ConnectionState;
        assert_eq!(
            map_connection_state(RTCPeerConnectionState::Connected),
            ConnectionState::Connected
        );
        assert_eq!(
            map_connection_state(RTCPeerConnectionState::Disconnected),
            ConnectionState::Reconnecting
        );
        assert_eq!(
            map_connection_state(RTCPeerConnectionState::Failed),
            ConnectionState::Closed
        );
        assert_eq!(
            map_connection_state(RTCPeerConnectionState::New),
            ConnectionState::Connecting
        );
    }

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
