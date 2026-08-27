# Clients

Two applications, one shared package, and one product that is really two
products. This document is about how the split is expressed in the UI, how the
two apps get their data, and the traps that have already caught somebody.

- [1. The shape of the split](#1-the-shape-of-the-split)
- [2. `@genzh/shared`](#2-genzhshared)
- [3. Two query layers, on purpose](#3-two-query-layers-on-purpose)
- [4. The mobile app](#4-the-mobile-app)
- [5. The web app](#5-the-web-app)
- [6. The design system](#6-the-design-system)
- [7. Realtime](#7-realtime)
- [8. Traps](#8-traps)

---

## 1. The shape of the split

The two halves — see [`architecture.md`](architecture.md#1-the-two-halves) —
need different chrome, not just different content:

|            | Playground                             | Servers                                    |
| ---------- | -------------------------------------- | ------------------------------------------ |
| Layout     | full-bleed, one room per screen        | rail → sidebar → channel                    |
| Navigation | floats over the content                | persistent, always visible                  |
| Entry      | the feed                               | the community list                          |
| Crossing   | one control: **ModeSwitch**            | the same control, pointing the other way    |

**ModeSwitch names where you would *go*, not where you are.** A segmented
control showing both was the first shape it took, and it read as a filter over
one list rather than as a door out of one product into another. There is exactly
one of these on each side, and neither half carries a nav item pointing at the
other.

### Where the mode is stored — and why the two apps differ

| | Mobile | Web |
| --- | --- | --- |
| Source of truth | `AppModeContext` + AsyncStorage | the route (`lib/appMode.ts`) |
| Why | a tab bar has no address, and the choice must survive a relaunch | the URL already says which half you are in; a stored mode would make a shared link open the wrong shell |

On web, `modeForPath()` maps the pathname:

```ts
const PLAYGROUND_PREFIXES = ['/browse', '/rooms/']
// '/' is the feed; everything else in the shell is the community side
```

Servers is the **default** for an unknown path, because it is the fuller shell —
a route the map has not heard of renders with its navigation rather than
without it.

### The one ambiguous address

`/rooms/:roomId` covers both a playground room *and* a direct conversation, and
a DM belongs to the side with the sidebar. The path alone cannot tell them
apart, so `AppShell` resolves it from the data:

```tsx
const roomIsDirect =
  myRooms.data?.some((room) => room.id === roomId && room.category === 'dm') ?? false
const playground =
  mode === 'playground' && (!roomId || (myRooms.isSuccess && !roomIsDirect))
```

Until that list has loaded the fuller shell wins: a screen that gains navigation
a moment late is better than one that has none and might have needed it.

---

## 2. `@genzh/shared`

`packages/shared` — imported by both apps, **aliased to source rather than
built**. There is no compile step and no `dist/`.

| Module        | Holds                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `api/types.ts`| every wire type, mirroring the Rust DTOs by hand                       |
| `api/endpoints.ts` | one function per endpoint; each takes `token: string \| null`     |
| `api/client.ts`| the axios instance, error translation into `ApiError`                 |
| `queries/`    | React Query hooks and `queryKeys`, the key factory                     |
| `viewmodels/` | composed hooks — `useRoomsVM`, `useChatVM`, … (mobile only)             |
| `ws/`         | `ChatSocket`                                                           |
| `media/`      | the client half of the SFU protocol                                    |
| `chat/`       | mentions, emoji, content limits, notification rules                    |
| `palette.ts`  | `hueFor`, accent swatches                                              |
| `permissions.ts`, `time.ts` | shared predicates and formatting                        |

`api/types.ts` is hand-written rather than generated. It has to stay in step
with `apps/api/src/routes/*` by discipline; when a DTO changes, change it here
in the same commit.

---

## 3. Two query layers, on purpose

**Shared (`packages/shared/src/queries/`)** — hooks take `token: string | null`
explicitly, plus a `viewmodels/` layer composing them into per-screen objects.
The mobile app uses both.

**Web (`apps/web/src/features/<domain>/api/`)** — its own hooks, and **none of
them takes a token**. The API client resolves it through the provider
`AuthProvider` registers, so a session is ambient rather than threaded through
every call site. The socket bridge writes arriving events straight into that
cache.

There is deliberately no imperative API client exported alongside the web hooks:
a screen that calls an endpoint directly owns a copy of the response that
nothing can invalidate, and the two copies disagree the moment anything writes.

The cost is one duplicated hook shape per endpoint. Both layers ultimately call
the same `endpoints.ts`, so the wire contract has exactly one definition.

### The playground feed hook, both ways

```ts
// shared — mobile
useFeedQuery(token, category)      // useInfiniteQuery, getNextPageParam: last.next_offset ?? undefined

// web
usePlaygroundFeed(category)        // same shape, no token
```

Both normalise the server's `null` for `next_offset`: React Query stops paging
on `undefined` only.

---

## 4. The mobile app

Expo + React Navigation. `expo-dev-client` is **mandatory** — WebRTC does not
exist in Expo Go, so a call joins and carries no audio.

### Navigation

```
RootNavigator (native stack)
├── unauthenticated: SignIn, Info
└── authenticated:
    ├── Main ──▶ MainTabs ──▶ mode === 'playground' ? PlaygroundTabs : ServersTabs
    ├── CommunityDetail, CommunitySettings, MemberList
    ├── RoomChat            transcript-shaped rooms
    ├── ExperienceRoom      rooms whose point is the live experience
    ├── Explore, Info
    └── Call                slide-from-bottom
```

**Two bottom-tab navigators, not one with filtered tabs.** The two modes
disagree about what the app *is*, and sharing a navigator would mean sharing a
history stack — switching modes would drop you wherever the other half happened
to have been. Two navigators means each half remembers its own place.

| Playground tabs | Servers tabs |
| --- | --- |
| **Feed** — the swipe feed | **Servers** — communities |
| **Browse** — the same rooms as a grid | **Friends** — incl. the Chats tab for DMs |
| **Activity** | **Activity** |
| **Settings** | **Settings** |

The root gates on `useAppMode().ready` as well as auth status: reading the stored
mode is a round-trip to disk, and landing in the feed then jumping to the server
list a frame later is worse than a beat of nothing.

### The feed screen

`screens/playground/PlaygroundFeedScreen.tsx` — a `FlatList`, not a pager
library: the feed is exactly a vertical list whose rows happen to be
screen-sized, so paging it natively brings windowing, pull-to-refresh and
infinite loading instead of rebuilding them on top of a pager.

```tsx
pagingEnabled
snapToInterval={pageHeight}
decelerationRate="fast"
disableIntervalMomentum
getItemLayout={(_, i) => ({ length: pageHeight, offset: pageHeight * i, index: i })}
```

`pageHeight` is **measured** via `onLayout`, not computed from
`useWindowDimensions() - tabBarHeight`. That computation is right on iOS and
wrong on some Android hardware, where the status bar and navigation bar are
counted inconsistently — and being off by a pixel makes a snapping feed drift
further out with every swipe.

`MomentCard` draws its own ground with `react-native-svg` rather than a native
gradient module, so no new native dependency and no dev-client rebuild.

### Experiences

`features/experiences/` — a room whose point is the live experience rather than
the transcript (`isExperienceRoom()`) opens as `ExperienceRoomScreen`, which puts
the experience and the chat in two tabs. The web stacks them in one column; a
phone has room for one at a time, and the chat tab pushes to the real transcript
screen rather than growing a second, worse copy of it.

---

## 5. The web app

React + Base UI + CSS Modules, Vite, React Router.

### Routes

| Path | Screen | Mode |
| --- | --- | --- |
| `/` | `PlaygroundFeedRoute` | playground |
| `/browse` | `HomeRoute` — the same rooms as a grid | playground |
| `/rooms/:roomId` | `RoomRoute` | playground, unless it is a DM |
| `/servers` | `ServersRoute` | servers |
| `/c/:communityId` | `CommunityRoute` | servers |
| `/c/:communityId/r/:roomId` | `RoomRoute` | servers |
| `/friends`, `/explore`, `/rewards` | | servers |
| `/notifications`, `/me` | phone-only; desktop redirects to `/servers` | servers |
| `/admin/*` | the platform console | servers |

### The shell

`AppShell` renders the community rail and channel sidebar **only** in servers
mode. In playground mode it drops the rail, the sidebar and the mobile top bar,
and the feed occupies the whole frame.

The feed is CSS `scroll-snap-type: y mandatory` with viewport-tall panels — the
browser's own scroller, so keyboard, trackpad, touch and the scrollbar all work
without any of them being implemented. Paging is driven off the scroller's own
`scrollTop` rather than an intersection observer on the last card: with snap
points, the last card only becomes fully visible once the reader is already on
it, which is too late to start loading.

### Auth

Tokens live in `localStorage` under `genzh.session`. The honest trade: readable
by any script on the origin, so vulnerable to XSS in a way an `HttpOnly` cookie
is not. Used anyway because the API is a separate origin and token-based, and
the mitigation that actually matters — not having an XSS — is the same either
way. The refresh token is short-lived, single-use and revoked on reuse.

---

## 6. The design system

Same components, same names, two implementations.

- **Web** — `src/components/<Name>/`, Base UI behaviour plus a CSS Module.
  Tokens in `src/styles/tokens.css` (`--color-*`, `--space-*`, `--radius-*`,
  `--duration-*`, `--ease-*`).
- **Mobile** — `src/components/<Name>.tsx`, hand-built. Tokens in
  `src/theme/tokens.ts` as plain objects, because React Native has no cascade
  and no `oklch` parser. `Palette` is derived from the dark object so a token
  added to one palette and forgotten in the other is a type error rather than a
  colour that silently falls back.

The identity rules both obey: ink on lime for primary actions, warm ground
rather than cold slate, light as depth, and pills on slabs — controls are fully
round, cards are soft slabs.

The mobile tab bar is hand-written rather than configured through
`screenOptions`, because the two things that make it feel like the rest of the
app are out of reach from there: the accent wash that slides in behind the
active icon, and a colour that *crossfades* between states instead of cutting.

---

## 7. Realtime

One socket, `ChatSocket` in `@genzh/shared/ws`, connected to `GET /ws`. It
carries messages, presence, typing, call signalling and room lifecycle.

Both apps do the same thing with it: **the socket writes into the query cache**.
A screen redraws because its data changed, not because something remembered to
call it back. Mutations invalidate; the socket patches; nothing keeps a private
copy.

The media plane's socket is entirely separate and speaks its own protocol
([`media-protocol.md`](media-protocol.md)).

---

## 8. Traps

**`@genzh/shared` is aliased to source.** Any library holding React context —
React Query, React itself — must be deduped in the bundler config, or two copies
load and the providers silently do not match. `resolve.dedupe` on web, the
metro resolver on mobile.

**BFF composites and query-key nesting.** A composite response seeds several
caches at once; the keys it writes must match the keys the granular hooks read,
or the screen paints from the composite and then refetches everything anyway.

**Mobile release builds and the server endpoint.** The endpoint is resolved in a
defined order, and a release build with none of it configured reaches nowhere.
Check that before debugging anything else on a device.

**`react-native-svg` resolves `url(#…)` against a shared registry.** Twenty feed
cards all naming their gradient `"ground"` would every one of them paint with
whichever card mounted first. Ids must carry something unique — the room id.

**The mobile android/ directory drifts from `app.json` silently.** Regenerate
rather than hand-editing when they disagree.
