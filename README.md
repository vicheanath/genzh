# genzh

A mobile-first social platform that is deliberately **two products sharing one
backend**:

| **Playground** | **Servers** |
| --- | --- |
| Throwaway rooms you drop into and leave. A full-screen feed you swipe. Nothing in it is still here tomorrow. | Discord-style communities you belong to. Channels, roles, history, people who are still there next week. |

Accounts, communities, rooms, permissions and chat — plus realtime voice, video
and screen sharing through a selective forwarding unit. Two independently
deployable Rust binaries, one PostgreSQL database, no other infrastructure.

```
apps/api          control plane  — who you are, what you may do
apps/media        media plane    — WebRTC, RTP forwarding
apps/web          web client     — React + Base UI + CSS Modules
apps/mobile       phone client   — Expo + React Navigation
packages/shared   @genzh/shared  — wire types, endpoints, queries, sockets
```

### Documentation

| Document | Covers |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | **Start here.** The two halves, the three planes, layering, the client stack, how data moves |
| [`docs/rooms.md`](docs/rooms.md) | The room model in full: pillars, the three kinds of room, lifecycle, the feed |
| [`docs/clients.md`](docs/clients.md) | The web and mobile apps: the mode split in the UI, the query layers, the design system, the traps |
| [`docs/api.md`](docs/api.md) | Endpoint reference |
| [`docs/media-protocol.md`](docs/media-protocol.md) | The signalling wire protocol |
| [`docs/sfu.md`](docs/sfu.md) | How the SFU forwards packets |
| [`docs/deploy-cloudflare-tunnel.md`](docs/deploy-cloudflare-tunnel.md) | Getting it onto the internet |

---

## 1. Architecture

Summarised here; the full treatment is [`docs/architecture.md`](docs/architecture.md).

### The product split, and why it is in the schema

The two halves make opposite promises, so the difference cannot live only in the
UI. One predicate in `crates/domain/src/room.rs` decides which half a room
belongs to:

```rust
pub fn is_playground(&self) -> bool {
    self.community_id.is_none() && !self.is_direct()
}
```

| Kind | `community_id` | `category` | Expires | Discoverable |
| --- | --- | --- | --- | --- |
| Community channel | set | anything | no | no |
| Direct conversation | `NULL` | `'dm'` | no | no |
| **Playground room** | `NULL` | anything else | **always** | **yes** |

A playground room always ends — at a TTL it is given whether or not the creator
asked for one, or shortly after the last person leaves. A channel and a DM never
do. Every surface that shows rooms to a stranger filters on that scope in SQL,
as a filter and never as a ranking. See [`docs/rooms.md`](docs/rooms.md).

### The two binaries, and why


The API handles all control-plane logic: accounts, communities, roles, rooms,
messages, and permissions. LiveKit handles all media: peer connections, tracks,
RTP forwarding, and bandwidth management.

The API mints short-lived LiveKit access tokens, signed with a shared secret.
When a client joins a room, the API issues a token and the client uses it to
connect directly to LiveKit. No media flows through the API.

```
  client ──POST /rooms/{id}/media/join──▶ API ──▶ PostgreSQL
                                           │      "is this user a member?
                                           │       does their role grant speak?"
                                           │
                                           │ mints LiveKit access token (2 min)
                                           ▼
  client ──────────────────────────────▶ LiveKit ── forward media
```

The benefits:

* **No database query on the media path.** LiveKit admits a participant with a
  simple signature check on the token.
* **PostgreSQL never sees RTP.** No audio or video passes through `apps/api`.
* **The API can scale and redeploy independently.** Calls continue unaffected
  while the control plane updates.
* **LiveKit handles all media complexity.** Codec negotiation, bandwidth
  adaptation, participant management — all delegated to a proven service.

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

### Dependency direction

