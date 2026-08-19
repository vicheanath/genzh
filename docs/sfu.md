# How the SFU works

The implementation is `crates/media-room/src/sfu.rs`, which is heavily
commented. This document explains the _why_.

## Selective forwarding, and what it is not

Three ways to get N people talking:

|                                 | Cost                           | Problem                                                    |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| **Mesh** (everyone to everyone) | N² uploads per client          | A phone uploading 9 copies of its own audio dies.          |
| **MCU** (mix server-side)       | 1 decode + 1 encode per stream | CPU per participant. A single machine handles a few dozen. |
| **SFU** (forward)               | ~0 CPU per stream              | Each client decodes N−1 streams.                           |

This is an SFU. When Alice publishes, the server forwards her packets to Bob,
Sarah and Mike untouched:

```
  Alice ──publisher PC──▶ on_track ──▶ pump task ──▶ tokio::broadcast (512 slots)
                                                            │
                                  ┌─────────────────────────┼──────────────────┐
                                  ▼                         ▼                  ▼
                            Bob's forward task        Sarah's             Mike's
                                  │                         │                  │
                            subscriber PC             subscriber PC      subscriber PC
```

Nothing is decoded. Nothing is re-encoded. Server CPU grows with _packets_,
not with pixels — which is why adding a codec is a configuration change and why
a 1080p room costs the server no more than a 360p one.

## The three header rewrites

A forwarded packet cannot go out verbatim. `rtc::RtpSender::write_rtp` validates
every packet against what that specific connection negotiated, and rejects
anything that does not match. Three fields have to change.

### 1. SSRC

Each subscriber's local track has its own synchronisation source. Forwarding
Alice's SSRC to Bob is rejected with `ErrSenderWithNoSSRCs`.

```rust
packet.header.ssrc = subscriber_ssrc;
```

### 2. Payload type

Alice's browser may have negotiated Opus as PT 111 while Bob's negotiated 109.
Forwarding 111 to Bob is rejected with `ErrRTPTransceiverCodecUnsupported`.

The right value is not knowable in advance — it comes out of _Bob's_
negotiation. The forwarding task discovers it from the subscriber's own sender
parameters once negotiation completes, caches it, and re-resolves if a write
ever fails (which is what a renegotiation looks like from inside the loop).

```rust
packet.header.payload_type = resolved_pt;
```

Packets that arrive before the PT is known are dropped rather than queued. A few
tens of milliseconds of audio at the very start of a subscription is not worth
buffering for.

### 3. Header extensions

Extension **ids** are negotiated per connection. Alice's `mid` extension might
be id 4 on her leg and id 9 on Bob's; forwarding hers is rejected with
`ErrHeaderExtensionNotFound`.

The SFU has no use for them downstream, so they are stripped **once** in the
pump task rather than remapped per subscriber:

```rust
packet.header.extension = false;
packet.header.extensions.clear();
packet.header.extension_profile = 0;
```

The one thing read before stripping is the RFC 6464 audio level, which feeds
voice activity detection.

Everything else — sequence numbers, timestamps, marker bits, the payload —
passes through untouched. That is what keeps the stream decodable.

## No copying

`rtp::Packet`'s payload is a `bytes::Bytes`. Cloning a packet for each
subscriber bumps a refcount; it does not memcpy the frame. Only the 12-byte
header is rewritten, on each subscriber's own clone.

There is no serialisation anywhere in the forwarding path. Nothing is converted
to JSON, nothing is written to a database, nothing crosses a process boundary.

## Task shape

- **One task per published track** (the pump), draining the publisher.
- **One task per subscription** (the forwarder), writing to one subscriber.
- **One task per subscription** (the feedback relay), watching for PLIs.

A room's task count grows with tracks and subscriptions, not with traffic. No
task is spawned per packet — that would be the classic way to make an SFU fall
over under load.

## Back-pressure

Every channel is bounded. The fan-out channel holds 512 packets: about 10
seconds of Opus, a fraction of a second of video.

A subscriber that stops draining is **lagged** by the broadcast channel — it
loses the oldest packets and is told it lagged. For video, the forwarder then
requests a keyframe so the subscriber recovers.

