//! Reclaiming space in a volatile store.
//!
//! Every in-process store in this crate keeps a map keyed by something the
//! outside world controls — an address, an account, a room. Left alone those
//! maps only grow, so each one sweeps opportunistically: a caller that arrives
//! once the map is large pays for the cleanup on its way through.
//!
//! That is enough while traffic keeps arriving and not enough when it stops. A
//! process that goes quiet at 03:00 holds every key it ever saw until the next
//! request, and the store that most wants sweeping — the one for an endpoint
//! nobody is calling — is exactly the one that never gets it. A periodic sweep
//! closes that gap.
//!
//! It is a separate trait rather than a method on [`RateLimiter`] or
//! [`FloodGuard`] because it answers to a different caller. Nothing in a
//! request path sweeps; the scheduler does, and it does not care which store it
//! is holding. Keeping the two apart is what lets the sweep job depend on
//! `Arc<dyn Sweep>` instead of on `InMemoryRateLimiter` — the wiring picks the
//! implementation, and the job never learns what it got.
//!
//! [`RateLimiter`]: crate::RateLimiter
//! [`FloodGuard`]: crate::FloodGuard

/// A store that can discard entries no longer worth keeping.
///
/// The default implementation reclaims nothing, so a store with no volatile
/// state — or one whose backend expires keys itself, as Redis does — satisfies
/// this by saying so and nothing more.
pub trait Sweep: Send + Sync + 'static {
    /// What to call this store in logs.
    fn label(&self) -> &'static str;

    /// Discard whatever has expired, and report how many entries went.
    ///
    /// Synchronous because the implementations that have anything to do here
    /// hold their state behind a mutex in this process. A backend that needed
    /// to go over the network would expire keys on its own and implement this
    /// as the no-op default.
    fn sweep_stale(&self) -> usize {
        0
    }
}
