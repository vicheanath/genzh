//! # genzh-domain
//!
//! Pure domain model for the control plane: identities, the social graph,
//! communities, rooms and messages.
//!
//! This crate owns **types and rules**, never I/O. Repositories live in the
//! per-bounded-context crates (`genzh-auth`, `genzh-community`, …) and map
//! these types to and from PostgreSQL rows.
//!
//! ## Boundary note
//!
//! The media plane (`genzh-core`, `genzh-room`, `apps/media`)
//! deliberately does **not** depend on this crate. The media server learns
//! about users and rooms exclusively through a short-lived signed token minted
//! by the API — see [`genzh_media_core::token`]. That keeps database concerns
//! out of the RTP path and lets the two planes be deployed and scaled apart.

pub mod community;
pub mod error;
pub mod ids;
pub mod mention;
pub mod message;
pub mod notification;
pub mod permission;
pub mod room;
pub mod social;
pub mod spam;
pub mod user;

pub use error::{DomainError, DomainResult};
pub use ids::{
    CommunityId, MessageId, NotificationId, RoleId, RoomId, SessionId, UserId,
};
pub use permission::{Permission, PermissionSet};
pub use room::{
    Room, RoomAnonymousIdentity, RoomParticipant, RoomParticipantRole, RoomStatus, RoomType,
    RoomVisibility,
};

/// The timestamp type used across the whole domain: always UTC.
pub type Timestamp = chrono::DateTime<chrono::Utc>;

/// Current UTC time. Centralised so tests can reason about a single source.
pub fn now() -> Timestamp {
    chrono::Utc::now()
}
