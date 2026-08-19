# genzh-backend

Rust backend for a mobile-first social hangout platform: accounts, communities,
rooms, permissions, chat — and realtime voice, video and screen sharing through
a selective forwarding unit.

Two independently deployable binaries, one PostgreSQL database, no other
infrastructure.

```
apps/api    control plane  — who you are, what you may do
apps/media  media plane    — WebRTC, RTP forwarding
apps/web    web client     — React + Base UI + CSS Modules
```

---

## 1. Architecture

### The split, and why

The API and the media server solve completely different problems and fail in
completely different ways.

| | control plane (`apps/api`) | media plane (`apps/media`) |
|---|---|---|
| Owns | accounts, communities, roles, rooms, messages | peer connections, tracks, RTP |
| Talks to | PostgreSQL | UDP sockets |
| Scales with | requests per second | concurrent streams and bandwidth |
| Failure mode | a request 500s | a call drops |
| Restart cost | in-flight requests | **every live call** |

Keeping them in one process would mean a schema migration can interrupt a
conversation, and a busy voice room can slow down a login. Keeping them apart
means the API can be redeployed at any time while calls continue, and media
servers can be scaled on entirely different metrics.

### How they meet: one signed token

The media server has **no database credentials**. It cannot look up a user, a
room, or a permission. Everything it is allowed to believe arrives in a
short-lived token the API signs.

```
  client ──POST /rooms/{id}/media/join──▶ API ──▶ PostgreSQL
                                           │      "is this user a member?
                                           │       does their role grant speak?
                                           │       is this even a voice room?"
                                           │
                                           │ mints a 2-minute HS256 token
                                           ▼
  client ──wss://media/ws/media { token } ─▶ media ── verify HMAC locally ──▶ admit
```

The consequences are the point:

* **No database query on the media path.** Admitting a participant costs one
  HMAC verification. Forwarding a packet costs nothing at all — it never
  touches the control plane.
* **PostgreSQL never sees RTP.** Nor does the API: no audio or video byte
  passes through `apps/api` at any point.
* **The blast radius is bounded.** A compromised media server can forge media
  tokens for its own secret, and nothing else. It cannot mint user sessions,
  because `MEDIA_TOKEN_SECRET` and `JWT_SECRET` are different keys — the API
  refuses to start if they match.

The token is a *snapshot of an authorization decision*, which is exactly why it
lives for two minutes rather than an hour. Live permission changes are a
signalling-level concern, not a token-lifetime concern.

### Layers inside the API

```
HTTP / WebSocket
     ↓
Router              apps/api/src/router.rs
     ↓
Handler             apps/api/src/routes/…      thin: parse, delegate, shape
     ↓
Application service crates/{auth,community,room,messaging,social}
     ↓
Domain              crates/domain              rules, no I/O
     ↓
Repository          per-context crates         SQL, no rules
     ↓
PostgreSQL
```

Handlers contain no business logic and no SQL. Services take domain types and
return domain errors. The domain crate has no database dependency of its own,
so its rules are unit-testable without a connection — which is why the
permission model has 25 tests that run in microseconds.

### Dependency direction across the boundary

```
apps/api ──▶ genzh-{auth,community,room,messaging,graph} ──▶ genzh-domain ──▶ (sqlx)
    │
    └──▶ genzh-core ◀── genzh-room ◀── apps/media
                  ▲
        the ONLY crate both planes share:
        token claims, media permissions, ICE config,
        codec registry, track kinds, room events, VAD trait
```

`genzh-core` has no SQLx, no HTTP, and no dependency on `genzh-domain`.
The media plane therefore *cannot* reference a database model even by accident.

---

## 2. Repository layout

