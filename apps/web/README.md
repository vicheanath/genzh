# genzh web

The web client: sign in, browse communities, chat, and join voice rooms.

Vite + React + TypeScript, [Base UI](https://base-ui.com) for behaviour, CSS
Modules for appearance.

## Running it

```bash
cp .env.example .env      # point VITE_API_URL at your API
npm install
npm run dev               # http://localhost:5173
```

The API must allow this origin:

```bash
CORS_ALLOWED_ORIGINS=http://localhost:5173 cargo run -p api
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Typecheck (`tsc -b`) then production bundle |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | oxlint |

## Styling

**Base UI ships no styles.** It provides behaviour and accessibility —
focus trapping, roving focus, ARIA wiring, positioning — and leaves appearance
entirely open. That is why it pairs with CSS Modules rather than fighting them:
there is no built-in theme to override.

Three rules:

1. **One `.module.css` per component**, next to it. Class names are scoped at
   build time, so collisions are impossible by construction rather than by
   naming convention.
2. **Colours, spacing and radii come from tokens** in `src/styles/tokens.css`.
   No literal colour appears in a component stylesheet, which is what makes the
   light/dark themes a single edit.
3. **State comes from `data-*` attributes**, not from class toggling in JS:

   ```css
   .root[data-checked]     { background: var(--color-accent); }
   .item[data-highlighted] { background: var(--color-accent); }
   .popup[data-starting-style] { opacity: 0; scale: 0.97; }
   ```

   Base UI documents these per component, and generates them into
   `node_modules/@base-ui/react/*/**/*DataAttributes.js` — the authoritative
   list when you are unsure what to target.

`vite.config.ts` sets `localsConvention: 'camelCaseOnly'`, so CSS is written
kebab-case and read camelCase: `.track-indicator` → `styles.trackIndicator`.

> The package ships its own docs under `node_modules/@base-ui/react/docs/`, and
> they state they are authoritative over prior knowledge. Consult them before
> guessing at a part structure — `Select`, for instance, does not work without
> `Select.List` inside `Select.Popup`.

## Layout

```
src/
├── main.tsx              entry
├── App.tsx               routing, and the signed-in/signed-out split
├── styles/               tokens.css + global.css — the only global CSS
├── components/           presentational, no data fetching
│   └── Button/{Button.tsx, Button.module.css, index.ts}
├── routes/               screens, one folder-level file each
│   ├── AppShell.tsx      community rail + room sidebar + mobile drawer/nav
│   ├── Chat.tsx          the transcript, composer and reactions
│   ├── VoicePanel.tsx    the live half of a voice or video room
│   ├── MemberList.tsx    shared by the room rail and the community page
│   └── ProfileDialog.tsx
└── lib/
    ├── api/              typed client — one function per endpoint
    ├── auth/             session, refresh, persistence
    ├── media/            the voice engine
    ├── permissions.ts    `can()` — mirrors the server's administrator rule
    ├── time.ts           clocks, day dividers, message grouping windows
    ├── useAsync.ts       fetch-once-and-track hook
    ├── useMediaQuery.ts  the one breakpoint JS needs to know about
    ├── useProfiles.ts    id → profile cache
    └── useTheme.ts
```

### Two things that are easy to get wrong

**Permissions.** Always ask through `can()` in `lib/permissions.ts`, never
`your_permissions.includes(…)`. The API returns the caller's *resolved* set but
does not expand `administrator` into the other thirteen — server-side that one
short-circuits every check — so a community owner's room comes back as exactly
`["administrator"]`. A literal `includes('send_message')` hides the composer
from the person who owns the place.

**Chat scrolling.** The transcript sticks to the bottom only for a reader who is
already there (within 80px). Someone scrolled up into history gets a "jump to
latest" pill with an unread count instead of being yanked down. Loading older
messages restores the distance from the *bottom*, because prepending grows the
container upward.

Components never fetch. Routes fetch and pass data down. That keeps the
component layer reusable and the data flow visible in one place per screen.

## How voice works

`src/lib/media/VoiceClient.ts` is a framework-agnostic class; `useVoiceRoom`
binds it to React through `useSyncExternalStore`. Nothing about WebRTC lives in
a component, so render cycles and effect ordering cannot perturb a live call.

```
POST /api/v1/rooms/{id}/media/join   → media_url + a ~2 minute token
        │
        ▼
  ws(s)://media/ws/media  ── join{room_id, token}
        │
        ├── publisher  RTCPeerConnection   the client offers   → your microphone
        └── subscriber RTCPeerConnection   the server offers   → everyone else
```

Two peer connections, one offerer each, so a glare condition cannot arise. See
`docs/media-protocol.md` in the repository root.

Worth knowing:

* **Joining is muted.** Unmuting is an explicit act, and mute disables the
  track at the source so nothing leaves the machine.
* **Voice activity is detected in the browser** with an `AnalyserNode` and sent
  as a `speaking` message. The server trusts it by default
  (`MEDIA_VAD_MODE=client`) because it costs the server nothing and scales with
  users rather than with CPU.
* **Reconnects fetch a new token.** Media tokens expire in about two minutes, so
  a reconnect re-runs the API join rather than replaying the old one. Backoff is
  capped at five attempts.
* **Remote audio is matched to a participant** by the media-stream id, which the
  SFU sets to the publisher's participant id, falling back to the `<participant>:<kind>`
  track id.

## Known gaps

* **Chat polls every 5 seconds.** The signalling socket carries media events
  only; there is no realtime transport for messages yet. `Chat.tsx` marks the
  one place this happens; results are merged by id rather than replaced, so an
  optimistic reaction survives the poll that lands a moment later.
* **Presence is not real.** The dot on your own avatar is always "online" and
  friends always show "offline" — there is no presence service yet, and the
  component (`components/PresenceDot`) is ready for one.
* **Typing indicators are absent**, deliberately: with no realtime transport
  they would have to be faked, and a fake one is worse than none.
* **No video or screen share in the UI.** The protocol, the SFU and the
  permission model all support them; only the client surface is missing.
* **Tokens live in `localStorage`**, with the XSS trade-off documented in
  `src/lib/auth/storage.ts`.
* **`VITE_API_URL` is baked in at build time**, so one image is one
  environment. Inherent to a static SPA.
