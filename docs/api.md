# API reference

Base URL `/api/v1`. All bodies are JSON. All authenticated endpoints take
`Authorization: Bearer <access_token>`.

Route patterns below use Axum 0.8's `{id}` syntax; the URLs clients call are
ordinary paths (`/api/v1/rooms/6f1c…/media/join`).

## Errors

Every failure — validation, authorization, not-found, internal — has one shape:

```json
{
  "error": {
    "code": "ROOM_ACCESS_DENIED",
    "message": "You do not have permission to join this room"
  }
}
```

`code` is stable and safe to branch on. `message` is for humans and never
contains internal detail; a database failure becomes `INTERNAL_ERROR` with a
generic message and the real cause goes to the logs under the request id.

| Code                                                    | Status | Meaning                                                                  |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `VALIDATION_FAILED`                                     | 400    | A field broke a domain rule.                                             |
| `BAD_REQUEST`                                           | 400    | Malformed JSON or a missing field.                                       |
| `UNSUPPORTED_ROOM_TYPE`                                 | 400    | Media join on a text room.                                               |
| `UNKNOWN_PERMISSION`                                    | 400    | A permission key this build does not have.                               |
| `UNAUTHENTICATED`                                       | 401    | Missing or malformed bearer token.                                       |
| `INVALID_CREDENTIALS`                                   | 401    | Wrong identifier **or** wrong password — deliberately indistinguishable. |
| `INVALID_TOKEN` / `INVALID_SESSION`                     | 401    | Expired or revoked.                                                      |
| `NOT_A_MEMBER`                                          | 403    | Not in the community that owns the resource.                             |
| `ROOM_ACCESS_DENIED`                                    | 403    | Cannot see the room.                                                     |
| `SPEAK_DENIED` / `VIDEO_DENIED` / `SCREEN_SHARE_DENIED` | 403    | Media capability refused.                                                |
| `PERMISSION_DENIED_<PERMISSION>`                        | 403    | Any other capability refused.                                            |
| `NOT_FOUND`                                             | 404    | No such entity, or not visible to you.                                   |
| `CONFLICT` / `ALREADY_REGISTERED`                       | 409    | Uniqueness violated.                                                     |
| `RATE_LIMITED`                                          | 429    | Slow down — carries `Retry-After`. Either the per-address budget or the per-account anti-spam guard. |
| `INTERNAL_ERROR`                                        | 500    | Our fault.                                                               |

Every response carries `x-request-id`, echoed from the request when present.
Quote it in a bug report and the whole request is one log query away.

### Being told to slow down

Two different rules answer with `RATE_LIMITED`, and both set `Retry-After` in
seconds:

* the **per-address budget**, which every endpoint draws from
  (`RATE_LIMIT_PER_MINUTE`, and a tighter one on `/auth/*`);
* the **per-account anti-spam guard** on posting and reacting — a burst limit
  and a repeat limit, per room. Its message says which one fired, and it applies
  to messages sent over the WebSocket too, where the address budget does not
  reach.

A message can also be refused outright with `VALIDATION_FAILED` for naming too
many people or carrying too many links; those caps are content rules, not
timing, so waiting does not help.

---

## Auth

### `POST /auth/register`

```json
{
  "handle": "ada",
  "email": "ada@example.com",
  "password": "at-least-ten-chars",
  "display_name": "Ada"
}
```

Handles are lower-cased and must be 3–32 characters of `a-z0-9._`. Passwords
must be at least 10 characters — length is the only rule, because composition
rules push users toward predictable passwords and the hash is Argon2id either
way.

**200** returns the account and a token pair:

```json
{
  "user": {
    "id": "…",
    "handle": "ada",
    "email": "ada@example.com",
    "profile": { "display_name": "Ada", "avatar_effect": null, "…": "…" }
  },
  "access_token": "eyJ…",
  "refresh_token": "8f3c…",
  "expires_in": 900,
  "token_type": "Bearer"
}
```

### `POST /auth/login`

```json
{ "identifier": "ada", "password": "…" }
```

`identifier` is a handle _or_ an e-mail. A wrong password and an unknown account
return byte-identical responses, and the unknown-account path spends the same
Argon2 work, so response timing is not an account-enumeration oracle.

### `POST /auth/refresh`

```json
{ "refresh_token": "8f3c…" }
```

Rotates: the old session is revoked and a new pair issued, so a stolen refresh
token is usable at most once. Presenting an already-revoked token is treated as
evidence of theft and **revokes every session for that account**.

### `POST /auth/logout`

```json
{ "refresh_token": "8f3c…" }
```

**204** always, whether or not the token was known — reporting "no such session"
would let an attacker probe for live tokens.