```
genzh-backend/
├── Cargo.toml                   workspace, shared dependency versions
├── docker-compose.yml           postgres + api + media
├── Dockerfile.api
├── Dockerfile.media
├── .env.example
│
├── apps/
│   ├── api/                     control plane (lib + bin, so tests get the real router)
│   │   ├── src/
│   │   │   ├── main.rs          startup, tracing, graceful shutdown
│   │   │   ├── lib.rs
│   │   │   ├── config.rs        environment → Config, with the secret checks
│   │   │   ├── state.rs         dependency injection container
│   │   │   ├── router.rs        the routing table and middleware stack
│   │   │   ├── error.rs         domain errors → HTTP status + stable codes
│   │   │   ├── extract.rs       ApiJson: rejections in the API's error shape
│   │   │   ├── middleware/      CurrentUser, request id, rate limiting
│   │   │   └── routes/          thin handlers
│   │   └── tests/               integration tests against real PostgreSQL
│   │
│   ├── media/                   media plane
│   │   └── src/
│   │       ├── main.rs          startup, health, graceful room teardown
│   │       ├── config.rs        no DATABASE_URL, no JWT_SECRET
│   │       ├── state.rs
│   │       ├── auth.rs          media token verification — the whole trust boundary
│   │       ├── signaling.rs     the per-connection loop
│   │       └── error.rs         close codes
│   │
│   └── web/                     web client (see apps/web/README.md)
│       └── src/
│           ├── components/      Base UI + CSS Modules, one folder each
│           ├── routes/          screens
│           └── lib/
│               ├── api/         typed client
│               ├── auth/        session and refresh
│               └── media/       VoiceClient — the browser half of the SFU
│
├── crates/
│   ├── domain/                  ids, entities, RoomType, Permission — pure
│   ├── infrastructure/          pool, migrations, error translation
│   ├── auth/                    Argon2id, JWT, sessions
│   ├── community/               communities, roles, the permission resolver
│   ├── social/                  friendships, blocks
│   ├── room/                    rooms, room authorization, media session issuing
│   ├── messaging/               messages, reactions
│   ├── media-core/              the two-plane contract (no db, no http)
│   ├── media-signaling/         the wire protocol and its limits
│   └── media-room/              rooms, participants, tracks, and the SFU
│
├── migrations/                  0001_initial_schema.sql, 0002_seed_permissions.sql
└── docs/                        API reference, signalling protocol, SFU internals
```

---

## 3. Setup

### Requirements

Rust 1.90+ and PostgreSQL 14+. Nothing else.

### Local, without Docker

```bash
# 1. secrets
cp .env.example .env
printf 'JWT_SECRET=%s\n'         "$(openssl rand -base64 48)" >> .env
printf 'MEDIA_TOKEN_SECRET=%s\n' "$(openssl rand -base64 48)" >> .env

# 2. database
createdb social

# 3. build and check
cargo check --workspace
cargo test  --workspace

# 4. run (two terminals)
cargo run -p api      # :8080 — applies migrations on startup
cargo run -p media    # :8081
```

```bash
curl -s localhost:8080/ready | jq
curl -s localhost:8081/ready | jq
```

### With Docker

```bash
cp .env.example .env   # fill in the two secrets first
docker compose up --build
```

On Linux, prefer `network_mode: host` for the `media` service — WebRTC needs
real UDP reachability, and bridge NAT breaks host candidates. See the comment
in `Dockerfile.media`.

---

## 4. Environment variables

Everything is in `.env.example` with commentary. The ones that matter most:

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | api | The media server has none, by design. |
| `JWT_SECRET` | api | Signs user access tokens. No default; ≥32 chars. |
| `MEDIA_TOKEN_SECRET` | api + media | The shared key. **Must differ from `JWT_SECRET`** — startup fails otherwise. |
| `MEDIA_SERVER_URL` | api | Comma-separated WS URLs, as a *client* dials them. |
| `STUN_URL` | both | Discovers the public address. |
| `TURN_URL` / `TURN_USERNAME` / `TURN_PASSWORD` | both | Without a relay, restrictive networks cannot connect at all. |
| `MEDIA_CODECS` | media | e.g. `opus,vp8,h264`. Blank = everything. |
| `MEDIA_VAD_MODE` | media | `client` (default) or `server`. |
| `RUST_LOG` | both | e.g. `info,api=debug`. |

---

## 5. Database

One database, one schema. Not one per module: these tables reference each other
constantly (a message needs its room, a room needs its community, a role needs
its permissions), and splitting them would replace foreign keys with
application-level joins for no benefit at this size.

```
User ──1:1──▶ Profile
  └──*──▶ Session

Community ──▶ Members ──▶ MemberRoles ──▶ Roles ──▶ RolePermissions ──▶ Permissions
    └──▶ Rooms ──▶ RoomPermissions (per-room allow/deny overrides)
           └──▶ Messages ──▶ MessageReactions

Friendship (unordered pair)   Block (one-directional)
```

