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

The package scripts pass `--port 8090`; a bare `npx expo start` falls back to
Metro's default 8081. Start through the scripts so a device that has an 8090
URL cached keeps working.

Repo ports: `5173` web dev · `7880`/`7881` LiveKit · `8080` api · `8082` web
(docker) · `8090` metro.

# Calls need a development build, not Expo Go

Media is LiveKit: `livekit-client` driving `@livekit/react-native` over
`@livekit/react-native-webrtc`, with `@livekit/react-native-expo-plugin` and
`@config-plugins/react-native-webrtc` doing the native config. All of it is
native, so **Expo Go cannot carry a call** — `isWebRTCAvailable` in
`src/lib/livekit/runtime.ts` is false there and the UI disables the controls
rather than pretending.

`registerLiveKitGlobals()` runs from `index.ts` before anything else, because
`livekit-client` is the same package the web app uses and reaches for browser
globals Hermes does not have. Adding an import that constructs a `Room` above
that call breaks every call in the app.

Changing any of these four packages, or the plugin options in `app.json`,
requires a new dev build — a Metro reload will not pick it up.

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
