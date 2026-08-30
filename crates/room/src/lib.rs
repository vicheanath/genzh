//! # genzh-room
//!
//! Rooms, room-level authorization, and the handover to LiveKit.
//!
//! This crate is where the two planes meet, and the meeting point is
//! deliberately narrow: [`media::MediaSessionService`] answers a database
//! question ("may this user speak in this room?") and turns the answer into a
//! signed LiveKit access token. Nothing else crosses.

pub mod authorization;
pub mod directory;
pub mod directs;
pub mod media;
pub mod read_state;
pub mod repository;
pub mod service;

pub use authorization::RoomAccess;
pub use directory::RoomDirectory;
pub use directs::DirectRooms;
pub use media::{LiveKitToken, LiveKitTokenGenerator, MediaJoinResponse, MediaSessionService};
pub use repository::{PruneOutcome, RoomRepository, UpdateRoom};
pub use service::{CreateRoom, RoomService};
pub use read_state::{ReadStateService, RoomUnread};