### `GET /auth`… `GET /me`, `PATCH /me`

`PATCH /me` accepts any subset of `display_name`, `bio`, `avatar_url`,
`avatar_effect`, `accent_color`. Omitted fields are left alone.

---

## Communities

| Method   | Path                | Requires                                                    |
| -------- | ------------------- | ----------------------------------------------------------- |
| `POST`   | `/communities`      | authentication                                              |
| `GET`    | `/communities/{id}` | membership                                                  |
| `PATCH`  | `/communities/{id}` | `manage_community`                                          |
| `DELETE` | `/communities/{id}` | **owner** — `manage_community` renames, it does not destroy |

`GET` returns the community plus `your_permissions`, the caller's resolved
permission list. Clients use it to hide controls the server would refuse anyway.

Creating a community also creates its `@everyone` role (granting `view_room`,
`send_message`, `add_reaction`, `speak`, `use_video`) and the owner's
membership, in one transaction.

`GET /communities` is the first call a client makes after signing in. It returns
the whole list rather than paginating: a user belongs to tens of communities,
not thousands.

## Users

### `GET /users/{id}`

The public half of an account, for resolving message authors and room
participants:

```json
{
  "id": "…", "handle": "ada", "display_name": "Ada",
  "avatar_url": null, "avatar_effect": null, "accent_color": null
}
```

Authentication is required — profile lookup is not an anonymous enumeration
endpoint — but no relationship is: anyone signed in can resolve a handle they
have already been shown. Deliberately **no e-mail and no account state**, which
is what makes it safe to hand to anyone sharing a room with the user.

## Members

| Method   | Path                                        | Requires                                        |
| -------- | ------------------------------------------- | ----------------------------------------------- |
| `GET`    | `/communities/{id}/members`                 | membership                                      |
| `POST`   | `/communities/{id}/members`                 | self-join, or `manage_members` for someone else |
| `DELETE` | `/communities/{id}/members/{user_id}`       | self-leave, or `manage_members`                 |
| `POST`   | `/communities/{id}/members/{user_id}/roles` | `manage_roles`                                  |

`POST /members` with `{}` adds the caller — that is what an invite link amounts
to. Adding anybody else needs `manage_members`. The owner can never be removed.

## Roles

| Method  | Path                                | Requires       |
| ------- | ----------------------------------- | -------------- |
| `GET`   | `/communities/{id}/roles`           | membership     |
| `POST`  | `/communities/{id}/roles`           | `manage_roles` |
| `PATCH` | `/communities/{id}/roles/{role_id}` | `manage_roles` |

```json
{
  "name": "presenter",
  "color": "#7c5cff",
  "permissions": ["view_room", "speak", "use_video", "screen_share"]
}
```

`PATCH` with `permissions` **replaces** the whole set — the only interpretation
that lets a permission be removed.

**Escalation guard:** a role cannot grant a permission the actor does not
themselves hold, and neither can assigning one. Without this, `manage_roles`
would silently imply `administrator`. Administrators are exempt because they
already hold everything there is to grant.

## Rooms

| Method   | Path                      | Requires                                   |
| -------- | ------------------------- | ------------------------------------------ |
| `GET`    | `/communities/{id}/rooms` | membership — filtered to rooms you can see |
| `POST`   | `/communities/{id}/rooms` | `manage_room`                              |
| `GET`    | `/rooms/{id}`             | `view_room`                                |
| `PATCH`  | `/rooms/{id}`             | `manage_room`                              |
| `DELETE` | `/rooms/{id}`             | `manage_room`                              |

```json
{ "name": "lounge", "room_type": "voice", "topic": "…", "max_participants": 20 }
```

`room_type` is one of `text`, `voice`, `video`, `activity`, and is **not**
updatable: turning a text room into a voice room mid-flight would strand
clients and invalidate every media token already issued for it.

`GET /rooms/{id}` returns the room plus `your_permissions`, resolved for that
specific room with its overrides applied.

## Media

### `POST /rooms/{id}/media/join`

The authorization chain, in order: authenticated → room exists → member of its
community → `view_room` → is a media room → fold `speak`/`use_video`/
`screen_share` into media permissions → pick the media server → sign.

```json
{
  "room_id": "6f1c…",
  "participant_id": "aaf7…",
  "media_url": "ws://127.0.0.1:8081/ws/media",
  "token": "eyJhbGciOiJIUzI1NiJ9…",
  "expires_at": "2026-08-19T16:02:21Z",
  "ice_servers": [{ "urls": ["stun:stun.l.google.com:19302"] }]
}
```

The token is valid for ~2 minutes and for **that room only**. `participant_id`
is assigned by the server; a client never chooses who it is.

