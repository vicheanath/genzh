//! HTTP handlers.
//!
//! Handlers are deliberately thin: parse, delegate to a service, shape the
//! response. There is no business logic here, and no SQL — if a handler starts
//! making decisions, that decision belongs in a service where it can be tested
//! without a socket.

pub mod auth;
pub mod communities;
pub mod health;
pub mod media;
pub mod messages;
pub mod rooms;
pub mod social;
pub mod users;
pub mod ws;
