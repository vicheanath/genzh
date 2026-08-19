//! # genzh-community
//!
//! Communities, membership, roles and the permission resolver.
//!
//! The interesting module is [`authorization`]. Everything else is storage and
//! orchestration around it.

pub mod authorization;
pub mod repository;
pub mod service;

pub use authorization::{MemberContext, resolve_member_permissions};
pub use repository::CommunityRepository;
pub use service::{CommunityService, CreateCommunity, CreateRole, UpdateCommunity, UpdateRole};