### `POST /rooms/{id}/media/leave`

**204.** Advisory — the media server treats a closed WebSocket as the
authoritative departure signal, which is what makes a crashed client behave
correctly.

## Messages

| Method   | Path                       | Requires                 |
| -------- | -------------------------- | ------------------------ |
| `GET`    | `/rooms/{id}/messages`     | `view_room`              |
| `POST`   | `/rooms/{id}/messages`     | `send_message`           |
| `PATCH`  | `/messages/{id}`           | author only              |
| `DELETE` | `/messages/{id}`           | author, or `manage_room` |
| `PUT`    | `/messages/{id}/reactions` | `add_reaction`           |
| `DELETE` | `/messages/{id}/reactions` | `view_room`              |

History is keyset-paginated, newest first:

```
GET /rooms/{id}/messages?limit=50&before=2026-08-19T16:00:00Z
→ { "messages": [ … ], "next_before": "2026-08-19T15:58:12Z" }
```

Keyset rather than `OFFSET`, because offsets get slower as a room gets busier
and skip or repeat rows when new messages arrive mid-scroll — which is exactly
what happens in a live chat.

Every message carries its reaction tallies inline, and `me` says whether the
**calling** user is in each one:

```json
{
  "id": "6f1c…",
  "room_id": "9a3d…",
  "author_id": "c02e…",
  "content": "already in — try hovering this one",
  "edited_at": null,
  "created_at": "2026-08-19T16:02:44Z",
  "reactions": [
    { "reaction": "🎉", "count": 3, "me": true },
    { "reaction": "👀", "count": 1, "me": false }
  ]
}
```

Inline rather than a second endpoint: a client that renders reactions needs them
for every message it just fetched, so a separate call would be an N+1 by
construction. One `GROUP BY` covers the whole page, and `POST` returns the same
shape with an empty `reactions` so clients have one message type rather than
two.

`PUT` and `DELETE /messages/{id}/reactions` both take `{ "reaction": "🎉" }` and
return that message's complete new tally — not a delta — so a client never has
to reconstruct a count it can simply be told. Reacting twice is idempotent.

Moderators can delete a message but not edit one: putting words in someone's
mouth is a different power from removing them.

## Friends and blocks

| Method           | Path                                                |
| ---------------- | --------------------------------------------------- |
| `GET`            | `/friends`                                          |
| `GET`            | `/friends/requests`                                 |
| `POST`           | `/friends` — `{ "user_id": "…" }`                   |
| `POST`           | `/friends/{user_id}/respond` — `{ "accept": true }` |
| `DELETE`         | `/friends/{user_id}`                                |
| `PUT` / `DELETE` | `/blocks/{user_id}`                                 |

Requesting somebody who already requested you accepts, rather than creating a
second row. A block is refused with the same error as any other rejection, so a
block is not observable from the outside, and blocking ends any friendship.

## Composite views

Four endpoints answer a whole *screen* instead of a single table. The server
composes them from the same services the granular endpoints use — this is the
backend-for-frontend layer — so a client renders a screen from one response
instead of walking a waterfall of six.

| Method | Path                            | Returns                                                                         |
| ------ | ------------------------------- | ------------------------------------------------------------------------------- |
| `GET`  | `/me/overview`                  | account, communities, rooms and DMs, friends, online friends, pending request count, unread notifications, auth config |
| `GET`  | `/me/social`                    | friends, online friends, incoming and outgoing requests, blocklist               |
| `GET`  | `/communities/{id}/overview`    | community with `your_permissions`, its rooms, its members with roles, its roles  |
| `POST` | `/rooms/{id}/session`           | room with `your_permissions` and persona, participants, the last 50 messages, and a media token for a voice/video/stage room |

Every one of these enforces exactly the same authorization as the granular
endpoint it stands in for; composing changes the number of requests, never who
may see what.

`/rooms/{id}/session` is a `POST` because it is not a safe read: opening a media
room mints an SFU credential, the same one `POST /rooms/{id}/media/join` issues.
Use `GET /rooms/{id}` when you only want to look at a room.

There is no composite discovery endpoint — `GET /rooms/discovery` is already
one, and it takes `category` and `limit` besides.

Nothing forces a client to use these. The granular endpoints remain the
contract; the composite ones are an optimization a client opts into.

## Health

`GET /health` — liveness. Touches nothing, so a slow database cannot get the
container killed and restarted into the same slow database.

`GET /ready` — readiness. **503** when the database is unreachable or no media
server is configured.

```json
{ "status": "ready", "database": true, "media_servers": true }
```

The media server exposes the same two, plus live counters:

```json
{ "status": "ready", "rooms": 3, "participants": 11, "relay_available": false }
```
