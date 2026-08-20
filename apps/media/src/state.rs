//! Media server state.

use std::sync::Arc;

use genzh_media_room::room::AutoSubscribe;
use genzh_media_room::{MediaRoomManager, PeerFactory, RoomConfig, SfuConfig, TransportFactory};

use crate::auth::TokenVerifier;
use crate::config::Config;

/// Shared state for every signalling connection.
#[derive(Clone)]
pub struct MediaState {
    /// Live rooms.
    pub rooms: Arc<MediaRoomManager>,
    /// Builds peer connections.
    ///
    /// Held as the port rather than as [`PeerFactory`]: the signalling loop
    /// needs a transport, not a WebRTC stack, and this is the line that decides
    /// which one it gets.
    pub peers: Arc<dyn TransportFactory>,
    /// Verifies media tokens.
    pub verifier: Arc<TokenVerifier>,
    /// The configuration this process started with.
    pub config: Arc<Config>,
}

impl std::fmt::Debug for MediaState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MediaState").finish_non_exhaustive()
    }
}

#[cfg(test)]
impl MediaState {
    /// Server state over doubles, for testing the signalling rules.
    ///
    /// The transport factory is the fake one, so nothing here opens a socket.
    pub fn for_test() -> Self {
        Self::for_test_with_vad(genzh_media_core::vad::VadMode::default())
    }

    /// The same, with an explicit VAD mode.
    ///
    /// Separate because which detector is running changes whether a client's
    /// own speaking claim is honoured, and that rule is worth testing on both
    /// sides of the switch.
    pub fn for_test_with_vad(vad_mode: genzh_media_core::vad::VadMode) -> Self {
        use genzh_media_core::codec::CodecRegistry;
        use genzh_media_core::ice::IceConfig;

        let config = Config {
            bind: "127.0.0.1:0".parse().expect("valid address"),
            media_token_secret: "test-media-secret-value-at-least-32b".to_owned(),
            token_issuer: "social.api".to_owned(),
            codecs: CodecRegistry::default(),
            ice: IceConfig::default(),
            udp_addrs: vec!["0.0.0.0:0".to_owned()],
            vad_mode,
            audio_level_ext_id: 1,
            auto_subscribe_video: false,
            room_capacity: 16,
        };

        Self {
            rooms: MediaRoomManager::new(RoomConfig::default()),
            peers: Arc::new(TestTransportFactory),
            verifier: Arc::new(TokenVerifier::new(
                config.media_token_secret.as_bytes(),
                &config.token_issuer,
            )),
            config: Arc::new(config),
        }
    }
}

/// A [`TransportFactory`] that hands out [`FakeTransport`]s.
#[cfg(test)]
struct TestTransportFactory;

#[cfg(test)]
#[async_trait::async_trait]
impl TransportFactory for TestTransportFactory {
    async fn create(
        &self,
        _participant_id: genzh_media_core::track::ParticipantId,
    ) -> genzh_media_room::MediaRoomResult<(
        Arc<dyn genzh_media_room::ParticipantTransport>,
        genzh_media_room::PeerEvents,
    )> {
        let (_events_tx, events) = tokio::sync::mpsc::channel(1);
        let (_renegotiate_tx, renegotiate) = tokio::sync::mpsc::channel(1);
        Ok((
            genzh_media_room::transport::test_support::FakeTransport::new(),
            genzh_media_room::PeerEvents {
                events,
                renegotiate,
            },
        ))
    }
}

impl MediaState {
    /// Wire everything together from the configuration.
    pub fn build(config: Config) -> Result<Self, genzh_media_room::MediaRoomError> {
        let peers = PeerFactory::new(SfuConfig {
            codecs: config.codecs.clone(),
            ice: config.ice.clone(),
            udp_addrs: config.udp_addrs.clone(),
            vad_mode: config.vad_mode,
            audio_level_ext_id: config.audio_level_ext_id,
        })?;

        let rooms = MediaRoomManager::new(RoomConfig {
            capacity: config.room_capacity,
            auto_subscribe: if config.auto_subscribe_video {
                AutoSubscribe::All
            } else {
                AutoSubscribe::AudioOnly
            },
        });

        let verifier = Arc::new(TokenVerifier::new(
            config.media_token_secret.as_bytes(),
            &config.token_issuer,
        ));

        Ok(Self {
            rooms,
            peers,
            verifier,
            config: Arc::new(config),
        })
    }
}
