//! # social-media-core
//!
//! The contract between the control plane and the media plane.
//!
//! This crate is deliberately tiny and dependency-light: **no SQLx, no
//! `social-domain`, no HTTP**. It exists so that `apps/api` and `apps/media`
//! can agree on a handful of value types without the media server ever
//! learning what a database row looks like.
//!
//! What lives here:
//!
//! | Module | Purpose |
//! |---|---|
//! | [`token`] | The short-lived signed media token: the *only* thing the media server trusts |
//! | [`permissions`] | The subset of capabilities that matter to media (speak, camera, screen share…) |
//! | [`ice`] | STUN/TURN configuration handed to clients |
//! | [`codec`] | The codec allow-list, so codecs are configured in one place rather than hardcoded |
//! | [`track`] | Track kinds and identifiers shared by signalling and the SFU |
//! | [`events`] | Realtime room events pushed over the signalling socket |
//! | [`vad`] | The voice-activity-detection abstraction behind speaking indicators |
//!
//! ## Why a token instead of a lookup
//!
//! Authorising a media join is a database-shaped question: is this user a
//! member, does their role grant `speak` in this room, is the room full. The
//! API answers it once, then hands the client a token that *states the
//! answer*, signed with a shared secret and valid for a couple of minutes. The
//! media server verifies the signature locally, so admitting a participant
//! costs one HMAC and zero queries — and no packet path ever touches
//! PostgreSQL.

pub mod codec;
pub mod error;
pub mod events;
pub mod ice;
pub mod permissions;
pub mod token;
pub mod track;
pub mod vad;

pub use error::{MediaCoreError, MediaCoreResult};
pub use events::RoomEvent;
pub use ice::{IceServer, IceTransportPolicy};
pub use permissions::MediaPermissions;
pub use token::{MediaToken, MediaTokenClaims, MediaTokenSigner};
pub use track::{ParticipantId, TrackId, TrackKind};