```
apps/api ──▶ genzh-{auth,community,room,messaging,graph,notification,
    │                recommend,admin,cron} ──▶ genzh-domain ──▶ (sqlx)
    │
    └──▶ genzh-media-core ◀── genzh-room ◀── apps/media
                       ▲
        the ONLY crate both planes share:
        token claims, media permissions, ICE config,
        codec registry, track kinds, room events, VAD trait
```

`genzh-media-core` has no SQLx, no HTTP, and no dependency on `genzh-domain`.
The media plane therefore *cannot* reference a database model even by accident.

---

## 2. Repository layout

```
genzh/
├── Cargo.toml                   workspace, shared dependency versions
├── pnpm-workspace.yaml          apps/web, apps/mobile, packages/shared
├── docker-compose.yml           postgres + api + media + coturn
├── Dockerfile.api  Dockerfile.media  Dockerfile.web
├── .env.example
│
├── apps/
│   ├── api/                     control plane (lib + bin, so tests get the real router)
│   │   ├── src/
│   │   │   ├── main.rs          startup, tracing, graceful shutdown
│   │   │   ├── config.rs        environment → Config, with the secret checks
│   │   │   ├── state.rs         dependency injection container
│   │   │   ├── router.rs        the routing table and middleware stack
│   │   │   ├── error.rs         domain errors → HTTP status + stable codes
│   │   │   ├── extract.rs       ApiJson: rejections in the API's error shape
│   │   │   ├── middleware/      CurrentUser, request id, rate limiting
│   │   │   ├── jobs/            the recurring work, one file each
│   │   │   ├── oauth/           provider flows
│   │   │   └── routes/          thin handlers — incl. bff.rs and ws/
│   │   └── tests/               integration tests against real PostgreSQL
│   │
│   ├── media/                   media plane
│   │   └── src/
│   │       ├── auth.rs          media token verification — the whole trust boundary
│   │       ├── signaling.rs     the per-connection loop
│   │       └── config.rs        no DATABASE_URL, no JWT_SECRET
│   │
│   ├── web/                     React + Base UI + CSS Modules
│   │   └── src/
│   │       ├── components/      one folder each
│   │       ├── features/        <domain>/api holds that domain's React Query hooks
│   │       │   └── playground/  the swipe feed
│   │       ├── routes/          screens, and shell/ for the rail + sidebar
│   │       └── lib/             api, auth, media, appMode, roomTypes, store
│   │
│   └── mobile/                  Expo + React Navigation
│       └── src/
│           ├── navigation/      two tab navigators — one per mode
│           ├── context/         Auth, AppMode, Chat, Voice
│           ├── screens/         one folder per destination, incl. playground/
│           ├── components/      the design system, mirrored from the web's
│           └── theme/           tokens, as plain objects (RN has no cascade)
│
├── packages/
│   └── shared/                  @genzh/shared — aliased to source, not built
│       └── src/
│           ├── api/             types.ts (mirrors the Rust DTOs), endpoints.ts
│           ├── queries/         React Query hooks + the query-key factory
│           ├── viewmodels/      composed hooks (mobile)
│           ├── ws/              ChatSocket
│           ├── media/           the client half of the SFU protocol
│           └── chat/            mentions, emoji, limits, notification rules
│
├── crates/
│   ├── domain/                  ids, entities, RoomType, Permission — pure, depends on nothing
│   ├── infrastructure/          pool, migrations, error translation, the volatile ports
│   ├── auth/                    Argon2id, JWT, sessions, OAuth, profiles
│   ├── community/               communities, roles, invites, the permission resolver
│   ├── social/                  friendships and blocks — package name `genzh-graph`
│   ├── room/                    rooms, authorization, discovery, media issuing
│   ├── messaging/               messages, reactions, pins, search
│   ├── notification/            the inbox, and what is worth waking somebody for
│   ├── recommend/               ranked suggestions — rooms, communities, people
│   ├── admin/                   platform staff, support queue, audit log, moderation
│   ├── cron/                    the job trait and the scheduler
│   ├── media-core/              the two-plane contract (no db, no http)
│   ├── media-signaling/         the wire protocol and its limits
│   └── media-room/              rooms, participants, tracks, and the SFU
│
├── migrations/                  0001…0017, applied by sqlx and embedded at build
├── deploy/                      home-server compose, TURN, deploy script
└── docs/                        architecture, rooms, API, protocol, SFU
```

