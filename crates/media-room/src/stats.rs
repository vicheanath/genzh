//! What the forwarding path is actually doing.
//!
//! The media plane had two numbers an operator could read — how many rooms and
//! how many participants — which answer "is anybody here" and nothing else.
//! Neither of the two ways a call degrades is visible in them: a subscriber
//! falling behind the fan-out, and a publisher being asked for keyframes.
//!
//! So the counters live where the packets are, one set per published track:
//!
//! ```text
//!   publisher ──▶ [ published ] ──▶ fan-out ──▶ [ forwarded ] ──▶ subscribers
//!                                       │
//!                                       └──────▶ [ dropped, lagged ]
//! ```
//!
//! `published` counts once per packet; `forwarded` counts once per packet *per
//! subscriber*, so `forwarded ≈ published × subscribers` in a healthy room and
//! the shortfall is the loss this server introduced. That ratio is the number
//! worth alerting on, and it cannot be derived from anything the server
//! reported before.
//!
//! Every counter is a relaxed atomic. They are incremented on the hot path —
//! once per packet per subscriber — so they must not synchronise anything, and
//! a snapshot that is a few packets stale is a snapshot of a live stream
//! anyway.

use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;

/// Live counters for one published track.
#[derive(Debug, Default)]
pub struct TrackStats {
    published: AtomicU64,
    forwarded: AtomicU64,
    dropped: AtomicU64,
    lag_events: AtomicU64,
    suppressed: AtomicU64,
}

impl TrackStats {
    /// One packet arrived from the publisher.
    #[inline]
    pub fn packet_published(&self) {
        self.published.fetch_add(1, Ordering::Relaxed);
    }

    /// One packet was written to one subscriber.
    #[inline]
    pub fn packet_forwarded(&self) {
        self.forwarded.fetch_add(1, Ordering::Relaxed);
    }

    /// Packets that will not reach a subscriber, for any reason.
    #[inline]
    pub fn packets_dropped(&self, count: u64) {
        self.dropped.fetch_add(count, Ordering::Relaxed);
    }

    /// One subscriber fell behind the fan-out and lost `missed` packets.
    ///
    /// Counted separately from [`Self::packets_dropped`] — which it also feeds
    /// — because the event count is what says whether this is one bad moment
    /// or a subscriber that is permanently behind.
    #[inline]
    pub fn subscriber_lagged(&self, missed: u64) {
        self.lag_events.fetch_add(1, Ordering::Relaxed);
        self.packets_dropped(missed);
    }

    /// One packet was deliberately not forwarded, because its publisher is
    /// outside the room's active-speaker set.
    ///
    /// Kept apart from [`Self::packets_dropped`]: this is the server working as
    /// intended, and folding it into the loss figure would make a healthy large
    /// room look like a failing one.
    #[inline]
    pub fn packet_suppressed(&self) {
        self.suppressed.fetch_add(1, Ordering::Relaxed);
    }

    /// Read the counters. Cheap; safe to call from a health endpoint.
    pub fn snapshot(&self) -> TrackStatsSnapshot {
        TrackStatsSnapshot {
            published: self.published.load(Ordering::Relaxed),
            forwarded: self.forwarded.load(Ordering::Relaxed),
            dropped: self.dropped.load(Ordering::Relaxed),
            lag_events: self.lag_events.load(Ordering::Relaxed),
            suppressed: self.suppressed.load(Ordering::Relaxed),
            keyframes_sent: 0,
            keyframes_coalesced: 0,
        }
    }
}

/// A reading of one track's counters.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct TrackStatsSnapshot {
    /// Packets received from the publisher.
    pub published: u64,
    /// Packets written to subscribers, summed over every subscriber.
    pub forwarded: u64,
    /// Packets that never reached a subscriber: lag, unresolved payload type,
    /// or a failed write.
    pub dropped: u64,
    /// How many times a subscriber fell behind the fan-out.
    pub lag_events: u64,
    /// Packets held back because the publisher is outside the active-speaker
    /// set. Not loss: the room chose this.
    pub suppressed: u64,
    /// Keyframe requests relayed to the publisher.
    pub keyframes_sent: u64,
    /// Keyframe requests absorbed by the cooldown — the storm that did not
    /// reach the encoder.
    pub keyframes_coalesced: u64,
}

