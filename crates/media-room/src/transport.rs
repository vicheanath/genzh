//! The transport port.
//!
//! A participant needs two peer connections, an SDP exchange on each, and a
//! stream of things that happen to them. *That* is what the signalling server
//! actually depends on — not WebRTC, not `webrtc-rs`, not DTLS.
//!
//! This module states it as two traits, and [`crate::sfu`] implements them.
//! The split buys the same thing [`crate::participant::SubscriberSink`] already
//! buys one layer down: the signalling loop can be driven end to end with no
//! UDP sockets, no ICE and no timing, which is the difference between "the
//! renegotiation rule is tested" and "the renegotiation rule is tested by hand
//! with two browsers".
//!
//! It is also what keeps `apps/media` from linking `webrtc` at all. Nothing in
//! this file names a transport type: connection states arrive already
//! translated into [`crate::ConnectionState`], candidates arrive as the strings
//! that go on the wire.

use std::sync::Arc;

use async_trait::async_trait;
use genzh_media_core::track::{ParticipantId, TrackKind};
use genzh_media_core::vad::SpeakingTransition;
use genzh_media_signaling::PeerTarget;
use tokio::sync::mpsc;

use crate::error::MediaRoomResult;
use crate::participant::SubscriberSink;
use crate::track::PublishedTrack;

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
    ///
    /// Carries the *room's* state vocabulary, not the transport's. Translating
    /// at the implementation boundary is what lets a caller consume peer events
    /// without linking a WebRTC stack.
    ConnectionState {
        /// Which connection.
        target: PeerTarget,
        /// New state, in room terms.
        state: crate::ConnectionState,
        /// True when the transport has given up and the participant is gone.
        ///
        /// Carried rather than derived from `state`, because the caller must
        /// not have to know which states are recoverable — ICE routinely
        /// reports a disconnect during a network handover and recovers a
        /// second later, and treating that as terminal would drop every call
        /// that moves from Wi-Fi to cellular.
        terminal: bool,
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

/// The receiving halves of a participant's transport channels.
///
/// Two channels rather than one because they have different urgency and
/// different back-pressure: events must all arrive, while renegotiation
/// requests coalesce — a pending signal already covers any further need.
pub struct PeerEvents {
    /// Events from the peer connections.
    pub events: mpsc::Receiver<PeerEvent>,
    /// Fires when the subscriber connection needs a fresh offer.
    pub renegotiate: mpsc::Receiver<()>,
}

/// One participant's transport, as the signalling loop sees it.
///
/// The asymmetry in the method names is the protocol's central rule: the client
/// offers on the publisher connection (`accept_publisher_offer`) and the server
/// offers on the subscriber connection (`create_subscriber_offer`). An
/// implementation that offered on both would reintroduce glare, so the trait
/// does not give it the option.
#[async_trait]
pub trait ParticipantTransport: Send + Sync + 'static {
    /// The sink to hand to [`crate::participant::Participant`], through which
    /// the room delivers other people's tracks.
    fn sink(&self) -> Arc<dyn SubscriberSink>;

    /// Record what the client says its next published track is for.
    ///
    /// SDP cannot distinguish a camera from a screen share, so the declaration
    /// arrives separately and is matched when the track lands.
    async fn declare_intent(&self, client_track_id: String, kind: TrackKind);

    /// Answer the client's offer on the publisher connection.
    async fn accept_publisher_offer(&self, sdp: String) -> MediaRoomResult<String>;

    /// Offer the subscriber connection's current track set.
    ///
    /// `None` means an exchange is already in flight. Implementations must
    /// remember the need and satisfy it when the answer lands, rather than
    /// sending a second overlapping offer.
    async fn create_subscriber_offer(&self) -> MediaRoomResult<Option<String>>;

    /// Take the client's answer to a subscriber offer.
    ///
    /// Returns `true` when the track set changed while the offer was in flight
    /// and another offer is owed.
    async fn accept_subscriber_answer(&self, sdp: String) -> MediaRoomResult<bool>;

    /// Add a trickled candidate to one of the two connections.
    async fn add_ice_candidate(
        &self,
        target: PeerTarget,
        candidate: String,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u16>,
    ) -> MediaRoomResult<()>;

    /// Tear both connections down. Called exactly once, at teardown.
    async fn close(&self);
}