---

## 3. Setup

### Requirements

Rust 1.90+ and PostgreSQL 14+. Nothing else.

### Local, without Docker

Requires: PostgreSQL 14+ and a running LiveKit server.

```bash
# 1. secrets
cp .env.example .env
printf 'JWT_SECRET=%s\n'         "$(openssl rand -base64 48)" >> .env
printf 'MEDIA_TOKEN_SECRET=%s\n' "$(openssl rand -base64 48)" >> .env

# 2. database
createdb social

# 3. configure LiveKit
# Point LIVEKIT_URL to your LiveKit server (or docker-compose livekit service)
# export LIVEKIT_URL="ws://localhost:7880"
# export LIVEKIT_API_KEY="devkey"
# export LIVEKIT_API_SECRET="secret"

# 4. build and check
cargo check --workspace
cargo test  --workspace

# 5. run API (applies migrations on startup)
cargo run -p api      # :8080
```

```bash
curl -s localhost:8080/ready | jq
```

### With Docker

```bash
cp .env.example .env
# Optionally fill in JWT_SECRET and MEDIA_TOKEN_SECRET for production
docker compose up --build
```

LiveKit is included in the compose stack and handles all media streaming.

---

## 4. Environment variables

Everything is in `.env.example` with commentary. The ones that matter most:

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | api | PostgreSQL connection string. |
| `JWT_SECRET` | api | Signs user access tokens. No default; ≥32 chars. |
| `MEDIA_TOKEN_SECRET` | api | Secret for signing LiveKit access tokens. **Must differ from `JWT_SECRET`**. |
| `LIVEKIT_URL` | api + client | WebSocket URL for LiveKit server. |
| `LIVEKIT_API_KEY` | api | LiveKit API key for token generation. |
| `LIVEKIT_API_SECRET` | api | LiveKit API secret for token generation. |
| `STUN_URL` | client | STUN server for NAT traversal (optional). |
| `TURN_URL` / `TURN_USERNAME` / `TURN_PASSWORD` | client | TURN server for restrictive networks (optional). |
| `RUST_LOG` | api | e.g. `info,api=debug`. |

---

## 5. Database

One database, one schema. Not one per module: these tables reference each other
constantly (a message needs its room, a room needs its community, a role needs
its permissions), and splitting them would replace foreign keys with
application-level joins for no benefit at this size.

