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

pub mod db;
pub mod error;

pub use db::{DbPool, PgConfig, connect, run_migrations};
pub use error::{RepositoryError, RepositoryResult, ServiceError, ServiceResult};
