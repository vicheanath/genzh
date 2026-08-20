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
//!
//! ## How this module is laid out
//!
//! One file per job, because each has a different reason to change:
//!
//! | Module | Owns |
//! |--------|------|
//! | [`config`] | What every connection is built with: codecs, ICE, VAD mode |
//! | [`factory`] | Creating a participant's two peer connections |
//! | [`peers`] | The SDP offer/answer and ICE lifecycle of those two |
//! | [`publisher`] | Ingress — a client's track becomes a fan-out channel |
//! | [`subscriber`] | Egress — a fan-out channel becomes packets on a wire |
//!
//! The split is along the direction media flows. Publisher-side changes (a new
//! VAD, a different intent-matching rule) and subscriber-side changes (payload
//! type discovery, forwarding back-pressure) never touched the same lines even
//! when they lived in one file; now they cannot.
//!
//! What stays here is what the halves share and nobody outside needs: the
//! translation of WebRTC's connection states into the room model's, the ICE
//! candidate hand-off, and the intent map the two ends of a publish exchange
//! both touch.
//!
//! The *port* these types implement — [`crate::transport::ParticipantTransport`]
//! and [`crate::transport::TransportFactory`] — is deliberately declared a
//! layer up, where it names no transport type at all.

pub mod config;
pub mod factory;
pub mod peers;
pub mod publisher;
pub mod subscriber;

pub use config::SfuConfig;
pub use factory::PeerFactory;
pub use peers::ParticipantPeers;
pub use subscriber::WebRtcSubscriberSink;

use std::collections::HashMap;
use std::sync::Arc;

use genzh_media_core::track::TrackKind;
use genzh_media_signaling::PeerTarget;
use tokio::sync::{Mutex, mpsc};
use webrtc::peer_connection::{RTCPeerConnectionIceEvent, RTCPeerConnectionState};

use crate::transport::PeerEvent;

/// What the client says its next published track is *for*.
///
/// SDP cannot distinguish a camera from a screen share — both are just video —
/// so the client declares intent and the publisher matches it against the
/// `msid` when the track arrives. The map is shared because the two halves of
/// that exchange live in different modules: [`peers`] records the declaration,
/// [`publisher`] consumes it.
pub(super) type TrackIntents = Arc<Mutex<HashMap<String, TrackKind>>>;

/// Translate a WebRTC connection state into the room layer's own.
///
/// Public because it is the definition of that mapping and is worth testing
/// directly; callers outside this crate should read
/// [`PeerEvent::ConnectionState`] instead, which has already applied it.
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
}