```
User ──1:1──▶ Profile
  ├──*──▶ Session
  ├──*──▶ Friendship (unordered pair)   Block (one-directional)
  └──*──▶ Notification   Inventory   Referral

Community ──▶ Members ──▶ MemberRoles ──▶ Roles ──▶ RolePermissions ──▶ Permissions
    └──▶ Rooms ──▶ RoomPermissions (per-room allow/deny overrides)
           ├──▶ RoomParticipants ──▶ RoomAnonymousIdentity
           └──▶ Messages ──▶ MessageReactions

Rooms with community_id IS NULL are standalone: a playground room, or —
when category = 'dm' — a direct conversation.
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

Three traps, all met the hard way — the third took the API down completely:

* **Never apply a migration by hand with `psql -f`.** It records no row in
  `_sqlx_migrations`, so the next sqlx run retries it and fails, which silently
  turns every integration test into a *skip* reported as "N passed" in 0.00s.
* **`CREATE TYPE` is not idempotent** — Postgres has no `IF NOT EXISTS` for it.
  Use the `DO $$ … EXCEPTION WHEN duplicate_object` block the existing
  migrations use.
* **A new enum label cannot be used by the migration that adds it.** sqlx wraps
  each migration in one transaction and Postgres rejects it as *"unsafe use of
  new value"*. Compare as text: `WHERE room_type::text IN (…)`.

Since migrations are embedded at compile time, editing a `.sql` and re-running
an existing binary changes nothing. Rebuild.

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
── auth ──                              ── communities ──
POST   /auth/register                   GET    /communities
POST   /auth/login                      POST   /communities
POST   /auth/refresh                    GET    /communities/{id}
POST   /auth/logout                     PATCH  /communities/{id}
GET    /me   PATCH /me                  DELETE /communities/{id}
GET    /users/{id}                      POST   /communities/{id}/members
                                        POST   /communities/{id}/roles
── rooms ──                             GET    /communities/{id}/rooms
POST   /rooms          (playground)     POST   /communities/{id}/rooms
GET    /rooms/mine
GET    /rooms/{id}                      ── the playground ──
PATCH  /rooms/{id}                      GET    /rooms/feed
DELETE /rooms/{id}                      GET    /rooms/discovery
POST   /rooms/{id}/join                 GET    /rooms/trending
POST   /rooms/{id}/leave                GET    /rooms/live
PATCH  /rooms/{id}/persona              GET    /rooms/random
POST   /rooms/dm/{user_id}

── messages ──                          ── composite views (BFF) ──
GET    /rooms/{id}/messages             GET    /me/overview
POST   /rooms/{id}/messages             GET    /me/social
PATCH  /messages/{id}                   GET    /communities/{id}/overview
GET    /search/messages                 POST   /rooms/{id}/session

── media ──                             ── realtime & health ──
POST   /rooms/{id}/media/join           GET    /ws
POST   /rooms/{id}/media/leave          GET    /health   GET /ready
```

Plus friends and blocks under `/friends` and `/blocks`, the inbox under
`/notifications`, rewards under `/economy`, `/store` and `/inventory`, and the
platform console under `/admin`.

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

## 7. LiveKit Integration

The API does not handle media directly. When a client joins a voice room:

1. The client calls `POST /api/v1/rooms/{id}/media/join`.
2. The API verifies permissions and generates a LiveKit access token (2-minute TTL).
3. The client receives the token and connects to LiveKit.
4. LiveKit handles all media: encoding, decoding, forwarding, bandwidth management.

The client uses the LiveKit JavaScript SDK to manage the WebRTC connection,
handle tracks, and control the local mic/camera.

Full API reference in [`docs/api.md`](docs/api.md).

---

## 9. Running two clients against a voice room

With docker-compose (recommended for development):

```bash
cp .env.example .env
# Fill in JWT_SECRET and MEDIA_TOKEN_SECRET if not present
docker compose up --build
```

Or locally with Cargo (requires PostgreSQL and LiveKit running separately):

```bash
# terminal 1 — control plane + PostgreSQL
CORS_ALLOWED_ORIGINS=http://localhost:5173 cargo run -p api

# terminal 2 — web client
cd apps/web && npm install && npm run dev
```

Then, in two browser windows (or two devices on the same network):

1. Open <http://localhost:5173> and create an account.
2. Create a community, then a **voice** room inside it.
3. On the community page, copy the community id.
4. In the second window, register a second account, paste the id into
   **Join with an invite**, and open the same room.
5. Both press **Join voice**, then **Unmute**.

Each participant connects to LiveKit. Leaving, or closing the tab,
tears down the WebRTC connection and releases the microphone.

To confirm media is actually flowing rather than trusting the UI, open
`chrome://webrtc-internals` and look for non-zero `packetsSent` and
`packetsReceived` on the connection.

## 8. Known limitations

1. **Rate limiting is per-process.** Two API replicas mean two separate budgets.
   The `RateLimiter` and `FloodGuard` traits exist precisely so both can become
   shared (e.g., backed by Redis).
2. **`X-Forwarded-For` is not trusted.** Rate limiting keys on the peer address,
   which behind a proxy is the proxy. Correct rather than convenient; the proxy
   should enforce it or be configured as trusted.
3. **Integration tests skip without a database.** `cargo test --workspace`
   passes on a fresh clone because the database-backed tests announce a skip.
   Set `TEST_DATABASE_URL` to actually run them — and do, in CI.