impl TrackStatsSnapshot {
    /// Share of intended forwards that were dropped, in the range 0.0 to 1.0.
    ///
    /// The denominator is what *should* have gone out, so a track with no
    /// subscribers reads as zero rather than as a divide by nothing.
    pub fn drop_rate(&self) -> f64 {
        let attempted = self.forwarded + self.dropped;
        if attempted == 0 {
            return 0.0;
        }
        self.dropped as f64 / attempted as f64
    }
}

/// One track, as reported by the stats endpoint.
#[derive(Debug, Clone, Serialize)]
pub struct TrackReport {
    /// Server-assigned track id.
    pub track_id: String,
    /// `audio`, `camera`, or `screen`.
    pub kind: &'static str,
    /// Negotiated codec.
    pub mime_type: String,
    /// How many people are receiving it right now.
    pub subscribers: usize,
    /// The counters.
    #[serde(flatten)]
    pub stats: TrackStatsSnapshot,
    /// Share of intended forwards that were dropped.
    pub drop_rate: f64,
}

/// One participant and what they are publishing.
#[derive(Debug, Clone, Serialize)]
pub struct ParticipantReport {
    pub participant_id: String,
    pub display_name: String,
    pub tracks: Vec<TrackReport>,
}

/// One room.
#[derive(Debug, Clone, Serialize)]
pub struct RoomReport {
    pub room_id: String,
    pub participants: Vec<ParticipantReport>,
}

/// Everything this server is carrying.
///
/// Deliberately a tree rather than a flat list of metrics: the question an
/// operator arrives with is "which call is bad", and that is a room, then a
/// person in it, then one of their tracks.
#[derive(Debug, Clone, Serialize)]
pub struct ServerReport {
    pub rooms: Vec<RoomReport>,
    /// Totals across every room, so a dashboard does not have to sum the tree.
    pub totals: Totals,
}

/// Server-wide sums.
#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct Totals {
    pub rooms: usize,
    pub participants: usize,
    pub tracks: usize,
    pub published: u64,
    pub forwarded: u64,
    pub dropped: u64,
    pub lag_events: u64,
    pub keyframes_sent: u64,
    pub keyframes_coalesced: u64,
}

impl ServerReport {
    /// Build the totals from the tree, so the two can never disagree.
    pub fn with_totals(rooms: Vec<RoomReport>) -> Self {
        let mut totals = Totals {
            rooms: rooms.len(),
            ..Totals::default()
        };

        for room in &rooms {
            totals.participants += room.participants.len();
            for participant in &room.participants {
                totals.tracks += participant.tracks.len();
                for track in &participant.tracks {
                    totals.published += track.stats.published;
                    totals.forwarded += track.stats.forwarded;
                    totals.dropped += track.stats.dropped;
                    totals.lag_events += track.stats.lag_events;
                    totals.keyframes_sent += track.stats.keyframes_sent;
                    totals.keyframes_coalesced += track.stats.keyframes_coalesced;
                }
            }
        }

        Self { rooms, totals }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counters_start_at_zero() {
        let stats = TrackStats::default();
        assert_eq!(stats.snapshot(), TrackStatsSnapshot::default());
    }

    #[test]
    fn a_lag_event_counts_both_the_event_and_the_packets() {
        let stats = TrackStats::default();
        stats.subscriber_lagged(40);

        let snapshot = stats.snapshot();
        assert_eq!(snapshot.lag_events, 1);
        assert_eq!(snapshot.dropped, 40);
    }

    #[test]
    fn forwarding_counts_once_per_subscriber() {
        let stats = TrackStats::default();
        stats.packet_published();
        // The same packet, out to three people.
        for _ in 0..3 {
            stats.packet_forwarded();
        }

        let snapshot = stats.snapshot();
        assert_eq!(snapshot.published, 1);
        assert_eq!(snapshot.forwarded, 3);
    }

    #[test]
    fn a_healthy_track_has_no_drop_rate() {
        let stats = TrackStats::default();
        for _ in 0..100 {
            stats.packet_forwarded();
        }
        assert_eq!(stats.snapshot().drop_rate(), 0.0);
    }

    #[test]
    fn the_drop_rate_is_over_what_was_attempted() {
        let stats = TrackStats::default();
        for _ in 0..75 {
            stats.packet_forwarded();
        }
        stats.packets_dropped(25);

        assert!((stats.snapshot().drop_rate() - 0.25).abs() < f64::EPSILON);
    }

    #[test]
    fn a_track_nobody_subscribes_to_is_not_failing() {
        let stats = TrackStats::default();
        for _ in 0..100 {
            stats.packet_published();
        }
        assert_eq!(stats.snapshot().drop_rate(), 0.0);
    }
}
