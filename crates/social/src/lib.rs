//! # genzh-graph
//!
//! Friendships and blocks.
//!
//! Small on purpose: this is the foundation the friend list, direct messages
//! and presence will build on, and it exists now so those features do not each
//! invent their own notion of "connected".

pub mod repository;
pub mod service;

pub use repository::SocialRepository;
pub use service::SocialService;