9. **One screen share per participant**, enforced by the track model.
10. **iOS screen share is impossible** without a broadcast extension. It works
    on Android.
11. **Expo Go cannot carry voice.** There is no WebRTC in it, so a call joins
    and carries no audio — a dev build is mandatory for the mobile client.
12. **`rooms.family` is written and never read.** Migration 0017 adds the
    column, backfills it and indexes it, but no query selects it: `RoomFamily`
    is derived in Rust from `room_type`. Either it should drive the pillar
    queries or it should be dropped; today it is neither.
13. **`RoomVisibility::FriendsOnly` is not enforced anywhere.** The variant
    exists; nothing reads it. Discovery filters on `public`, and access is
    decided by the `view_room` permission.
14. **The mobile playground feed has not been run on a device.** It typechecks
    and shares its logic with the verified web implementation, but the swipe
    snapping and safe-area insets are unproven on real hardware.

---

## 9. Next steps for production scale

Roughly in the order the load will demand them.

**10 → 100 users.** What is here. One API instance, one PostgreSQL database,
LiveKit media server. Add a TURN server (coturn) before real users arrive —
without a relay, a meaningful fraction of mobile networks cannot connect at all.

**100 → 1,000 users.** Scale the API horizontally: several replicas behind a
load balancer (they are already stateless). Move rate limiting and the
anti-spam guard behind a shared store (e.g., Redis). Add a PostgreSQL read
replica if message history becomes the hot path.

**1,000 → 10,000 users.**
* *Redis for presence and the room directory* — the first genuinely shared
  state. Note what it is *not* for: not authorization, not caching permissions
  until there is a measured problem.
* *Partition messages by room*, or move history to a time-series-shaped store.
* *LiveKit federation or multi-region deployment* — for latency-sensitive
  real-time communication.

**10,000+ users.**
* *An event bus* (NATS or Kafka) once several services genuinely need the same
  events. Not before: today there is exactly one producer and one consumer per
  event, and a broker between them would be pure operational cost.
* *Separate WebSocket presence service* if presence fan-out becomes a bottleneck.

What deliberately does **not** appear on this list: microservices per domain,
Kubernetes, CQRS, event sourcing. Each solves a problem this system does not
have, and each adds a failure mode it would then need to handle.

Media scaling is LiveKit's responsibility. The choice of LiveKit means
simulcast, SVC, adaptive bitrate, and regional deployment are available
but outside this backend's scope.

---

## 10. Testing

```bash
cargo test --workspace                                   # unit tests, no database needed
TEST_DATABASE_URL=postgres://…/social cargo test         # + integration tests

# the client side
cd packages/shared && npx tsc --noEmit
cd apps/web       && npx tsc --noEmit -p tsconfig.app.json
cd apps/mobile    && npx tsc --noEmit
```

> **The integration tests skip silently without a database** and still report
> "ok". A run that finishes in milliseconds skipped; a real run takes seconds.

Roughly 200 tests. The ones worth knowing about:

| Area | Where |
|---|---|
| Permission resolution, room overrides, escalation guard | `crates/domain`, `crates/community` |
| Media token: forged, expired, wrong room, wrong issuer, tampered | `crates/media-core`, `apps/media/src/auth.rs` |
| Room lifecycle: join, publish, subscribe, unpublish, leave, destroy | `crates/media-room` |
| RTP fan-out, lag behaviour, header stripping, keyframe relay | `crates/media-room` |
| Register → community → voice room → media token, end to end | `apps/api/tests/api.rs` |
| Outsiders get no room access and no media token | `apps/api/tests/api.rs` |
| The playground/servers split: what the feed shows, what expires, what gets reaped | `apps/api/tests/api.rs` |

The media-room tests run the whole participant lifecycle against a recording
transport double, so "does leaving detach every subscriber?" is answerable in
milliseconds instead of by hand with two browsers.

## License

MIT OR Apache-2.0
