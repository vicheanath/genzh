//! # social-room
//!
//! Rooms, room-level authorization, and the handover to the media plane.
//!
//! This crate is where the two planes meet, and the meeting point is
//! deliberately narrow: [`media::MediaSessionService`] answers a database
//! question ("may this user speak in this room?") and turns the answer into a
//! signed token. Nothing else crosses.

pub mod authorization;
pub mod media;
pub mod repository;
pub mod service;

pub use authorization::RoomAccess;
pub use media::{MediaJoinResponse, MediaServerSelector, MediaSessionService, StaticMediaServers};
pub use repository::RoomRepository;
pub use service::{CreateRoom, RoomService, UpdateRoom};
