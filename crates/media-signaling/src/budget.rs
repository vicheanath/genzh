//! Per-connection message budgets.
//!
//! Lives beside [`crate::limits::MAX_MESSAGES_PER_SECOND`] rather than in the
//! server that applies it: the limit and the counter that enforces it are one
//! decision, and splitting them across crates is how the two drift apart.
//!
//! This is a fixed-window counter — the same shape the API uses for HTTP
//! requests, and honest about the same edge: a caller can spend two windows'
//! worth of messages across a boundary. That is fine for what this defends
//! against. It is not a fairness mechanism; it is a backstop against a client
//! spinning on `subscribe`, and it is deliberately generous because signalling
//! is bursty by nature — an offer plus a dozen trickled candidates arrive
//! together.

use std::time::{Duration, Instant};

use crate::limits::MAX_MESSAGES_PER_SECOND;

/// The window a budget is counted over.
const WINDOW: Duration = Duration::from_secs(1);

/// A fixed-window message budget for one socket.
#[derive(Debug)]
pub struct MessageBudget {
    window_started: Instant,
    count: u32,
    max_per_window: u32,
}

impl Default for MessageBudget {
    fn default() -> Self {
        Self::new()
    }
}

impl MessageBudget {
    /// A budget of [`MAX_MESSAGES_PER_SECOND`] messages per second.
    pub fn new() -> Self {
        Self::with_limit(MAX_MESSAGES_PER_SECOND)
    }

    /// A budget with an explicit limit, for tests and for future per-role
    /// budgets.
    pub fn with_limit(max_per_window: u32) -> Self {
        Self {
            window_started: Instant::now(),
            count: 0,
            max_per_window,
        }
    }

    /// Record one message and report whether it is within budget.
    pub fn allow(&mut self) -> bool {
        if self.window_started.elapsed() >= WINDOW {
            self.window_started = Instant::now();
            self.count = 0;
        }
        self.count += 1;
        self.count <= self.max_per_window
    }

    /// The limit being enforced, so a refusal can say what it was.
    pub fn limit(&self) -> u32 {
        self.max_per_window
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_normal_signalling_burst_is_allowed() {
        let mut budget = MessageBudget::new();
        // An offer plus twenty trickled candidates.
        for _ in 0..21 {
            assert!(budget.allow());
        }
    }

    #[test]
    fn a_spinning_client_is_stopped() {
        let mut budget = MessageBudget::new();
        for _ in 0..MAX_MESSAGES_PER_SECOND {
            assert!(budget.allow());
        }
        assert!(!budget.allow());
    }

    #[test]
    fn the_window_resets() {
        let mut budget = MessageBudget::new();
        for _ in 0..MAX_MESSAGES_PER_SECOND {
            budget.allow();
        }
        assert!(!budget.allow());

        budget.window_started = Instant::now() - Duration::from_secs(2);
        assert!(budget.allow(), "a new second is a new budget");
    }

    #[test]
    fn an_explicit_limit_is_honoured() {
        let mut budget = MessageBudget::with_limit(2);
        assert_eq!(budget.limit(), 2);
        assert!(budget.allow());
        assert!(budget.allow());
        assert!(!budget.allow());
    }
}
