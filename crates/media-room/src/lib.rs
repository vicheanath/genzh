//! # genzh-room
//!
//! Live media rooms and the selective forwarding unit that feeds them.
//!
//! The crate is layered so that the interesting parts are testable:
//!
//! | Module | Depends on WebRTC? | What it owns |
//! |---|---|---|
//! | [`manager`] | no | the registry of live rooms |
//! | [`room`] | no | one room: who is in it, who publishes what, who hears whom |
//! | [`participant`] | no | one participant's bookkeeping and the [`participant::SubscriberSink`] boundary |
//! | [`track`] | packets only | a published track and its bounded RTP fan-out |
//! | [`transport`] | no | the [`transport::ParticipantTransport`] port `sfu` implements |
//! | [`sfu`] | **yes** | peer connections, forwarding tasks, RTCP relay |
//!
//! Everything above `sfu` can be exercised with no sockets, which is how the
//! room lifecycle tests run in milliseconds and deterministically. There are
//! two seams that make that true, and they are the same idea one layer apart:
//! [`participant::SubscriberSink`] hides the transport from the *room*, and
//! [`transport::ParticipantTransport`] hides it from the *signalling server*.
//! `sfu` is the only module either points at today.

pub mod error;
pub mod keyframe;
pub mod manager;
pub mod participant;
pub mod room;
pub mod sequence;
pub mod speakers;
pub mod sfu;
pub mod stats;
pub mod track;
pub mod transport;

pub use error::{MediaRoomError, MediaRoomResult};
pub use keyframe::{KEYFRAME_COOLDOWN, KeyframeGate};
pub use sequence::SequenceRewriter;
pub use speakers::{ActiveSpeakers, DEFAULT_SPEAKER_LIMIT};
pub use stats::{TrackStats, TrackStatsSnapshot};
pub use manager::MediaRoomManager;
pub use participant::{ConnectionState, MediaState, Participant, SubscriberSink};
pub use room::{AutoSubscribe, MediaRoom, RoomConfig};
pub use sfu::{ParticipantPeers, PeerFactory, SfuConfig};
pub use transport::{ParticipantTransport, PeerEvent, PeerEvents, TransportFactory};
pub use track::{KeyframeRequester, PublishedTrack};
