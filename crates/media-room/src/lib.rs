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
//! | [`sfu`] | **yes** | peer connections, forwarding tasks, RTCP relay |
//!
//! Everything above `sfu` can be exercised with no sockets, which is how the
//! room lifecycle tests run in milliseconds and deterministically.

pub mod error;
pub mod manager;
pub mod participant;
pub mod room;
pub mod sfu;
pub mod track;

pub use error::{MediaRoomError, MediaRoomResult};
pub use manager::MediaRoomManager;
pub use participant::{ConnectionState, MediaState, Participant, SubscriberSink};
pub use room::{AutoSubscribe, MediaRoom, RoomConfig};
pub use sfu::{ParticipantPeers, PeerEvent, PeerEvents, PeerFactory, SfuConfig};
pub use track::{KeyframeRequester, PublishedTrack};