This is the right failure mode. The alternative, buffering, trades a momentary
glitch for unbounded memory _and_ ever-growing latency, and a realtime stream
that is five seconds behind is worse than one with a dropout.

## Keyframes

An SFU cannot make a keyframe; it has no encoder. A video subscriber that joins
mid-stream, or that loses packets, sends a PLI — which is meaningful only to the
publisher.

So the feedback relay watches each local track for RTCP, downcasts to identify
PLI and FIR specifically (receiver reports arrive constantly and mean nothing
here), and forwards the request upstream to the publisher's remote track.

Rate-limited to one request per 500 ms per track. Ten subscribers joining at
once must not become ten keyframe requests, or the publisher spends its entire
bitrate on intra frames.

## Subscription policy

**Audio is auto-subscribed. Video is not.**

Nobody joins a hangout and then asks to hear each person individually — voice is
the product. But a twenty-person room must not push nineteen video streams at a
phone on cellular, so cameras and screen shares are explicit, driven by what the
client actually renders. `MEDIA_AUTO_SUBSCRIBE_VIDEO=true` overrides for small
rooms and tests.

## Room lifecycle

```
first join ──▶ room created (lazily — the control plane owns whether a room
    │                        exists as a concept; the media server owns
    │                        whether anyone is in it, so nothing has to be
    │                        kept in sync)
    ├── participant joins      → auto-subscribed to live audio
    ├── participant publishes  → everyone else auto-subscribed, one renegotiation
    ├── participant unpublishes→ every subscriber detached
    └── participant leaves     → their tracks removed from every subscriber,
                                 their own transport closed, tasks aborted
last leave ──▶ room destroyed
```

Destruction is checked under the registry's write lock, so a join racing the
last departure can neither resurrect a room that is about to be dropped nor be
dropped itself.

## Why the room layer has no WebRTC in it

`crates/media-room` is layered:

| Module        | WebRTC?      | Owns                                                             |
| ------------- | ------------ | ---------------------------------------------------------------- |
| `manager`     | no           | the registry of live rooms                                       |
| `room`        | no           | who is in it, who publishes what, who hears whom                 |
| `participant` | no           | one participant's bookkeeping, and the `SubscriberSink` boundary |
| `track`       | packets only | a published track and its fan-out                                |
| `sfu`         | **yes**      | peer connections, forwarding tasks, RTCP relay                   |

`SubscriberSink` is the seam, and it is the only abstraction in the crate with a
single production implementation. It earns that: it makes the entire room
lifecycle — join, publish, subscribe, unpublish, leave, destroy — testable with
no UDP sockets, no DTLS handshake and no timing. Without it, "does leaving a
room detach every subscriber?" would only be answerable by hand with two
browsers.

That is why `cargo test -p genzh-room` runs 49 tests in milliseconds.

## Voice activity detection

`VoiceActivityDetector` has three plausible implementations:

1. **Client-reported** (`NoopVad`, the default). The publisher runs an
   `AnalyserNode` and sends `speaking: true/false`. Costs the server nothing.
2. **RTP audio level** (`AudioLevelVad`). Reads the RFC 6464 header extension
   that browsers already attach to every Opus packet, with hysteresis — three
   consecutive loud packets to start, 250 ms of silence to stop, so the
   indicator does not strobe between words. The server learns who is talking
   **without decoding a single frame**.
3. **Decoded-signal VAD.** Real DSP on PCM. Requires decoding Opus, which this
   SFU explicitly does not do; it would live in a side-car.

The room manager talks to the trait and never to a concrete detector, so
switching is a config change (`MEDIA_VAD_MODE`).

Caveat, stated honestly: server-side mode reads the extension id from
`MEDIA_AUDIO_LEVEL_EXT_ID` rather than from the negotiated value, because the
negotiated id is chosen by the offerer and the media engine does not surface it
after construction. That is why client-reported is the default.

## What is deliberately absent

- **Transcoding.** A CPU-per-stream cost that changes the shape of the service.
  A client that cannot decode a negotiated codec does not receive that track.
- **Mixing.** That would make this an MCU.
- **Recording.** Belongs in a separate subscriber, not in the forwarding path.
- **Simulcast layer selection.** Not yet — see the README's limitations. The
  codec registry and per-subscription track model are where it will go, and the
  wire protocol will not need to change.
