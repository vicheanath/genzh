# Media signalling protocol

JSON over `wss://<media-server>/ws/media`, externally tagged on `type`.
Version 1.

JSON was chosen for the first implementation because it is debuggable from a
browser console. The `protocol_version` in the `joined` reply is what lets a
binary encoding replace it later without a flag day.

## Two peer connections

Each participant runs **two** `RTCPeerConnection`s, distinguished by `target`:

| Target       | Offerer        | Carries                                    |
| ------------ | -------------- | ------------------------------------------ |
| `publisher`  | the **client** | that participant's own mic, camera, screen |
| `subscriber` | the **server** | everybody else's tracks                    |

This is the one place the protocol departs from the obvious design, and it buys
something specific: **there is never a glare condition**.

With a single connection, the server must add a track (someone else joined) at
the same moment the client adds one (the user unmuted). Both sides try to offer.
Resolving that correctly needs SDP rollback and a politeness rule, and getting
it wrong wedges the call in a way that is very hard to reproduce. With one
offerer per connection, the situation cannot arise. The cost is a second
ICE/DTLS handshake, which is why every production SFU is built this way.

The protocol therefore rejects `offer` on the subscriber connection and `answer`
on the publisher connection outright, rather than trying to be accommodating.

## Connection lifecycle

```
  upgrade
    │
    ├─ client: join  ────────────────────────────▶ (10 s, then closed)
    │                                              token verified locally
    ├─ server: joined { participants, ice_servers }
    │
    ├─ client: publish_intent → offer(publisher)
    ├─ server: answer(publisher)
    ├─ both:   ice_candidate ⇄
    │
    ├─ …someone else publishes…
    ├─ server: event{track_published}, then offer(subscriber)
    ├─ client: answer(subscriber)
    │
    └─ leave / socket close / ICE failure
         → room departure, subscribers detached, both PCs closed, tasks aborted
```

The teardown path is the same regardless of how the connection ended, which is
why it lives after the loop rather than in each exit branch.

## Client → server

### `join`

```json
{ "type": "join", "room_id": "6f1c…", "token": "eyJ…" }
```

Must be the first message. Anything else first closes the socket with `4000`.

`room_id` is a **cross-check, not the source of truth** — it is compared
against the room named in the token. A valid token presented for a different
room is `4003`, not `4001`: the credential is genuine, it just does not open
this door.

There is conspicuously no `user_id` field. Identity comes from the token and
from nowhere else, so there is nothing for a client to lie in.

### `publish_intent`

```json
{ "type": "publish_intent", "kind": "camera", "client_track_id": "a1b2…" }
```

SDP cannot distinguish a camera from a screen capture — both are just video.
The client declares intent, and the server correlates `client_track_id` with the
`msid` that arrives in the offer.

If it is omitted, the server falls back to: audio → microphone, first video →
camera, second video → screen share. Sensible, but the declaration is better.

### `offer` / `answer` / `ice_candidate`

```json
{ "type": "offer",  "target": "publisher",  "sdp": "v=0…" }
{ "type": "answer", "target": "subscriber", "sdp": "v=0…" }
{ "type": "ice_candidate", "target": "publisher",
  "candidate": "candidate:1 1 udp …", "sdp_mid": "0", "sdp_mline_index": 0 }
```

`sdp_mid` and `sdp_mline_index` are optional. Candidates may legitimately arrive
before the description they belong to; the server logs and continues rather than
failing the connection.

### `subscribe` / `unsubscribe`

```json
{ "type": "subscribe", "participant_id": "aaf7…", "track_id": "aaf7…:camera" }
```

Audio is auto-subscribed by the server, so this is for video and screen share.
The track is looked up in the room's own registry: a client cannot conjure a
track nobody published, or name one belonging to another room.

Subscribing to video triggers a keyframe request upstream, because a subscriber
joining mid-stream has nothing decodable until an intra frame arrives.

### `mute` / `camera` / `screen_share`

```json
{ "type": "mute", "muted": false }
```

These are **presentation state**, not enforcement. A muted participant is
expected to stop sending, but the server does not rely on it: permission is
checked when a track is published, not when a flag flips.

`screen_share: false` also unpublishes the screen track, so a client that
forgets to renegotiate still leaves a clean room.

Participants **join muted**. Unmuting is an explicit act.

### `speaking`