UUID primary keys, generated by the application. `TIMESTAMPTZ` everywhere; there
is no naive timestamp in the system.

**Running migrations.** The API applies them on startup (`RUN_MIGRATIONS=true`,
the default), and they are embedded in the binary at compile time — the image
carries its own schema. To apply them by hand:

```bash
cargo install sqlx-cli --no-default-features --features postgres
sqlx migrate run --database-url "$DATABASE_URL"
```

Queries are **runtime-checked** (`query_as`, not `query_as!`) so `cargo check`
works on a fresh clone with no database and no `.sqlx` cache to go stale.

---

## 6. API

Full reference in [`docs/api.md`](docs/api.md). Every response, including every
error, has one shape:

```json
{ "error": { "code": "ROOM_ACCESS_DENIED", "message": "You do not have permission to join this room" } }
```

```
POST   /api/v1/auth/register            GET    /api/v1/communities
POST   /api/v1/auth/login               POST   /api/v1/communities
POST   /api/v1/auth/refresh             GET    /api/v1/communities/{id}
POST   /api/v1/auth/logout              PATCH  /api/v1/communities/{id}
GET    /api/v1/me                       DELETE /api/v1/communities/{id}
GET    /api/v1/users/{id}
PATCH  /api/v1/me                       POST   /api/v1/communities/{id}/members
                                        DELETE /api/v1/communities/{id}/members/{user_id}
GET    /api/v1/communities/{id}/rooms   POST   /api/v1/communities/{id}/roles
POST   /api/v1/communities/{id}/rooms   PATCH  /api/v1/communities/{id}/roles/{role_id}
GET    /api/v1/rooms/{id}
PATCH  /api/v1/rooms/{id}               GET    /api/v1/rooms/{id}/messages
DELETE /api/v1/rooms/{id}               POST   /api/v1/rooms/{id}/messages

POST   /api/v1/rooms/{id}/media/join    GET    /health
POST   /api/v1/rooms/{id}/media/leave   GET    /ready
```

Plus friends and blocks under `/api/v1/friends` and `/api/v1/blocks`.

> Route patterns are written `{id}` because Axum 0.8 uses that syntax. The URLs
> clients call are unchanged: `/api/v1/rooms/6f1c…/media/join`.

### Permissions

`view_room`, `send_message`, `add_reaction`, `speak`, `use_video`,
`screen_share`, `stream`, `mute_members`, `move_members`, `manage_room`,
`manage_community`, `manage_roles`, `manage_members`, `administrator`.

Resolution, in order:

1. Community owner → administrator, no further questions.
2. Otherwise, the **union** of every role held, including `@everyone`.
3. Then the room's overrides: denials subtracted, grants added.

Roles only ever *add* capability; removal is a room-level concern. That is what
makes "muted in this one room" expressible without inventing a negative role.
An administrator cannot be locked out by a room override.

Nothing about authorization lives in a JWT. An access token establishes
identity and carries no roles, no communities, no permissions — so demoting a
moderator takes effect on their next request rather than in fifteen minutes.

---

## 7. Media signalling protocol

Full reference in [`docs/media-protocol.md`](docs/media-protocol.md).
JSON over `wss://…/ws/media`, tagged on `type`, versioned by
`protocol_version` in the `joined` reply.

**Each participant runs two peer connections:**

| Target | Offerer | Carries |
|---|---|---|
| `publisher` | the client | that participant's own mic / camera / screen |
| `subscriber` | the server | everybody else's tracks |

This is a deliberate departure from a single-connection design, and it buys
one specific thing: **there is never a glare condition**. With one connection,
the server adds a track (someone joined) at the same moment the client adds one
(the user unmuted), both sides offer, and correct handling needs rollback and a
politeness rule. With one offerer per connection the problem does not exist.

```
client → join, offer(publisher), answer(subscriber), ice_candidate,
         publish_intent, subscribe, unsubscribe, mute, camera,
         screen_share, speaking, ping, leave

server → joined, offer(subscriber), answer(publisher), ice_candidate,
         event{participant_joined, participant_left, track_published,
               track_unpublished, speaking_started, speaking_stopped,
               microphone_muted, microphone_unmuted, camera_enabled,
               camera_disabled, screen_share_started, screen_share_stopped},
         error, pong
```

