//! # genzh-auth
//!
//! Registration, login, sessions and the identity half of authorization.
//!
//! ## What a token is, and is not
//!
//! An access token answers exactly one question: **who is calling?** It does
//! not carry roles, community membership or permissions.
//!
//! That is a deliberate constraint. Permissions change — a moderator is
//! demoted, a role loses `speak`, someone is removed from a community — and a
//! token that carries them keeps asserting the old answer until it expires.
//! Resolving capabilities from the database at the moment they are needed
//! costs an indexed join and means a permission change takes effect on the
//! next request rather than in fifteen minutes.
//!
//! The one exception is the media token (`genzh-core`), which is a
//! snapshot of an authorization decision, scoped to one room, valid for two
//! minutes, and issued *after* the database has been consulted.
//!
//! ## Token shapes
//!
//! | Token | Form | Lifetime | Storage |
//! |---|---|---|---|
//! | Access | HS256 JWT | 15 min | none — stateless |
//! | Refresh | 256 random bits | 30 days | SHA-256 hash in `sessions` |
//!
//! Refresh tokens are opaque rather than JWTs because they must be revocable,
//! and they are stored hashed because a database leak should not hand an
//! attacker live sessions.

pub mod error;
pub mod handle;
pub mod jwt;
pub mod oauth;
pub mod password;
pub mod repository;
pub mod service;
pub mod sessions;

pub use error::{AuthError, AuthResult};
pub use jwt::{AccessClaims, CurrentUser, JwtService, TokenPair};
pub use oauth::OAuthUserInput;
pub use repository::PublicIdentity;
pub use service::{AuthService, AuthenticatedUser, LoginInput, RegisterInput, UpdateProfile};
pub use sessions::{SessionContext, SessionManager};