```json
{ "type": "speaking", "speaking": true }
```

Honoured only when `MEDIA_VAD_MODE=client` (the default). Under
`MEDIA_VAD_MODE=server` it is ignored, because a client must not be able to
claim the speaking ring at will.

A muted participant never lights up, whatever the source claims.

### `ping`, `leave`

`ping` → `pong`. The server also pings at the WebSocket level every 15 s; this
exists for clients that cannot observe pongs.

## Server → client

### `joined`

```json
{
  "type": "joined",
  "protocol_version": 1,
  "participant_id": "aaf7…",
  "room_id": "6f1c…",
  "participants": [
    {
      "participant_id": "f73b…",
      "user_id": "da72…",
      "display_name": "Bob",
      "tracks": [
        {
          "track_id": "f73b…:audio",
          "kind": "audio",
          "mime_type": "audio/opus",
          "muted": false
        }
      ],
      "audio_muted": false,
      "camera_enabled": false,
      "screen_sharing": false
    }
  ],
  "ice_servers": [{ "urls": ["stun:…"] }]
}
```

Sent exactly once, before anything else, so a client always knows who it is and
who was already there before the first event arrives.

### `event`

Flattened, so client switch statements stay flat:

```json
{ "type": "event", "event": "speaking_started", "participant_id": "f73b…" }
```

| Event                                           | Payload                              |
| ----------------------------------------------- | ------------------------------------ |
| `participant_joined`                            | `participant`                        |
| `participant_left`                              | `participant_id`                     |
| `track_published`                               | `track`                              |
| `track_unpublished`                             | `participant_id`, `track_id`, `kind` |
| `speaking_started` / `speaking_stopped`         | `participant_id`                     |
| `microphone_muted`                              | `participant_id`, `by_moderator`     |
| `microphone_unmuted`                            | `participant_id`                     |
| `camera_enabled` / `camera_disabled`            | `participant_id`                     |
| `screen_share_started` / `screen_share_stopped` | `participant_id`                     |

Events are **never persisted**. A speaking indicator that flips several times a
second is worthless a minute later, and writing it would put the media plane
back on the database's critical path.

Under back-pressure only speaking events may be dropped: losing one is
invisible and self-correcting, whereas losing a `track_published` leaves a
client permanently unaware of a stream.

### `error`

```json
{ "type": "error", "code": "TRACK_NOT_FOUND", "message": "track … not found" }
```

Non-fatal — the connection stays open. Fatal problems arrive as an `error`
_followed by_ a close frame, because a close code alone cannot distinguish
"your token expired, fetch a new one" from "you may not enter this room", and
those need different client behaviour.

## Close codes

| Code   | Meaning            | What a client should do                        |
| ------ | ------------------ | ---------------------------------------------- |
| `1000` | Normal             | Nothing.                                       |
| `4000` | Protocol violation | Fix the client.                                |
| `4001` | Unauthorized       | Fetch a new media token.                       |
| `4003` | Forbidden          | Do not retry; the user cannot enter this room. |
| `4004` | Room full          | Retry later, or show a queue.                  |
| `4029` | Rate limited       | Back off.                                      |
| `4030` | Idle timeout       | Reconnect.                                     |
| `4500` | Server error       | Reconnect with backoff.                        |

## Limits

| Limit                  | Value   | Why                                                                                                                                                     |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frame size             | 64 KiB  | A bundled offer with several video sections lands near 16 KiB.                                                                                          |
| Message size           | 128 KiB | Checked _before_ parsing — `serde_json` on a 10 MB frame allocates 10 MB before reporting nonsense.                                                     |
| Handshake timeout      | 10 s    | A socket that connects and says nothing is the cheapest resource-exhaustion attack there is.                                                            |
| Idle timeout           | 60 s    | Generous: mobile clients suspend aggressively.                                                                                                          |
| Ping interval          | 15 s    |                                                                                                                                                         |
| Messages per second    | 50      | Signalling is bursty — an offer plus a dozen candidates arrive together. This stops a client spinning on `subscribe`, it does not shape normal traffic. |
| Outbound send timeout  | 5 s     | A client that stops reading is disconnected rather than parking a task holding two peer connections.                                                    |
| Tracks per participant | 3       | audio + camera + screen                                                                                                                                 |
| Participants per room  | 100     | Backstop, independent of what the control plane believed.                                                                                               |
