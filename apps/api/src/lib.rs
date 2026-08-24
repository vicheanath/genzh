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
//!
//! Alongside that column sits the volatile state — who is online, how much of a
//! request budget is left, and the fan-out of real-time events. None of it is
//! held here directly: each is a trait in `genzh_infrastructure` with an
//! in-memory implementation chosen once, in [`AppState::build`]. Handlers see
//! only the trait, so the day one process is not enough, the shared-store
//! implementations drop in underneath them.

pub mod config;
pub mod error;
pub mod extract;
pub mod middleware;
pub mod notify;
pub mod oauth;
pub mod router;
pub mod routes;
pub mod state;

pub use config::Config;
pub use error::{ApiError, ApiResult};
pub use state::AppState;