Realtime events are never written to PostgreSQL. A speaking indicator that
flips several times a second is worthless a minute later, and persisting it
would put the media plane back on the database's critical path.

---

## 8. How the SFU works

Full details in [`docs/sfu.md`](docs/sfu.md), and the code is heavily commented
in `crates/media-room/src/sfu.rs`.

```
  Alice ──publisher PC──▶ on_track ──▶ pump task ──▶ tokio::broadcast (512 slots)
                                                            │
                                  ┌─────────────────────────┼──────────────────┐
                                  ▼                         ▼                  ▼
                            Bob's forward task        Sarah's             Mike's
                                  │                         │                  │
                            subscriber PC             subscriber PC      subscriber PC
```

**Nothing is decoded and nothing is re-encoded.** The packet that arrives is
the packet that leaves, with three header fields rewritten. CPU grows with
*packets*, not with pixels.

Those three rewrites are mandatory, and each one is a real constraint of the
underlying stack (`rtc::RtpSender::write_rtp` validates every packet):

1. **SSRC** — each subscriber's track has its own synchronisation source;
   forwarding the publisher's is rejected with `ErrSenderWithNoSSRCs`.
2. **Payload type** — Alice's browser may have negotiated Opus as PT 111 while
   Bob's negotiated 109. The correct value is discovered from the subscriber's
   own sender parameters after negotiation and cached.
3. **Header extensions** — extension *ids* are per-connection, so the
   publisher's are meaningless on a subscriber's leg. They are stripped once in
   the pump task rather than remapped per subscriber.

Sequence numbers, timestamps, marker bits and the payload pass through
untouched, which is what keeps the stream decodable.

Other load-bearing details:

* **No payload copying.** `rtp::Packet`'s payload is `Bytes`; cloning it per
  subscriber bumps a refcount.
* **One task per track, not per packet.** A room's task count grows with tracks.
* **Bounded everywhere.** A subscriber that stops draining is *lagged* by the
  broadcast channel and loses packets — then gets a keyframe. Buffering instead
  would trade a momentary glitch for unbounded memory and growing latency.
* **Keyframes are relayed, not generated.** An SFU has no encoder. Subscriber
  PLIs are forwarded upstream to the publisher, rate-limited to one per 500 ms
  so ten simultaneous joins do not become ten keyframe requests.
* **Audio is auto-subscribed; video is not.** Nobody joins a hangout and then
  asks to hear each person individually. But a twenty-person room must not push
  nineteen video streams at a phone on cellular, so cameras and screen shares
  are explicit (`MEDIA_AUTO_SUBSCRIBE_VIDEO=true` overrides).

Built on **webrtc-rs 0.20.3** (`webrtc` + `rtc`), whose API was verified
against the installed crate source rather than assumed — 0.20 is a rewrite over
a sans-I/O core and shares almost no surface with 0.11-era tutorials.

---

## 9. Running two clients against a voice room

`apps/web` is the client. Three processes:

```bash
# terminal 1 — control plane
CORS_ALLOWED_ORIGINS=http://localhost:5173 cargo run -p api

# terminal 2 — media plane
cargo run -p media

# terminal 3 — web client
cd apps/web && npm install && npm run dev
```

Then, in two browser windows (or two devices on the same network):

1. Open <http://localhost:5173> and create an account.
2. Create a community, then a **voice** room inside it.
3. On the community page, copy the community id.
4. In the second window, register a second account, paste the id into
   **Join with an invite**, and open the same room.
5. Both press **Join voice**, then **Unmute**.

Each participant appears with a speaking ring driven by the SFU's
`speaking_started` / `speaking_stopped` events. Leaving, or closing the tab,
tears down both peer connections and releases the microphone.

To confirm media is actually flowing rather than trusting the UI, open
`chrome://webrtc-internals` and look for non-zero `packetsSent` on the
publisher connection and `packetsReceived` on the subscriber.

## 10. Known limitations

Honest list. None of these are hidden in the code.

1. **No simulcast or SVC yet.** Every subscriber gets the publisher's single
   encoding. A participant on cellular receives the same 2 Mbps stream as one on
   fibre. The codec registry and per-subscription track model are where layer
   selection will go; the wire protocol does not need to change.
