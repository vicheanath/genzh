//! The negotiation lifecycle of one participant's two connections.
//!
//! This is where SDP and ICE are handled, and it is deliberately the only
//! place: [`ParticipantPeers`] is what the signalling loop holds, so every
//! offer, answer and candidate passes through one type with one set of rules
//! about what may be in flight when.
//!
//! The rule that matters is in [`NegotiationState`]: only one offer/answer
//! exchange may be outstanding per connection. Tracks added while an exchange
//! is in flight set a flag rather than triggering a second offer, and the
//! flag is drained when the answer lands.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use genzh_media_core::track::{ParticipantId, TrackKind};
use genzh_media_signaling::PeerTarget;
use webrtc::peer_connection::{PeerConnection, RTCIceCandidateInit, RTCSessionDescription};

use async_trait::async_trait;

use crate::error::{MediaRoomError, MediaRoomResult};
use crate::participant::SubscriberSink;
use crate::transport::ParticipantTransport;

use super::TrackIntents;
use super::subscriber::WebRtcSubscriberSink;

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
    intents: TrackIntents,
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
    /// Assemble a participant's transport from its two connections.
    ///
    /// Called only by [`super::factory::PeerFactory`], which is the one place
    /// that knows how a connection is configured. Everything after that goes
    /// through the methods below, so the negotiation invariant — one exchange
    /// in flight per connection — has a single owner.
    pub(super) fn new(
        participant_id: ParticipantId,
        publisher: Arc<dyn PeerConnection>,
        subscriber: Arc<dyn PeerConnection>,
        sink: Arc<WebRtcSubscriberSink>,
        intents: TrackIntents,
    ) -> Arc<Self> {
        Arc::new(Self {
            participant_id,
            publisher,
            subscriber,
            sink,
            intents,
            negotiation: NegotiationState::default(),
        })
    }
}

#[async_trait]
impl ParticipantTransport for ParticipantPeers {
    /// The sink to hand to [`crate::participant::Participant`].
    fn sink(&self) -> Arc<dyn SubscriberSink> {
        self.sink.clone()
    }

    /// Record what a client says its next track is for.
    ///
    /// SDP cannot distinguish a camera from a screen capture — both are just
    /// video — so the client declares intent and the server correlates it with
    /// the `msid` that arrives in the offer.
    async fn declare_intent(&self, client_track_id: String, kind: TrackKind) {
        self.intents.lock().await.insert(client_track_id, kind);
    }

    /// Handle the client's offer on the publisher connection and produce the
    /// answer.
    ///
    /// The answer is returned immediately rather than after ICE gathering
    /// completes: candidates trickle separately, which is what keeps
    /// time-to-first-audio low on mobile networks.
    async fn accept_publisher_offer(&self, sdp: String) -> MediaRoomResult<String> {
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
    async fn create_subscriber_offer(&self) -> MediaRoomResult<Option<String>> {
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
    async fn accept_subscriber_answer(&self, sdp: String) -> MediaRoomResult<bool> {
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
    async fn add_ice_candidate(
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
    async fn close(&self) {
        self.sink.close().await;
        if let Err(error) = self.publisher.close().await {
            tracing::debug!(participant_id = %self.participant_id, %error, "publisher close failed");
        }
        if let Err(error) = self.subscriber.close().await {
            tracing::debug!(participant_id = %self.participant_id, %error, "subscriber close failed");
        }
    }
}

