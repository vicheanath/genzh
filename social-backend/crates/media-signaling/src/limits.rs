//! Transport limits.
//!
//! Every one of these exists because an unauthenticated or merely
//! badly-behaved socket must not be able to consume unbounded server memory.

/// Largest single WebSocket frame accepted, in bytes.
///
/// SDP is the only genuinely large message; a bundled offer with several
/// video m-sections and a long ICE candidate list lands around 8–16 KiB. 64 KiB
/// leaves generous headroom while still bounding a hostile client to something
/// trivial.
pub const MAX_FRAME_BYTES: usize = 64 * 1024;

/// Largest accumulated message across continuation frames.
pub const MAX_MESSAGE_BYTES: usize = 128 * 1024;

/// How long a freshly accepted socket has to send its `join` before being
/// closed. Sockets that connect and say nothing are the cheapest possible
/// resource-exhaustion attack.
pub const HANDSHAKE_TIMEOUT_SECONDS: u64 = 10;

/// Interval between server-initiated pings.
pub const PING_INTERVAL_SECONDS: u64 = 15;

/// A socket that has not produced traffic in this long is dropped. Mobile
/// clients suspend aggressively, so this is generous relative to the ping.
pub const IDLE_TIMEOUT_SECONDS: u64 = 60;

/// Depth of the per-connection outbound queue.
///
/// Bounded on purpose: if a client stops reading, the queue fills, and the
/// connection is closed rather than buffering room events forever. Sized to
/// absorb a burst of joins in a full room without tripping.
pub const OUTBOUND_QUEUE_DEPTH: usize = 256;

/// Depth of the per-published-track RTP fan-out channel, in packets.
///
/// At 20 ms Opus frames this is ~10 s of audio, and for video a fraction of a
/// second. A subscriber that falls this far behind is not going to recover, so
/// lagging it is the right outcome.
pub const RTP_FANOUT_DEPTH: usize = 512;

/// Maximum signalling messages accepted per second from one connection, before
/// the rate limiter starts rejecting.
pub const MAX_MESSAGES_PER_SECOND: u32 = 50;

/// Maximum concurrent participants the media server will admit to one room.
/// The API enforces its own per-room limit; this is the backstop that protects
/// the process regardless of what the control plane believes.
pub const MAX_PARTICIPANTS_PER_ROOM: usize = 100;

/// Maximum tracks one participant may publish (audio + camera + screen).
pub const MAX_TRACKS_PER_PARTICIPANT: usize = 3;
