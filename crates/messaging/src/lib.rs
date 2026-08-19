//! # genzh-messaging
//!
//! Text messages and reactions, in every kind of room.
//!
//! A voice room's chat sidebar and a text room's history are the same table
//! and the same code path; the only difference is which permissions the room
//! grants.

pub mod repository;
pub mod service;

pub use repository::{MessagePage, MessageRepository};
pub use service::MessagingService;
