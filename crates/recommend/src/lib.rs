//! Recommendations, from the data the product already collects.
//!
//! Three surfaces — moments to join, people to add, communities to explore —
//! over one idea: *the things your people are doing are the things you are
//! most likely to want.*
//!
//! # Where the signal comes from
//!
//! No new tracking, no event pipeline, no embeddings. Everything is derived
//! from tables that exist because the product needs them anyway:
//!
//! | Signal | Source | Strength |
//! |---|---|---|
//! | Co-membership | `community_members` | densest thing here |
//! | Engagement | `messages` | who actually talks, not who joined once |
//! | Presence | `room_participants` | strong but sparse and transient |
//! | Social graph | `friendships` | sparsest, highest precision |
//! | Content fit | `rooms.category` | weak while most rooms share a category |
//! | Exclusion | `blocks`, quarantine, visibility | not a signal — a filter |
//!
//! # The shape of every recommender here
//!
//! Three steps, in this order, and the order is the design:
//!
//! 1. **Filter first, in SQL.** Anything the viewer must not see — blocked
//!    accounts, quarantined communities, private rooms, things they are already
//!    in — is excluded by the query, never by the ranking. A score can be tuned
//!    to zero by accident; a `WHERE` clause cannot. This matters most for
//!    blocks, where "ranked last" and "absent" are not the same promise.
//! 2. **Gather counts, in SQL.** One query per surface produces every count for
//!    every candidate at once. Scoring a candidate must never issue a query, or
//!    a page of twenty becomes twenty round trips.
//! 3. **Rank, in Rust.** [`score`] turns those counts into an order and an
//!    explanation, as pure arithmetic that tests can pin down without a
//!    database.
//!
//! # Cold start is the normal case
//!
//! Most accounts have joined nothing and know nobody, and a recommender that
//! only works for well-connected users is one that fails precisely when it is
//! most needed — on the account that just signed up. There is no separate
//! cold-start path here, because a separate path is one that rots unnoticed:
//! popularity and freshness are ordinary terms in the same sum, so an account
//! with no signals is ranked by them alone and everyone else has them
//! outweighed. The behaviour degrades smoothly rather than switching.
//!
//! # Why it is computed per request
//!
//! Live SQL behind a short cache. At this size the queries are cheap, and a
//! precomputed table would trade freshness — the thing a "what's happening now"
//! feed is entirely made of — for a saving nobody needs yet. [`cache`] holds
//! the answer for a couple of minutes, which is what stops a refetch loop from
//! re-running the joins while keeping the feed honest.

pub mod cache;
pub mod communities;
pub mod people;
pub mod rooms;
pub mod score;
pub mod service;
pub mod signals;

pub use cache::{CacheKey, RecommendationCache};
pub use communities::{CommunityRecommendation, CommunityRecommender};
pub use people::{PeopleRecommender, PersonRecommendation};
pub use rooms::{RoomRecommendation, RoomRecommender};
pub use score::{Reason, ReasonKind, Scored, Weights, decay, rank, saturate};
pub use service::{CoverageReport, RecommendationService};
pub use signals::{Affinity, ViewerSignals};

/// The most recommendations any one call will return.
///
/// A cap on the *query*, not just the response: these are ranking queries over
/// joins, and an uncapped `limit` is a request that can be made expensive by
/// anyone who can call it.
pub const MAX_RESULTS: i64 = 50;

/// What a caller gets when it does not say.
pub const DEFAULT_RESULTS: i64 = 12;

/// How many reasons travel with each recommendation.
///
/// Two, because the UI shows a line under a title and a third clause makes it
/// wrap on a phone.
pub const MAX_REASONS: usize = 2;
