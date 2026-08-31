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
//! LiveKit, the media plane, deliberately does **not** depend on this crate —
//! it is a separate service entirely. It learns about users and rooms
//! exclusively through a short-lived signed access token minted by the API —
//! see `genzh_room::media::LiveKitTokenGenerator`. That keeps database
//! concerns out of the RTP path and lets the two planes be deployed and
//! scaled apart.

pub mod audit;
pub mod community;
pub mod emoji;
pub mod error;
pub mod gamification;
pub mod ids;
pub mod mention;
pub mod message;
pub mod notification;
pub mod permission;
pub mod platform;
pub mod room;
pub mod social;
pub mod spam;
pub mod support;
pub mod user;

pub use emoji::CustomEmoji;
pub use error::{DomainError, DomainResult};
pub use gamification::{
    BalanceTransaction, EquippedCosmetics, ItemRarity, ItemType, ReferralMilestone, ReferralRecord,
    ReferralWithProfile, StoreItem, StoreListing, UserBalance, UserInventoryItem,
};
pub use ids::{
    CommunityId, EmojiId, InventoryId, MessageId, NotificationId, ReferralId, RoleId, RoomId,
    SessionId, StoreItemId, TransactionId, UserId,
};
pub use permission::{Permission, PermissionSet};
pub use platform::PlatformRole;
pub use room::{
    Room, RoomAnonymousIdentity, RoomFamily, RoomParticipant, RoomParticipantRole, RoomStatus,
    RoomType, RoomVisibility,
};

/// The timestamp type used across the whole domain: always UTC.
pub type Timestamp = chrono::DateTime<chrono::Utc>;

/// Current UTC time. Centralised so tests can reason about a single source.
pub fn now() -> Timestamp {
    chrono::Utc::now()
}
