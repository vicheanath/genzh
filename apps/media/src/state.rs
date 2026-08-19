//! Media server state.

use std::sync::Arc;

use genzh_media_room::room::AutoSubscribe;
use genzh_media_room::{MediaRoomManager, PeerFactory, RoomConfig, SfuConfig};

use crate::auth::TokenVerifier;
use crate::config::Config;

/// Shared state for every signalling connection.
#[derive(Clone)]
pub struct MediaState {
    /// Live rooms.
    pub rooms: Arc<MediaRoomManager>,
    /// Builds peer connections.
    pub peers: Arc<PeerFactory>,
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
