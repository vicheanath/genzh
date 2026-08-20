//! SDP and ICE: everything that shapes the two peer connections.
//!
//! The asymmetry here is the protocol's central rule, and it is why glare
//! cannot happen: the **client** offers on the publisher connection and the
//! **server** offers on the subscriber connection. So this module answers
//! offers in one direction and sends them in the other, and never both on the
//! same connection.
//!
//! Track subscription lives here too, because subscribing is what changes the
//! subscriber connection's track set — and every change to that set has to end
//! in a renegotiation.

use genzh_media_core::track::{TrackId, TrackKind};
use genzh_media_room::{ConnectionState, PeerEvent};
use genzh_media_signaling::{PeerTarget, ServerMessage};

use crate::error::MediaError;

use super::session::Session;

impl Session {
    /// Answer the client's publisher offer.
    pub(super) async fn accept_offer(&mut self, sdp: String) -> Result<(), MediaError> {
        let answer = self.peers().accept_publisher_offer(sdp).await?;
        self.send(&ServerMessage::Answer {
            target: PeerTarget::Publisher,
            sdp: answer,
        })
        .await
    }

    /// Take the client's answer to our subscriber offer.
    pub(super) async fn accept_answer(&mut self, sdp: String) -> Result<(), MediaError> {
        // Tracks may have been added while the offer was in flight, in which
        // case the exchange that just completed is already out of date.
        if self.peers().accept_subscriber_answer(sdp).await? {
            self.renegotiate().await?;
        }
        Ok(())
    }

    /// Add a trickled candidate to the connection it belongs to.
    pub(super) async fn add_ice_candidate(
        &mut self,
        target: PeerTarget,
        candidate: String,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u16>,
    ) -> Result<(), MediaError> {
        if let Err(error) = self
            .peers()
            .add_ice_candidate(target, candidate, sdp_mid, sdp_mline_index)
            .await
        {
            // A candidate can legitimately arrive before the description it
            // belongs to; that is a warning, not a fatal error.
            tracing::debug!(%error, target = target.as_str(), "ice candidate rejected");
        }
        Ok(())
    }

    /// Record what the client's next published track is for.
    pub(super) async fn declare_intent(
        &mut self,
        client_track_id: String,
        kind: TrackKind,
    ) -> Result<(), MediaError> {
        self.peers().declare_intent(client_track_id, kind).await;
        Ok(())
    }

    /// Start receiving one track.
    pub(super) async fn subscribe(&mut self, track_id: &TrackId) -> Result<(), MediaError> {
        let participant_id = self.participant_id();
        match self.room().subscribe(participant_id, track_id).await {
            Ok(_) => Ok(()),
            Err(error) => self.reply_error(&error).await,
        }
    }

    /// Stop receiving one track.
    pub(super) async fn unsubscribe(&mut self, track_id: &TrackId) -> Result<(), MediaError> {
        let participant_id = self.participant_id();
        match self.room().unsubscribe(participant_id, track_id).await {
            Ok(_) => Ok(()),
            Err(error) => self.reply_error(&error).await,
        }
    }

    /// Offer the subscriber connection's current track set to the client.
    pub(super) async fn renegotiate(&mut self) -> Result<(), MediaError> {
        // `None` means an exchange is already in flight; the need is remembered
        // and a fresh offer goes out when the answer lands.
        if let Some(sdp) = self.peers().create_subscriber_offer().await? {
            self.send(&ServerMessage::Offer {
                target: PeerTarget::Subscriber,
                sdp,
            })
            .await?;
        }
        Ok(())
    }

    /// Act on one event from this participant's own peer connections.
    ///
    /// The counterpart to [`Session::dispatch`]: that handles what the client
    /// says, this handles what its transport does.
    pub(super) async fn handle_peer_event(&mut self, event: PeerEvent) -> Result<(), MediaError> {
        match event {
            PeerEvent::IceCandidate {
                target,
                candidate,
                sdp_mid,
                sdp_mline_index,
            } => {
                self.send(&ServerMessage::IceCandidate {
                    target,
                    candidate,
                    sdp_mid,
                    sdp_mline_index,
                })
                .await
            }

            PeerEvent::ConnectionState {
                target,
                state,
                terminal,
            } => self.handle_connection_state(target, state, terminal).await,

            PeerEvent::TrackReady { track } => self.register_track(track).await,

            PeerEvent::TrackEnded { kind } => {
                let participant_id = self.participant_id();
                let _ = self.room().unpublish_track(participant_id, kind).await;
                Ok(())
            }

            PeerEvent::Speaking { transition } => {
                self.set_speaking(
                    transition == genzh_media_core::vad::SpeakingTransition::Started,
                )
                .await;
                Ok(())
            }
        }
    }

    /// Record a transport state change, and end the session if ICE gave up.
    ///
    /// `terminal` is decided by the transport layer, not here: whether
    /// `Disconnected` means "gone" or "mid network handover" is a WebRTC
    /// question, and answering it in the signalling server would drop every
    /// call that switches from Wi-Fi to cellular.
    async fn handle_connection_state(
        &mut self,
        target: PeerTarget,
        state: ConnectionState,
        terminal: bool,
    ) -> Result<(), MediaError> {
        tracing::debug!(target = target.as_str(), ?state, "peer connection state");

        self.participant()
            .update_state(|s| s.connection = state)
            .await;

        if terminal {
            // ICE gave up: the participant is gone whether or not the
            // WebSocket noticed.
            return Err(MediaError::ConnectionClosed);
        }
        Ok(())
    }