2. **No transcoding, deliberately.** A client that cannot decode a negotiated
   codec simply does not receive that track. Transcoding is a CPU-per-stream
   cost that changes the shape of the whole service.
3. **Server-side VAD needs a configured extension id.** `MEDIA_VAD_MODE=server`
   reads the RFC 6464 audio level, but the negotiated extension id is chosen by
   the offerer and this build reads `MEDIA_AUDIO_LEVEL_EXT_ID` instead of the
   negotiated value. The default mode is client-reported, so this does not
   affect normal operation — but it is why the default is what it is.
4. **Room state is in memory.** A media server restart drops its calls. This is
   inherent to owning the UDP sockets; the fix is draining and re-signalling,
   not shared state.
5. **Media server selection is a hash of the room id.** Stable and correct, but
   changing `MEDIA_SERVER_URL` reshuffles rooms, and it does not consider load.
   `MediaServerSelector` is the seam.
6. **Rate limiting is per-process.** Two API replicas mean two budgets. The
   `RateLimiter` trait exists precisely so this can become shared.
7. **`X-Forwarded-For` is not trusted.** Rate limiting keys on the peer address,
   which behind a proxy is the proxy. Correct rather than convenient; the proxy
   should enforce it or be configured as trusted.
8. **Integration tests skip without a database.** `cargo test --workspace`
   passes on a fresh clone because the database-backed tests announce a skip.
   Set `TEST_DATABASE_URL` to actually run them — and do, in CI.
9. **No presence, activities, marketplace or monetisation.** Out of scope for
   this phase; the schema and room model leave room for them.
10. **One screen share per participant**, enforced by the track model.

---

## 11. Next steps for production scale

Roughly in the order the load will demand them.

**10 → 100 users.** What is here. One API, one media server, one PostgreSQL.
Add a TURN server (coturn) before real users arrive — without a relay, a
meaningful fraction of mobile networks cannot connect at all.

**100 → 1,000.** Several API replicas behind a load balancer (they are already
stateless). Several media servers — room-to-server mapping already exists.
Move rate limiting behind a shared store. Add a read replica if message history
becomes the hot path.

**1,000 → 10,000.**
* *Simulcast.* The single biggest quality-per-bit win, and the point where a
  20-person video room becomes usable on a phone.
* *A real media-server registry.* Replace the hash with servers that register
  themselves and report load, so rooms land on capacity rather than on a
  modulus. `MediaServerSelector` is the interface.
* *Redis for presence and the room directory* — the first genuinely shared
  state. Note what it is *not* for: not media, not authorization, not caching
  permissions until there is a measured problem.
* *Partition messages by room*, or move history to a time-series-shaped store.

**10,000+.**
* *Cascading SFUs*, so a room can span servers and regions.
* *Regional media deployment* — latency is geography, and no amount of
  optimisation beats a shorter path.
* *A separate WebSocket presence service*; presence fan-out has a very
  different shape from media forwarding.
* *An event bus* (NATS or Kafka) once several services genuinely need the same
  events. Not before: today there is exactly one producer and one consumer per
  event, and a broker between them would be pure operational cost.

What deliberately does **not** appear on this list: microservices per domain,
Kubernetes, CQRS, event sourcing. Each solves a problem this system does not
have, and each adds a failure mode it would then need to handle.

---

## Testing

```bash
cargo test --workspace                                   # unit tests, no database needed
TEST_DATABASE_URL=postgres://…/social cargo test         # + integration tests
```

Roughly 200 tests. The ones worth knowing about:

| Area | Where |
|---|---|
| Permission resolution, room overrides, escalation guard | `crates/domain`, `crates/community` |
| Media token: forged, expired, wrong room, wrong issuer, tampered | `crates/media-core`, `apps/media/src/auth.rs` |
| Room lifecycle: join, publish, subscribe, unpublish, leave, destroy | `crates/media-room` |
| RTP fan-out, lag behaviour, header stripping, keyframe relay | `crates/media-room` |
| Register → community → voice room → media token, end to end | `apps/api/tests/api.rs` |
| Outsiders get no room access and no media token | `apps/api/tests/api.rs` |

The media-room tests run the whole participant lifecycle against a recording
transport double, so "does leaving detach every subscriber?" is answerable in
milliseconds instead of by hand with two browsers.

## License

MIT OR Apache-2.0
