//! Giving each subscriber a gapless view of a stream it may have missed part of.
//!
//! ## The problem
//!
//! The fan-out is bounded, so a subscriber that falls behind loses packets —
//! deliberately, because buffering is worse than dropping for realtime media.
//! But the packets that *do* reach it still carry the publisher's original
//! sequence numbers, so what arrives at the client looks like this:
//!
//! ```text
//!   published   … 41 42 43 44 45 46 47 …
//!   forwarded   … 41 42 ▒▒ ▒▒ ▒▒ 46 47 …   ← three lost in the fan-out
//!   client sees … 41 42 __ __ __ 46 47 …   ← three holes
//! ```
//!
//! A hole in a sequence is a receiver's signal that something was lost *on the
//! wire*, and the answer to that is a NACK. Every video answer this server
//! sends advertises `nack`, so the client duly asks for 43, 44 and 45 — packets
//! the server never wrote and cannot retransmit. The request goes unanswered,
//! the receiver waits out its retransmission timers, and only then falls back
//! to asking for a keyframe. The recovery that was going to happen anyway is
//! delayed by a round trip, and the RTCP is wasted.
//!
//! ## The fix
//!
//! Renumber. Each (track, subscriber) pair keeps an offset, and every forwarded
//! packet is numbered `original - offset`. Dropping a packet advances the
//! offset by one, which closes the hole:
//!
//! ```text
//!   forwarded   … 41 42 ▒▒ ▒▒ ▒▒ 46 47 …   offset 0 → 3
//!   client sees … 41 42          43 44 …   ← contiguous
//! ```
//!
//! An offset rather than a counter, because subtraction preserves the order the
//! packets were in. RTP arrives out of order routinely and the receiver's
//! jitter buffer puts it back together by sequence number; handing out numbers
//! in arrival order would destroy the very information it does that with. A
//! late packet keeps its place relative to its neighbours because the same
//! offset is subtracted from all of them.
//!
//! Timestamps are left alone. They are the encoder's clock, and a gap in them
//! is meaningful — it says a frame is missing, which after a drop is true.

/// The per-subscriber renumbering for one forwarded track.
///
/// Cheap enough to keep one per (track, subscriber) pair, which is what makes
/// it correct: two subscribers of the same track lag at different moments and
/// must not share an offset.
#[derive(Debug, Default, Clone, Copy)]
pub struct SequenceRewriter {
    /// How far the forwarded stream trails the published one, in packets.
    ///
    /// Wraps with the sequence space it is subtracted from, so no special case
    /// is needed at the 16-bit boundary.
    offset: u16,
    /// Total packets skipped, for telemetry. Not modular — this one is a count.
    skipped: u64,
}

impl SequenceRewriter {
    pub fn new() -> Self {
        Self::default()
    }

    /// The number this packet should carry on the way out.
    pub fn forward(&self, sequence: u16) -> u16 {
        sequence.wrapping_sub(self.offset)
    }

    /// Record that `count` packets will not be forwarded.
    ///
    /// Called with the count the fan-out reports as missed, and with one for
    /// each packet dropped for any other reason. Everything after this point
    /// closes up behind them.
    pub fn skip(&mut self, count: u64) {
        // `count` is a u64 because the fan-out reports it as one, but the
        // sequence space is 16 bits and the arithmetic below is modular: a
        // subscriber that missed more than 65,536 packets has lost more than
        // the space can express, and is getting a keyframe regardless.
        self.offset = self.offset.wrapping_add(count as u16);
        self.skipped = self.skipped.saturating_add(count);
    }

    /// How many packets this subscriber has missed in total.
    pub fn skipped(&self) -> u64 {
        self.skipped
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_untroubled_stream_is_passed_through_unchanged() {
        let rewriter = SequenceRewriter::new();
        for sequence in [0, 1, 2, 40_000, u16::MAX] {
            assert_eq!(rewriter.forward(sequence), sequence);
        }
    }

    #[test]
    fn a_drop_closes_the_hole_it_would_have_left() {
        let mut rewriter = SequenceRewriter::new();

        assert_eq!(rewriter.forward(41), 41);
        assert_eq!(rewriter.forward(42), 42);

        // 43, 44 and 45 are lost in the fan-out.
        rewriter.skip(3);

        assert_eq!(rewriter.forward(46), 43);
        assert_eq!(rewriter.forward(47), 44);
    }

    #[test]
    fn successive_drops_accumulate() {
        let mut rewriter = SequenceRewriter::new();

        rewriter.skip(2);
        assert_eq!(rewriter.forward(10), 8);

        rewriter.skip(5);
        assert_eq!(rewriter.forward(20), 13);

        assert_eq!(rewriter.skipped(), 7);
    }

    #[test]
    fn out_of_order_arrivals_keep_their_order() {
        // The receiver reorders by sequence number, so the mapping has to be
        // order-preserving. A counter would renumber 44 as *later* than 45
        // purely because it turned up second.
        let mut rewriter = SequenceRewriter::new();
        rewriter.skip(3);

        let late = rewriter.forward(44);
        let early = rewriter.forward(45);

        assert!(late < early, "44 must still precede 45 ({late} vs {early})");
        assert_eq!(early - late, 1, "and they must still be adjacent");
    }

    #[test]
    fn the_sequence_space_wraps_without_a_special_case() {
        let mut rewriter = SequenceRewriter::new();
        rewriter.skip(5);

        // Just below the wrap, and just above it.
        assert_eq!(rewriter.forward(2), u16::MAX - 2);
        assert_eq!(rewriter.forward(4), 65_535);
        assert_eq!(rewriter.forward(5), 0);
        assert_eq!(rewriter.forward(6), 1);
    }

    #[test]
    fn an_offset_larger_than_the_sequence_space_still_produces_a_run() {
        // A subscriber this far behind is beyond repair and will be given a
        // keyframe; what matters is that the numbers stay contiguous rather
        // than the arithmetic doing something surprising.
        let mut rewriter = SequenceRewriter::new();
        rewriter.skip(70_000);

        let first = rewriter.forward(1_000);
        let second = rewriter.forward(1_001);
        assert_eq!(second.wrapping_sub(first), 1);
        assert_eq!(rewriter.skipped(), 70_000);
    }

    #[test]
    fn skipping_nothing_changes_nothing() {
        let mut rewriter = SequenceRewriter::new();
        rewriter.skip(0);
        assert_eq!(rewriter.forward(7), 7);
        assert_eq!(rewriter.skipped(), 0);
    }
}