    /// Register a track the publisher connection just started delivering.
    async fn register_track(
        &mut self,
        track: std::sync::Arc<genzh_media_room::track::PublishedTrack>,
    ) -> Result<(), MediaError> {
        use genzh_media_room::MediaRoomError;

        let kind = track.kind();
        let participant_id = self.participant_id();

        match self.room().publish_track(participant_id, track).await {
            Ok(_) => {
                tracing::debug!(%participant_id, %kind, "track registered with room");
                Ok(())
            }
            // A renegotiation can re-announce a track we already have.
            Err(MediaRoomError::AlreadyPublishing(_)) => Ok(()),
            Err(error) => self.reply_error(&error).await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::signaling::session::Session;
    use crate::signaling::session::test_support::SharedSink;
    use genzh_media_core::permissions::MediaPermissions;
    use genzh_media_core::track::ParticipantId;
    use genzh_media_room::room::RoomConfig;
    use genzh_media_room::transport::test_support::FakeTransport;
    use genzh_media_room::{MediaRoom, Participant, ParticipantTransport};
    use genzh_media_signaling::ServerMessage;
    use std::sync::Arc;

    fn session() -> (Session, SharedSink, Arc<FakeTransport>) {
        let room = MediaRoom::new(uuid::Uuid::new_v4(), RoomConfig::default());
        let transport = FakeTransport::new();
        let participant = Participant::new(
            ParticipantId::new(),
            uuid::Uuid::new_v4(),
            "Tester",
            MediaPermissions::all(),
            transport.sink(),
        );
        let sink = SharedSink::default();
        let session = Session::for_test(
            Box::new(sink.clone()),
            room,
            participant,
            transport.clone(),
        );
        (session, sink, transport)
    }

    #[tokio::test]
    async fn the_server_answers_on_the_publisher_connection() {
        let (mut session, sink, _transport) = session();

        session.accept_offer("v=0-publisher".to_owned()).await.expect("offer");

        sink.read(|recorded| match recorded.sent.as_slice() {
            [ServerMessage::Answer { target, sdp }] => {
                assert_eq!(*target, PeerTarget::Publisher, "the client offers here");
                assert!(sdp.contains("v=0-publisher"));
            }
            other => panic!("expected exactly one answer, got {other:?}"),
        });
    }

    #[tokio::test]
    async fn the_server_offers_on_the_subscriber_connection() {
        let (mut session, sink, _transport) = session();

        session.renegotiate().await.expect("renegotiate");

        sink.read(|recorded| match recorded.sent.as_slice() {
            [ServerMessage::Offer { target, .. }] => {
                assert_eq!(*target, PeerTarget::Subscriber, "the server offers here");
            }
            other => panic!("expected exactly one offer, got {other:?}"),
        });
    }

    #[tokio::test]
    async fn an_exchange_already_in_flight_does_not_produce_a_second_offer() {
        let (mut session, sink, transport) = session();
        *transport.offer_in_flight.lock().await = true;

        session.renegotiate().await.expect("renegotiate");

        // This is the glare rule. Sending a second overlapping offer is what
        // wedges a connection, so `None` must mean silence, not a retry.
        sink.read(|recorded| {
            assert!(
                recorded.sent.is_empty(),
                "an outstanding exchange must suppress the offer, got {:?}",
                recorded.sent
            );
        });
    }

    #[tokio::test]
    async fn an_answer_that_arrived_late_triggers_the_offer_it_owes() {
        let (mut session, sink, transport) = session();
        // Tracks were added while the offer was in flight.
        *transport.answer_owes_another_offer.lock().await = true;

        session.accept_answer("v=0-answer".to_owned()).await.expect("answer");

        sink.read(|recorded| match recorded.sent.as_slice() {
            [ServerMessage::Offer { target, .. }] => {
                assert_eq!(*target, PeerTarget::Subscriber);
            }
            other => panic!("a stale answer must be followed by a fresh offer, got {other:?}"),
        });
    }

    #[tokio::test]
    async fn an_up_to_date_answer_ends_the_exchange() {
        let (mut session, sink, _transport) = session();

        session.accept_answer("v=0-answer".to_owned()).await.expect("answer");

        sink.read(|recorded| {
            assert!(
                recorded.sent.is_empty(),
                "nothing changed, so nothing is owed"
            );
        });
    }

    #[tokio::test]
    async fn a_candidate_reaches_the_connection_it_names() {
        let (mut session, _sink, transport) = session();

        session
            .add_ice_candidate(
                PeerTarget::Subscriber,
                "candidate:1 1 udp".to_owned(),
                None,
                None,
            )
            .await
            .expect("candidate");

        let candidates = transport.candidates.lock().await;
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].0, PeerTarget::Subscriber);
    }

    #[tokio::test]
    async fn a_publish_intent_is_recorded_for_the_track_that_follows() {
        let (mut session, _sink, transport) = session();

        session
            .declare_intent("client-track-7".to_owned(), TrackKind::ScreenShare)
            .await
            .expect("intent");

        let intents = transport.intents.lock().await;
        assert_eq!(
            intents.as_slice(),
            [("client-track-7".to_owned(), TrackKind::ScreenShare)],
            "SDP cannot say a video track is a screen share; this is how"
        );
    }

    #[tokio::test]
    async fn subscribing_to_a_track_nobody_published_is_reported_not_fatal() {
        let (mut session, sink, _transport) = session();
        let unknown = genzh_media_core::track::TrackId::for_participant(
            ParticipantId::new(),
            TrackKind::Audio,
        );

        // A bad subscribe must not close the socket — the client can recover.
        session.subscribe(&unknown).await.expect("handled, not fatal");

        sink.read(|recorded| {
            assert!(
                matches!(recorded.sent.as_slice(), [ServerMessage::Error { .. }]),
                "the client should be told, got {:?}",
                recorded.sent
            );
        });
    }
}
