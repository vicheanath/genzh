//! Rationing keyframe requests.
//!
//! ## Why a track cannot just forward every request
//!
//! A keyframe is the one thing an SFU asks of an encoder, and it is expensive:
//! an intra frame is commonly ten to thirty times the size of the inter frames
//! around it. The requests, meanwhile, arrive per *subscriber* — every client
//! that cannot decode sends its own PLI, and every subscriber that falls behind
//! the fan-out asks for one too.
//!
//! Those two facts multiply in exactly the wrong direction:
//!
//! ```text
//!   congestion ─▶ N subscribers lose sync ─▶ N keyframe requests
//!        ▲                                          │
//!        └────── N intra frames, back to back ◀─────┘
//! ```
//!
//! The room where this bites is the room already in trouble. Twenty people on a
//! congested link do not need twenty keyframes; they need one, and they all
//! decode from the same one, because the SFU forwards a single stream to all of
//! them. So the requests are coalesced: the first one through wins and the rest
//! are absorbed until the encoder has had time to answer.
//!
//! The gate is deliberately a value with no clock of its own — the caller says
//! what time it is. That is what lets the behaviour be tested exactly, in
//! microseconds, instead of by sleeping.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// How long a track ignores further keyframe requests after honouring one.
///
/// Long enough to cover a round trip to the publisher plus the encoder's next
/// frame, short enough that somebody who joins mid-stream is not staring at a
/// grey rectangle. Half a second is the figure most SFUs land on.
pub const KEYFRAME_COOLDOWN: Duration = Duration::from_millis(500);

/// Sentinel for "no request has ever been honoured".
///
/// Distinct from zero, which is a real instant here — the gate measures from
/// its own creation, and a request in the first millisecond of a track's life
/// is the common case, not an edge one.
const NEVER: u64 = u64::MAX;

/// Lets one keyframe request through per cooldown, and absorbs the rest.
#[derive(Debug)]
pub struct KeyframeGate {
    /// What the gate measures from.
    origin: Instant,
    cooldown: Duration,
    /// Milliseconds since `origin` when a request was last honoured.
    last: AtomicU64,
    /// How many requests have been let through.
    honoured: AtomicU64,
    /// How many have been absorbed. The interesting number: it is the size of
    /// the storm that did not reach the encoder.
    absorbed: AtomicU64,
}

impl KeyframeGate {
    /// A gate with the standard cooldown, measuring from now.
    pub fn new() -> Self {
        Self::with_cooldown(KEYFRAME_COOLDOWN)
    }

    /// A gate with a chosen cooldown. `Duration::ZERO` disables rationing.
    pub fn with_cooldown(cooldown: Duration) -> Self {
        Self {
            origin: Instant::now(),
            cooldown,
            last: AtomicU64::new(NEVER),
            honoured: AtomicU64::new(0),
            absorbed: AtomicU64::new(0),
        }
    }

    /// Should this request be forwarded to the publisher?
    ///
    /// Wait-free, and safe for the many forwarding tasks that call it at once:
    /// the compare-exchange is what makes a simultaneous burst yield exactly
    /// one request rather than one per task that happened to read a stale
    /// timestamp.
    pub fn admit(&self, now: Instant) -> bool {
        let now_ms = now.saturating_duration_since(self.origin).as_millis() as u64;
        let cooldown_ms = self.cooldown.as_millis() as u64;

        loop {
            let last = self.last.load(Ordering::Acquire);
            let due = last == NEVER || now_ms.saturating_sub(last) >= cooldown_ms;
            if !due {
                self.absorbed.fetch_add(1, Ordering::Relaxed);
                return false;
            }

            // Claim the slot. Losing the race means somebody else just asked
            // for the very keyframe this caller wanted, so this request is
            // satisfied by theirs.
            match self.last.compare_exchange_weak(
                last,
                now_ms,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    self.honoured.fetch_add(1, Ordering::Relaxed);
                    return true;
                }
                Err(_) => continue,
            }
        }
    }

    /// How many requests reached the publisher.
    pub fn honoured(&self) -> u64 {
        self.honoured.load(Ordering::Relaxed)
    }

    /// How many were absorbed by the cooldown.
    pub fn absorbed(&self) -> u64 {
        self.absorbed.load(Ordering::Relaxed)
    }
}

impl Default for KeyframeGate {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_request_is_always_honoured() {
        let gate = KeyframeGate::new();
        assert!(gate.admit(Instant::now()));
        assert_eq!(gate.honoured(), 1);
        assert_eq!(gate.absorbed(), 0);
    }

    #[test]
    fn a_storm_of_requests_becomes_one() {
        let gate = KeyframeGate::new();
        let now = Instant::now();

        // Twenty subscribers losing sync in the same instant, which is what a
        // congested link actually produces.
        let admitted = (0..20).filter(|_| gate.admit(now)).count();

        assert_eq!(admitted, 1, "the encoder should be asked once");
        assert_eq!(gate.absorbed(), 19);
    }

    #[test]
    fn another_request_is_honoured_once_the_cooldown_passes() {
        let gate = KeyframeGate::new();
        let start = Instant::now();

        assert!(gate.admit(start));
        assert!(!gate.admit(start + KEYFRAME_COOLDOWN - Duration::from_millis(1)));
        assert!(gate.admit(start + KEYFRAME_COOLDOWN));
        assert_eq!(gate.honoured(), 2);
    }

    #[test]
    fn the_cooldown_runs_from_the_last_honoured_request() {
        // Not from the first: a stream that is asked for a keyframe every
        // second should produce one every second, not a burst and then silence.
        let gate = KeyframeGate::new();
        let start = Instant::now();

        assert!(gate.admit(start));
        assert!(gate.admit(start + KEYFRAME_COOLDOWN));
        assert!(!gate.admit(start + KEYFRAME_COOLDOWN + Duration::from_millis(1)));
        assert!(gate.admit(start + KEYFRAME_COOLDOWN * 2));
    }

    #[test]
    fn a_zero_cooldown_admits_everything() {
        // The seam tests and local runs use, where rationing only gets in the
        // way of asserting on what was forwarded.
        let gate = KeyframeGate::with_cooldown(Duration::ZERO);
        let now = Instant::now();

        assert!(gate.admit(now));
        assert!(gate.admit(now));
        assert_eq!(gate.absorbed(), 0);
    }

    #[test]
    fn a_clock_that_goes_backwards_does_not_panic() {
        // `Instant` is monotonic per platform guarantees, but the gate is
        // handed times by several tasks and should not be the thing that
        // panics if one of them is stale.
        let gate = KeyframeGate::new();
        let start = Instant::now();

        assert!(gate.admit(start + KEYFRAME_COOLDOWN));
        assert!(!gate.admit(start));
    }
}
