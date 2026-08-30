# genzh-backend

Rust backend for a mobile-first social hangout platform: accounts, communities,
rooms, permissions, chat — and realtime voice, video and screen sharing through
LiveKit.

One independently deployable binary, one PostgreSQL database, LiveKit for media,
no other infrastructure.

```
apps/api    control plane  — who you are, what you may do
apps/web    web client     — React + Base UI + CSS Modules
```

---

## 1. Architecture

### The separation of concerns

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
apps/api ──▶ genzh-{auth,community,room,messaging,graph} ──▶ genzh-domain ──▶ (sqlx)
    │
    └──▶ (standard dependencies: axum, tokio, etc.)
```

The API has no dependency on media infrastructure. LiveKit integration happens
purely at the HTTP level: the API generates tokens and responds with LiveKit
connection details; the client connects to LiveKit directly.

---

## 2. Repository layout

```
genzh-backend/
├── Cargo.toml                   workspace, shared dependency versions
├── docker-compose.yml           postgres + api + livekit (docker-compose handles livekit setup)
├── Dockerfile.api
├── Dockerfile.seed              seed database for development
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
│   └── web/                     web client (see apps/web/README.md)
│       └── src/
│           ├── components/      Base UI + CSS Modules, one folder each
│           ├── routes/          screens
│           └── lib/
│               ├── api/         typed client
│               ├── auth/        session and refresh
│               └── media/       LiveKit client integration
│
├── crates/
│   ├── domain/                  ids, entities, RoomType, Permission — pure
│   ├── infrastructure/          pool, migrations, error translation
│   ├── auth/                    Argon2id, JWT, sessions
│   ├── community/               communities, roles, the permission resolver
│   ├── social/                  friendships, blocks
│   ├── room/                    rooms, room authorization, LiveKit token issuing
│   ├── messaging/               messages, reactions
│   ├── notification/            notifications
│   ├── admin/                   admin functions
│   ├── cron/                    scheduled jobs
│   └── recommend/               recommendation engine
│
├── migrations/                  database schema and seed data
└── docs/                        API reference
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
4. **No presence, activities, marketplace or monetisation.** Out of scope for
   this phase; the schema and room model leave room for them.
5. **Media features are LiveKit's responsibility.** Simulcast, SVC, transcoding,
   dynamic bandwidth adaptation, and other media-layer features are handled by
   LiveKit and its configuration.

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
```

Roughly 200 tests. The ones worth knowing about:

| Area | Where |
|---|---|
| Permission resolution, room overrides, escalation guard | `crates/domain`, `crates/community` |
| LiveKit token: forged, expired, wrong room, wrong issuer, tampered | `crates/room`, `apps/api/src/routes/media.rs` |
| Register → community → voice room → LiveKit token, end to end | `apps/api/tests/api.rs` |
| Outsiders get no room access and no LiveKit token | `apps/api/tests/api.rs` |

## License

MIT OR Apache-2.0
