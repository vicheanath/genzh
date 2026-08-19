# API reference

Base URL `/api/v1`. All bodies are JSON. All authenticated endpoints take
`Authorization: Bearer <access_token>`.

Route patterns below use Axum 0.8's `{id}` syntax; the URLs clients call are
ordinary paths (`/api/v1/rooms/6f1c…/media/join`).

## Errors

Every failure — validation, authorization, not-found, internal — has one shape:

```json
{ "error": { "code": "ROOM_ACCESS_DENIED", "message": "You do not have permission to join this room" } }
```

`code` is stable and safe to branch on. `message` is for humans and never
contains internal detail; a database failure becomes `INTERNAL_ERROR` with a
generic message and the real cause goes to the logs under the request id.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | A field broke a domain rule. |
| `BAD_REQUEST` | 400 | Malformed JSON or a missing field. |
| `UNSUPPORTED_ROOM_TYPE` | 400 | Media join on a text room. |
| `UNKNOWN_PERMISSION` | 400 | A permission key this build does not have. |
| `UNAUTHENTICATED` | 401 | Missing or malformed bearer token. |
| `INVALID_CREDENTIALS` | 401 | Wrong identifier **or** wrong password — deliberately indistinguishable. |
| `INVALID_TOKEN` / `INVALID_SESSION` | 401 | Expired or revoked. |
| `NOT_A_MEMBER` | 403 | Not in the community that owns the resource. |
| `ROOM_ACCESS_DENIED` | 403 | Cannot see the room. |
| `SPEAK_DENIED` / `VIDEO_DENIED` / `SCREEN_SHARE_DENIED` | 403 | Media capability refused. |
| `PERMISSION_DENIED_<PERMISSION>` | 403 | Any other capability refused. |
| `NOT_FOUND` | 404 | No such entity, or not visible to you. |
| `CONFLICT` / `ALREADY_REGISTERED` | 409 | Uniqueness violated. |
| `RATE_LIMITED` | 429 | Slow down. |
| `INTERNAL_ERROR` | 500 | Our fault. |

Every response carries `x-request-id`, echoed from the request when present.
Quote it in a bug report and the whole request is one log query away.

---

## Auth

### `POST /auth/register`

```json
{ "handle": "ada", "email": "ada@example.com",
  "password": "at-least-ten-chars", "display_name": "Ada" }
```

Handles are lower-cased and must be 3–32 characters of `a-z0-9._`. Passwords
must be at least 10 characters — length is the only rule, because composition
rules push users toward predictable passwords and the hash is Argon2id either
way.

**200** returns the account and a token pair:

```json
{
  "user": { "id": "…", "handle": "ada", "email": "ada@example.com",
            "profile": { "display_name": "Ada", "avatar_effect": null, "…": "…" } },
  "access_token": "eyJ…", "refresh_token": "8f3c…",
  "expires_in": 900, "token_type": "Bearer"
}
```

### `POST /auth/login`

```json
{ "identifier": "ada", "password": "…" }
```

`identifier` is a handle *or* an e-mail. A wrong password and an unknown account
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

| Method | Path | Requires |
|---|---|---|
| `POST` | `/communities` | authentication |
| `GET` | `/communities/{id}` | membership |
| `PATCH` | `/communities/{id}` | `manage_community` |
| `DELETE` | `/communities/{id}` | **owner** — `manage_community` renames, it does not destroy |

`GET` returns the community plus `your_permissions`, the caller's resolved
permission list. Clients use it to hide controls the server would refuse anyway.

Creating a community also creates its `@everyone` role (granting `view_room`,
`send_message`, `add_reaction`, `speak`, `use_video`) and the owner's
membership, in one transaction.

## Members

| Method | Path | Requires |
|---|---|---|
| `GET` | `/communities/{id}/members` | membership |
| `POST` | `/communities/{id}/members` | self-join, or `manage_members` for someone else |
| `DELETE` | `/communities/{id}/members/{user_id}` | self-leave, or `manage_members` |
| `POST` | `/communities/{id}/members/{user_id}/roles` | `manage_roles` |

`POST /members` with `{}` adds the caller — that is what an invite link amounts
to. Adding anybody else needs `manage_members`. The owner can never be removed.

## Roles

| Method | Path | Requires |
|---|---|---|
| `GET` | `/communities/{id}/roles` | membership |
| `POST` | `/communities/{id}/roles` | `manage_roles` |
| `PATCH` | `/communities/{id}/roles/{role_id}` | `manage_roles` |

```json
{ "name": "presenter", "color": "#7c5cff",
  "permissions": ["view_room", "speak", "use_video", "screen_share"] }
```

`PATCH` with `permissions` **replaces** the whole set — the only interpretation
that lets a permission be removed.

**Escalation guard:** a role cannot grant a permission the actor does not
themselves hold, and neither can assigning one. Without this, `manage_roles`
would silently imply `administrator`. Administrators are exempt because they
already hold everything there is to grant.

## Rooms

| Method | Path | Requires |
|---|---|---|
| `GET` | `/communities/{id}/rooms` | membership — filtered to rooms you can see |
| `POST` | `/communities/{id}/rooms` | `manage_room` |
| `GET` | `/rooms/{id}` | `view_room` |
| `PATCH` | `/rooms/{id}` | `manage_room` |
| `DELETE` | `/rooms/{id}` | `manage_room` |

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
  "ice_servers": [ { "urls": ["stun:stun.l.google.com:19302"] } ]
}
```

The token is valid for ~2 minutes and for **that room only**. `participant_id`
is assigned by the server; a client never chooses who it is.

### `POST /rooms/{id}/media/leave`

**204.** Advisory — the media server treats a closed WebSocket as the
authoritative departure signal, which is what makes a crashed client behave
correctly.

## Messages

| Method | Path | Requires |
|---|---|---|
| `GET` | `/rooms/{id}/messages` | `view_room` |
| `POST` | `/rooms/{id}/messages` | `send_message` |
| `PATCH` | `/messages/{id}` | author only |
| `DELETE` | `/messages/{id}` | author, or `manage_room` |
| `PUT` | `/messages/{id}/reactions` | `add_reaction` |
| `DELETE` | `/messages/{id}/reactions` | `view_room` |

History is keyset-paginated, newest first:

```
GET /rooms/{id}/messages?limit=50&before=2026-08-19T16:00:00Z
→ { "messages": [ … ], "next_before": "2026-08-19T15:58:12Z" }
```

Keyset rather than `OFFSET`, because offsets get slower as a room gets busier
and skip or repeat rows when new messages arrive mid-scroll — which is exactly
what happens in a live chat.

Moderators can delete a message but not edit one: putting words in someone's
mouth is a different power from removing them.

## Friends and blocks

| Method | Path |
|---|---|
| `GET` | `/friends` |
| `GET` | `/friends/requests` |
| `POST` | `/friends` — `{ "user_id": "…" }` |
| `POST` | `/friends/{user_id}/respond` — `{ "accept": true }` |
| `DELETE` | `/friends/{user_id}` |
| `PUT` / `DELETE` | `/blocks/{user_id}` |

Requesting somebody who already requested you accepts, rather than creating a
second row. A block is refused with the same error as any other rejection, so a
block is not observable from the outside, and blocking ends any friendship.

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