/// Creates a participant's transport.
///
/// Separate from [`ParticipantTransport`] because the two have different
/// lifetimes and different knowledge: the factory holds what every connection
/// on this server shares — codecs, ICE servers, the runtime — and a transport
/// holds one participant's sockets.
#[async_trait]
pub trait TransportFactory: Send + Sync + 'static {
    /// Build both connections for one participant.
    ///
    /// Returns the transport plus the event stream the connection loop drives.
    async fn create(
        &self,
        participant_id: ParticipantId,
    ) -> MediaRoomResult<(Arc<dyn ParticipantTransport>, PeerEvents)>;
}

/// Doubles for exercising a signalling loop without a WebRTC stack.
///
/// Lives in the crate rather than in a `#[cfg(test)]` block because the code
/// that needs it is in `apps/media`, a different crate: the whole point of the
/// port is that the *consumer* can be tested, and a consumer in another crate
/// cannot reach into this one's test module.
pub mod test_support {
    use super::*;
    use tokio::sync::Mutex;

    /// A transport that records what it was asked to do and answers plausibly.
    ///
    /// Deliberately not a no-op: it returns SDP-shaped strings and honours the
    /// one-exchange-in-flight rule, so a caller that mishandles renegotiation
    /// fails here rather than passing and failing against a browser.
    #[derive(Default)]
    pub struct FakeTransport {
        /// Every intent the loop declared, in order.
        pub intents: Mutex<Vec<(String, TrackKind)>>,
        /// Every candidate the loop added, in order.
        pub candidates: Mutex<Vec<(PeerTarget, String)>>,
        /// True once `close` has been called.
        pub closed: Mutex<bool>,
        /// Set to make the next subscriber offer report an exchange in flight.
        pub offer_in_flight: Mutex<bool>,
        /// What the next `accept_subscriber_answer` should report.
        pub answer_owes_another_offer: Mutex<bool>,
    }

    impl FakeTransport {
        /// A transport with nothing recorded yet.
        pub fn new() -> Arc<Self> {
            Arc::new(Self::default())
        }

        /// Has `close` been called?
        pub async fn is_closed(&self) -> bool {
            *self.closed.lock().await
        }
    }

    #[async_trait]
    impl ParticipantTransport for FakeTransport {
        fn sink(&self) -> Arc<dyn SubscriberSink> {
            Arc::new(crate::participant::NullSink)
        }

        async fn declare_intent(&self, client_track_id: String, kind: TrackKind) {
            self.intents.lock().await.push((client_track_id, kind));
        }

        async fn accept_publisher_offer(&self, sdp: String) -> MediaRoomResult<String> {
            Ok(format!("answer-to:{sdp}"))
        }

        async fn create_subscriber_offer(&self) -> MediaRoomResult<Option<String>> {
            if *self.offer_in_flight.lock().await {
                return Ok(None);
            }
            Ok(Some("offer".to_owned()))
        }

        async fn accept_subscriber_answer(&self, _sdp: String) -> MediaRoomResult<bool> {
            Ok(*self.answer_owes_another_offer.lock().await)
        }

        async fn add_ice_candidate(
            &self,
            target: PeerTarget,
            candidate: String,
            _sdp_mid: Option<String>,
            _sdp_mline_index: Option<u16>,
        ) -> MediaRoomResult<()> {
            self.candidates.lock().await.push((target, candidate));
            Ok(())
        }

        async fn close(&self) {
            *self.closed.lock().await = true;
        }
    }
}
