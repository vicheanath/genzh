//! # genzh-infrastructure
//!
//! Shared persistence plumbing for the control plane: the connection pool,
//! migrations, and the one place where a raw `sqlx::Error` is translated into
//! something the domain can reason about.
//!
//! Repositories themselves live in their bounded-context crates
//! (`genzh-auth`, `genzh-community`, …) rather than here, so that the schema
//! knowledge for a context stays next to its rules.
//!
//! ## Why every query is runtime-checked
//!
//! SQLx's `query!` macros verify SQL against a live database *at compile time*.
//! That is a genuinely nice property, and it is the wrong trade here: it makes
//! `cargo check` depend on a running PostgreSQL (or on a checked-in `.sqlx`
//! cache that silently rots). This workspace uses the runtime-checked
//! `query_as` API instead, so a fresh clone builds with nothing installed.
//!
//! ## Durable state, and the other kind
//!
//! PostgreSQL is not the only thing the control plane keeps state in. Presence,
//! rate-limit counters and real-time fan-out are *volatile*: they describe this
//! instant rather than the record, and losing them on restart is acceptable
//! where losing a message is not.
//!
//! Every one of them is defined here as a trait with an in-memory
//! implementation behind it:
//!
//! | Port | Today | When one process is not enough |
//! |------|-------|--------------------------------|
//! | [`PresenceStore`] | [`InMemoryPresenceStore`] | Redis hash of per-instance counters |
//! | [`AttentionStore`] | [`InMemoryAttentionStore`] | Redis entry per connection, with a TTL |
//! | [`RateLimiter`] | [`InMemoryRateLimiter`] | Redis counter, or a gateway |
//! | [`FloodGuard`] | [`InMemoryFloodGuard`] | Redis counter keyed per account |
//! | [`EventBus`] | [`InMemoryEventBus`] | Redis pub/sub, NATS, Postgres `LISTEN` |
//!
//! Each in-memory implementation is correct for a single instance and wrong for
//! several — a second replica would know only its own sockets, count only its
//! own requests, and fan out only to its own clients. Nothing in `apps/api`
//! names a concrete one: handlers depend on the trait, and one line of wiring in
//! `AppState::build` picks what implements it. Scaling out is then a new
//! implementation and a changed constructor, not a rewrite of the call sites.
//!
//! The traits are `async` and fallible even though the in-memory
//! implementations are neither, because the replacements are both. See
//! [`store`] for why that is not pessimism.

pub mod attention;
pub mod bus;
pub mod db;
pub mod error;
pub mod flood;
pub mod presence;
pub mod rate_limit;
pub mod store;
pub mod sweep;

pub use attention::{
    ATTENTION_TTL, AttentionStore, ConnectionId, InMemoryAttentionStore, InattentiveStore,
};
pub use bus::{EventBus, EventStream, InMemoryEventBus};
pub use db::{DbPool, PgConfig, connect, run_migrations};
pub use error::{RepositoryError, RepositoryResult, ServiceError, ServiceResult};
pub use flood::{FloodGuard, FloodPolicy, FloodVerdict, InMemoryFloodGuard, PermissiveFloodGuard};
pub use presence::{
    InMemoryPresenceStore, PresenceChange, PresenceStore, UnavailablePresenceStore,
};
pub use rate_limit::{Decision, InMemoryRateLimiter, RateLimiter, UnlimitedRateLimiter};
pub use store::{StoreError, StoreResult};
pub use sweep::Sweep;
