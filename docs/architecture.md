# Architecture

genzh is **two products sharing one backend**: a throwaway-room playground you
swipe through, and a Discord-style community platform you belong to. Almost
every design decision below is downstream of that sentence, so it is the first
section rather than a feature listed near the end.

- [1. The two halves](#1-the-two-halves)
- [2. The three planes](#2-the-three-planes)
- [3. Inside the control plane](#3-inside-the-control-plane)
- [4. Inside the clients](#4-inside-the-clients)
- [5. How data moves](#5-how-data-moves)
- [6. State that is not PostgreSQL](#6-state-that-is-not-postgresql)
- [7. Background work](#7-background-work)
- [8. Rules this codebase holds itself to](#8-rules-this-codebase-holds-itself-to)
- [9. Known gaps](#9-known-gaps)

Companion documents: [`rooms.md`](rooms.md) for the room model in full,
[`clients.md`](clients.md) for the web and mobile apps, [`api.md`](api.md) for
the endpoint reference, and [`media-protocol.md`](media-protocol.md) plus
[`sfu.md`](sfu.md) for the media plane.

---

## 1. The two halves

|                | **Playground**                            | **Servers**                                  |
| -------------- | ----------------------------------------- | -------------------------------------------- |
| Promise        | rooms you leave                           | places you stay                              |
| Unit           | a *moment* — one room, minutes to hours   | a community with channels                    |
| Who is in it   | strangers                                 | people you joined to be with                 |
| Lifetime       | always ends: a TTL, or the last exit      | until somebody deletes it                    |
| Discovery      | a feed of what is live right now          | invites, and an explore directory            |
| Identity       | often anonymous, per room                 | your profile, with roles                     |
| Chrome         | full-bleed, no navigation                 | rail → sidebar → channel                     |

The technical expression of the split is one predicate, in
`crates/domain/src/room.rs`:

```rust
pub fn is_playground(&self) -> bool {
    self.community_id.is_none() && !self.is_direct()
}
```

Three kinds of room exist, and this separates them:

| Kind                     | `community_id` | `category` | Expires | In the feed |
| ------------------------ | -------------- | ---------- | ------- | ----------- |
| Community channel        | set            | anything   | no      | no          |
| Direct conversation      | `NULL`         | `'dm'`     | no      | no          |
| **Playground room**      | `NULL`         | anything else | **always** | **yes** |

A DM is the case that catches people out. It is standalone like a moment, and it
must behave like a channel: never reaped for sitting empty, never shown to a
stranger. It is excluded by `category`, everywhere, by the same predicate.

**Where the mode lives differs by client, deliberately.**

- **Mobile** stores it (`AppModeContext`, AsyncStorage) because a tab bar has no
  address. Two separate bottom-tab navigators, so each half keeps its own
  history and switching is a door rather than a filter.
- **Web** derives it from the route (`lib/appMode.ts`) because the URL already
  says which half you are in. A stored mode would let a shared link open the
  wrong shell.

---

## 2. The three planes

```
                      ┌──────────────────────────────┐
   apps/web           │        apps/api              │
   apps/mobile ──────▶│      control plane           │──────▶ PostgreSQL
        │             │  who you are, what you may do│
        │             └──────────────┬───────────────┘
        │                            │ signs a 2-minute token
        │                            ▼
        │             ┌──────────────────────────────┐
        └────────────▶│        apps/media            │──────▶ UDP / RTP
           wss        │        media plane           │
                      │  peer connections, packets   │
                      └──────────────────────────────┘
```

### Why the control and media planes are separate binaries

|                 | control plane (`apps/api`)                    | media plane (`apps/media`)      |
| --------------- | --------------------------------------------- | ------------------------------- |
| Owns            | accounts, communities, roles, rooms, messages  | peer connections, tracks, RTP   |
| Talks to        | PostgreSQL                                    | UDP sockets                     |
| Scales with     | requests per second                           | concurrent streams, bandwidth   |
| Failure mode    | a request 500s                                | a call drops                    |
| Restart cost    | in-flight requests                            | **every live call**             |

One process would mean a schema migration can interrupt a conversation, and a
busy voice room can slow down a login. Apart, the API redeploys at any time
while calls continue.

### How they meet: one signed token

The media server holds **no database credentials**. It cannot look up a user, a
room or a permission. Everything it is allowed to believe arrives in a
short-lived HS256 token the API mints after doing the real authorization:

```
client ──POST /rooms/{id}/media/join──▶ API ──▶ PostgreSQL
                                         │      member? view_room? speak?
                                         │      is this even a media room?
                                         │
                                         │ mints a ~2 minute token, that room only
                                         ▼
client ──wss://media/ws/media {token}──▶ media ── verify HMAC locally ──▶ admit
```

Admitting a participant costs one HMAC verification and no query. Forwarding a
packet costs nothing at all — it never touches the control plane, and neither
PostgreSQL nor the API ever sees an audio or video byte.

---

## 3. Inside the control plane

### Layers

```
apps/api/src/routes/     thin handlers: parse, call one service, serialise
        │
        ▼
crates/<context>/service.rs      rules, authorization, orchestration
        │
        ▼
crates/<context>/repository.rs   SQL, and nothing else
        │
        ▼
crates/domain/                   ids, entities, enums, validation — pure
```

`crates/domain` depends on **no other crate in this workspace**, and contains no
queries, no HTTP and not a single `async fn`. Everything else may depend on it;
it may depend on nothing. That is what makes `Room::is_playground()` a fact
about rooms rather than a convention two SQL queries happen to share.

It does pull in `sqlx` — but only for the `#[derive(sqlx::Type)]` on the enums,
so that `room_type` maps to the Postgres enum in one place instead of being
re-spelled by every repository. Derives, never queries.

### The crates

| Crate                   | Package name             | Owns                                                     |
| ----------------------- | ------------------------ | -------------------------------------------------------- |
| `crates/domain`         | `genzh-domain`           | ids, entities, `RoomType`, `Permission`, validation      |
| `crates/infrastructure` | `genzh-infrastructure`   | pool, migrations, error translation, the volatile ports  |
| `crates/auth`           | `genzh-auth`             | Argon2id, JWT, sessions, OAuth, profiles                 |
| `crates/community`      | `genzh-community`        | communities, roles, invites, the permission resolver     |
| `crates/social`         | `genzh-graph`            | friendships, blocks                                      |
| `crates/room`           | `genzh-room`             | rooms, room authorization, discovery, media issuing      |
| `crates/messaging`      | `genzh-messaging`        | messages, reactions, pins, search                        |
| `crates/notification`   | `genzh-notification`     | the inbox, and what is worth waking somebody for         |
| `crates/recommend`      | `genzh-recommend`        | ranked suggestions — rooms, communities, people          |
| `crates/admin`          | `genzh-admin`            | platform staff, support queue, audit log, moderation     |
| `crates/cron`           | `genzh-cron`             | the job trait and the scheduler                          |
| `crates/media-core`     | `genzh-media-core`       | the two-plane contract — token, codecs, ICE, permissions |
| `crates/media-signaling`| `genzh-media-signaling`  | the wire protocol and its limits                         |
| `crates/media-room`     | `genzh-media-room`       | rooms, participants, tracks, the SFU itself              |

Note the package name for `crates/social` is `genzh-graph`, not `genzh-social`.

### Inside `crates/room`

The one crate the two-mode split touches most:

| Module              | Answers                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `service.rs`        | create, update, join, leave, personas — and the playground TTL   |
| `authorization.rs`  | may this caller see or act in this room                          |
| `directory.rs`      | *what is going on right now* — discovery, trending, the feed     |
| `directs.rs`        | opening and resolving direct conversations                       |
| `media.rs`          | minting media tokens, choosing a media server                    |
| `read_state.rs`     | unread counts and mutes                                          |
| `repository.rs`     | all of the SQL                                                   |

`RoomDirectory` is deliberately outside `RoomService`: discovery answers a
question for somebody with no standing anywhere, so none of it consults
permissions and none of it can change anything. Keeping it apart makes that
obvious rather than something you have to check.

### Middleware

`apps/api/src/middleware/` — request id, `CurrentUser` extraction, rate
limiting. Errors become the one response shape in `error.rs`; `ApiJson` in
`extract.rs` makes deserialisation rejections use that shape too, so a client
never has to parse two different error formats.

---

## 4. Inside the clients

Summarised here; the full treatment is [`clients.md`](clients.md).

```
packages/shared/          @genzh/shared — one copy of everything both clients need
  api/          types.ts (mirrors the Rust DTOs), endpoints.ts, client.ts
  queries/      React Query hooks + the query-key factory
  viewmodels/   composed hooks (mobile uses these; web has its own layer)
  ws/           ChatSocket
  media/        the browser/native half of the SFU protocol
  chat/         mentions, emoji, limits, notification rules
  palette.ts  permissions.ts  time.ts

apps/web/                 React + Base UI + CSS Modules
  features/<domain>/api   React Query hooks — no hook takes a token
  routes/                 screens and the shell
  lib/                    auth, media, appMode, roomTypes, store

apps/mobile/              Expo + React Navigation
  screens/                one folder per destination
  navigation/             two tab navigators, one per mode
  context/                Auth, AppMode, Chat, Voice
  features/               experiences, profile
  theme/                  the design tokens, mirrored from the web's CSS
```

### Two query layers, on purpose

`@genzh/shared` exports React Query hooks that take `token: string | null`
explicitly. Mobile uses them, plus the `viewmodels/` layer composed on top.

The web app does **not**. It has its own hooks under `features/<domain>/api`,
and none of them take a token — the API client resolves it through a provider,
so a session is ambient rather than threaded through every call site. The web
socket bridge writes directly into that cache.

The trade is one duplicated hook shape for two idioms that each fit their app.
Both ultimately call the same `endpoints.ts`.

> **Trap:** `@genzh/shared` is aliased to source, not built. Any library holding
> React context (React Query, React itself) must be deduped in the bundler
> config or two copies load and the providers silently do not match.

### Design tokens

The web keeps them in `apps/web/src/styles/tokens.css`; mobile mirrors them as
plain objects in `apps/mobile/src/theme/tokens.ts`, because React Native has no
cascade and no `oklch`. The mobile file derives its `Palette` type from the dark
object so a token added to one palette and forgotten in the other is a type
error rather than a colour that silently falls back.

---

## 5. How data moves

### Reading a screen: BFF composites

Four endpoints answer a *screen* rather than a *table*, so a client never walks
a request waterfall:

| Endpoint                       | Answers                                                   |
| ------------------------------ | --------------------------------------------------------- |
| `GET /me/overview`             | the whole app shell: account, communities, rooms, friends, unread |
| `GET /communities/{id}/overview` | a community: metadata, channels, members, roles          |
| `POST /rooms/{id}/session`     | an opened room: room, participants, history, media token  |
| `GET /me/social`               | the friend graph: friends, requests both ways, blocks     |
| `GET /rooms/feed`              | one page of the playground feed, with hosts and faces     |

Composition is an implementation detail: nothing in the URL says "bff". Each
view hangs off the resource it describes and is versioned like any other
endpoint. They live in `apps/api/src/routes/bff.rs`.

`GET /rooms/feed` is the newest and the shape to copy: three queries regardless
of page size — the rooms, their participants, then every profile behind both
sets of ids in one batch lookup.

### Writing

Every write goes through a mutation, which invalidates the query it affects.
Nothing holds a private copy of a response that cannot be invalidated — that is
the rule the query layers exist to enforce.

### Realtime

One WebSocket per client at `GET /ws` (`apps/api/src/routes/ws/`).

Server → client: `Authenticated`, `Subscribed`/`Unsubscribed`,
`MessageCreated`/`Updated`/`Deleted`, `ReactionsUpdated`, `NotificationCreated`,
`PresenceChanged`, `Typing`, `CallRinging`/`CallEnded`, `DirectRoomOpened`,
`ConsoleChanged`, `Error`.
Client → server: `Auth`, `Subscribe`/`Unsubscribe`, `Typing`, `SendMessage`,
`React`/`Unreact`, `Focus`.

The client bridge writes arriving events straight into the React Query cache, so
a screen redraws because its data changed rather than because something
remembered to call back into it. Note that `SendMessage` over this socket
bypasses the per-address rate limit, which is why the per-account flood guard
exists separately.

The media plane's WebSocket is entirely separate, speaks its own protocol
([`media-protocol.md`](media-protocol.md)), and shares no connection with this one.

---

## 6. State that is not PostgreSQL

Presence, rate-limit counters, the anti-spam guard, per-connection attention and
real-time fan-out are **volatile**: they describe this instant rather than the
record, and losing them on restart is acceptable where losing a message is not.

Each is a trait in `crates/infrastructure` with an in-memory implementation:

| Port             | Today                     | When one process is not enough      |
| ---------------- | ------------------------- | ----------------------------------- |
| `PresenceStore`  | `InMemoryPresenceStore`   | Redis hash of per-instance counters |
| `AttentionStore` | `InMemoryAttentionStore`  | Redis entry per connection, with TTL |
| `RateLimiter`    | `InMemoryRateLimiter`     | Redis counter, or a gateway         |
| `FloodGuard`     | `InMemoryFloodGuard`      | Redis counter keyed per account     |
| `EventBus`       | `InMemoryEventBus`        | Redis pub/sub, NATS, Postgres `LISTEN` |

**Every one of these is correct for a single instance and wrong for several.** A
second replica would know only its own sockets, count only its own requests, and
fan out only to its own clients. Nothing in `apps/api` names a concrete
implementation — handlers depend on the trait and one line in `AppState::build`
picks what implements it, so scaling out is a new implementation rather than a
rewrite of the call sites.

---

## 7. Background work

Jobs live in `apps/api/src/jobs/`, one file each, registered in `mod.rs`.

| Job                            | Every  | Does                                              |
| ------------------------------ | ------ | ------------------------------------------------- |
| `auth.prune_expired_sessions`  | 1h     | deletes expired refresh sessions                  |
| `stores.sweep_volatile`        | 5m     | sweeps the in-memory rate-limit and flood maps    |
| `rooms.expire_ephemeral`       | 30s    | ends rooms whose `expires_at` has passed          |
| `rooms.reap_empty_playground`  | 60s    | ends playground rooms empty past the grace period |
| `invites.prune_expired`        | 1h     | deletes expired community invites                 |
| `notifications.prune_old`      | 24h    | trims the inbox by retention                      |
| `security.prune_expired_bans`  | 5m     | lifts expired IP bans                             |
| `support.auto_close_stale`     | 6h     | closes stale resolved tickets                     |

`EXPECTED_JOBS` in `jobs/mod.rs` is the full list, and `register` compares
itself against it. **Startup fails** if the registered set drifts. That is
deliberate: a job that is written, imported and never registered compiles
perfectly quietly, and the only symptom is maintenance that silently never
happens.

> `rooms.prune_stale_participants` exists in `crates/room` and is **deliberately
> never registered**. `rooms.reap_empty_playground` was written not to disturb
> that: it only flips `rooms.status`, and never deletes a `room_participants`
> row. See [`rooms.md`](rooms.md#4-lifecycle).

---

## 8. Rules this codebase holds itself to

**Discovery scoping is a filter, never a ranking.** A room a stranger should not
see is absent from the query rather than scored low. A weight can be retuned to
zero by accident; a `WHERE` clause cannot. Every discovery surface — feed,
discovery, trending, live, random, recommendations — carries the same
`community_id IS NULL AND category <> 'dm'` scope.

**Every query is runtime-checked** (`query_as`, not `query_as!`). SQLx's macros
verify SQL at compile time, which is a nice property and the wrong trade here:
it makes `cargo check` depend on a running PostgreSQL, or on a checked-in
`.sqlx` cache that silently rots. A fresh clone builds with nothing installed.

**One error shape, everywhere.** `{ "error": { "code", "message" } }`. `code` is
stable and safe to branch on; `message` never carries internal detail.

**UUID primary keys, generated by the application. `TIMESTAMPTZ` everywhere.**
There is no naive timestamp in the system.

**Migrations are embedded at compile time** by `sqlx::migrate!()`, so the image
carries its own schema — and editing a `.sql` without rebuilding changes
nothing. They must be idempotent; see the traps in
[`rooms.md`](rooms.md#7-migrations-and-the-enum-trap).

---

## 9. Known gaps

- **`rooms.family` is written and never read.** Migration 0017 added the column
  and backfills it, and there is an index on it, but no query selects it —
  `RoomFamily` is derived in Rust from `room_type`. Either the column should be
  driving the pillar queries or it should be dropped; today it is neither.
- **Single-instance only.** Every volatile port above is in-memory. Running two
  API replicas silently breaks presence, fan-out and rate limiting.
- **The mobile playground feed has not been run on a device.** It typechecks and
  the logic is shared with the verified web implementation, but the swipe
  snapping and safe-area insets are unproven on real hardware.
- **iOS screen share is not possible** without a broadcast extension; it works
  on Android.
- **Expo Go cannot carry voice** — there is no WebRTC in it, so calls join and
  carry no audio. A dev build is mandatory.
