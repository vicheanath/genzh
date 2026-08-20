//! # api
//!
//! The control-plane HTTP API: accounts, communities, rooms, permissions,
//! messages, and the authorization step that issues media session tokens.
//!
//! Exposed as a library as well as a binary so integration tests can build the
//! real router — the same middleware stack, the same error mapping — and drive
//! it without opening a socket.
//!
//! ```text
//!   HTTP / WebSocket
//!        ↓
//!   Router            (apps/api/src/router.rs)
//!        ↓
//!   Handler           (apps/api/src/routes/…)   — thin: parse, delegate, shape
//!        ↓
//!   Application service (crates/{auth,community,room,messaging,social})
//!        ↓
//!   Domain            (crates/domain)           — rules, no I/O
//!        ↓
//!   Repository        (per-context crates)      — SQL, no rules
//!        ↓
//!   PostgreSQL
//! ```

pub mod config;
pub mod error;
pub mod extract;
pub mod middleware;
pub mod notify;
pub mod presence;
pub mod router;
pub mod routes;
pub mod state;

pub use config::Config;
pub use error::{ApiError, ApiResult};
pub use state::AppState;
