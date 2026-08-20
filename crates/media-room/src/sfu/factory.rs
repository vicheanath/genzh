//! Building a participant's transport.
//!
//! Every participant gets **two** peer connections, not one, and that is the
//! decision this module exists to implement.
//!
//! A single connection would mean every track a participant publishes and
//! every track they receive share one negotiation. Adding a subscriber track
//! would then renegotiate the publisher's media too, and a renegotiation that
//! races with the client's own offer deadlocks the connection — the classic
//! SFU glare problem. Splitting them means the client always offers on the
//! publisher leg and always answers on the subscriber leg, so there is exactly
//! one offerer per connection and glare cannot occur.
//!
//! [`PeerFactory`] holds the shared configuration and the runtime, so the
//! per-participant code never re-derives a media engine or an ICE server list.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;

use genzh_media_core::track::ParticipantId;
use genzh_media_core::ice::IceTransportPolicy;
use rtc::interceptor::Registry;
use rtc::peer_connection::configuration::interceptor_registry::register_default_interceptors;
use rtc::peer_connection::configuration::media_engine::MediaEngine;
use rtc::rtp_transceiver::rtp_sender::RtpCodecKind;
use rtc::rtp_transceiver::{RTCRtpTransceiverDirection, RTCRtpTransceiverInit};
use tokio::sync::{Mutex, mpsc};
use webrtc::peer_connection::{
    PeerConnection, PeerConnectionBuilder, PeerConnectionEventHandler, RTCConfigurationBuilder,
    RTCIceServer, RTCIceTransportPolicy,
};
use webrtc::runtime::Runtime;

use crate::error::{MediaRoomError, MediaRoomResult};

use super::config::{SfuConfig, codec_parameters, rtp_kind};
use super::peers::ParticipantPeers;
use super::publisher::PublisherHandler;
use super::subscriber::{SubscriberHandler, WebRtcSubscriberSink};
use super::TrackIntents;
use crate::transport::{ParticipantTransport, PeerEvents, TransportFactory};

/// Depth of the per-connection peer-event channel.
const PEER_EVENT_DEPTH: usize = 64;

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

}

#[async_trait]
impl TransportFactory for PeerFactory {
    async fn create(
        &self,
        participant_id: ParticipantId,
    ) -> MediaRoomResult<(Arc<dyn ParticipantTransport>, PeerEvents)> {
        let (event_tx, event_rx) = mpsc::channel(PEER_EVENT_DEPTH);
        // Capacity 1 with `try_send` gives free coalescing: a pending signal
        // already covers any further need to renegotiate.
        let (renegotiate_tx, renegotiate_rx) = mpsc::channel(1);

        // Shared with the signalling side, which records what the client says
        // its next track is for; everything else each half owns itself.
        let intents: TrackIntents = Arc::new(Mutex::new(HashMap::new()));

        let publisher = self
            .build(PublisherHandler::new(
                participant_id,
                event_tx.clone(),
                intents.clone(),
                self.config.vad_mode,
                self.config.audio_level_ext_id,
                self.runtime.clone(),
            ))
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

        let subscriber = self.build(SubscriberHandler::new(event_tx.clone())).await?;

        let sink = WebRtcSubscriberSink::new(
            subscriber.clone(),
            self.config.codecs.clone(),
            renegotiate_tx,
        );

        let peers = ParticipantPeers::new(participant_id, publisher, subscriber, sink, intents);

        Ok((
            peers,
            PeerEvents {
                events: event_rx,
                renegotiate: renegotiate_rx,
            },
        ))
    }
}
