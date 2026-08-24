# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before
writing any code. Note that Expo retires old versioned doc pages — if that URL
404s, the version set this project actually installs is the authority:
`node_modules/expo/bundledNativeModules.json`, which is what `expo install`
itself reads.

This project is pinned to **SDK 54.0.37** (React Native 0.81.5, React 19.1.0)
to match the Expo Go build on the target device. Do not "upgrade to latest"
without confirming which Expo Go the device runs — Expo Go only ever runs the
one SDK it was compiled for.

# Dev server port: 8090, not 8081

Metro's default port is 8081, and in this repo **the Rust media server already
owns 8081** (`MEDIA_BIND=0.0.0.0:8081` in the root `.env`). When both run, the
media server takes the IPv4 socket and Metro is left with IPv6 only — a phone
on the LAN then reaches the media server, which answers `404`, and the app
never loads.

Always start through the package scripts (`pnpm start`, `pnpm android`, …),
which pass `--port 8090`. A bare `npx expo start` falls back to 8081 and will
fail this way again.

Repo ports: `5173` web dev · `8080` api · `8081` media · `8082` web (docker) ·
`8090` metro.

# Package manager: pnpm 10

`node_modules` and `pnpm-lock.yaml` are pnpm 10. The `packageManager` field in
`package.json` pins it, so use `corepack pnpm …` or `npx pnpm@10 …`. A bare
`pnpm` may be an older major on PATH and will fail with a store-version error.

# pnpm + React Native: @babel/runtime must be declared

`babel-preset-expo` compiles `require('@babel/runtime/helpers/...')` calls into
the output, but nothing *declares* `@babel/runtime` as a dependency — it only
ever appears in emitted code. npm's flat `node_modules` hid this; pnpm's
isolated layout does not hoist it, and Metro fails with:

    Unable to resolve module @babel/runtime/helpers/interopRequireDefault

So it is listed in `dependencies` on purpose. Do not remove it as "unused" —
nothing imports it in source, and the bundle will not build without it.
