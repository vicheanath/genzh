import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { setApiBaseUrl as setSharedBaseUrl } from '@genzh/shared';

const STORAGE_KEY = 'genzh_api_base_url';

/** The port the Rust API listens on — see API_BIND in the repo root .env. */
const API_PORT = 8080;

/**
 * The host this bundle was downloaded from.
 *
 * Expo puts the dev server's `host:port` in `hostUri`, which is exactly the
 * address the device just proved it can reach — it fetched the JS from there.
 * Deriving the API host from it means the same build works on an emulator, on
 * a phone over Wi-Fi, and on a tunnel, with nothing to configure.
 */
function devServerHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Expo Go on SDK 51+ serves a manifest2 payload; the dev server address
    // lives under a different key there.
    (Constants as { manifest2?: { extra?: { expoGo?: { developer?: { host?: string } } } } })
      .manifest2?.extra?.expoGo?.developer?.host ??
    null;

  if (!hostUri) return null;

  // `hostUri` is "host:port" — and the host half may be an IPv6 literal in
  // brackets, so split on the last colon rather than the first.
  const withoutPort = hostUri.replace(/:\d+$/, '');
  return withoutPort || null;
}

function isLoopback(host: string): boolean {
  // An IPv6 host arrives bracketed ("[::1]"), so strip the brackets before
  // comparing — otherwise the emulator fallback below never fires for it.
  const bare = host.replace(/^\[|\]$/g, '');
  return bare === 'localhost' || bare === '127.0.0.1' || bare === '::1';
}

/**
 * The deployment this app talks to when nothing else says otherwise.
 *
 * A release build has no dev server to learn a host from, so without this it
 * fell through to `10.0.2.2`/`localhost` — addresses that mean nothing once
 * the app is installed on a real phone. Every standalone build pointed at
 * nowhere and every request failed before it left the handset.
 *
 * Override per build profile with `EXPO_PUBLIC_API_URL` (see `eas.json`);
 * override per device at runtime from the sign-in screen's server field.
 */
const PRODUCTION_API_URL = 'https://genzh.pdfpaperkit.com';

/** An explicit build-time target. Metro inlines `EXPO_PUBLIC_*` into the bundle. */
const CONFIGURED_API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '') || null;

/**
 * Where the API lives, before the user overrides it.
 *
 * This used to be a flat `10.0.2.2:8080` for Android. That alias is the
 * *emulator's* route back to the host machine and means nothing on a real
 * phone — a physical device resolved it to itself and every request failed,
 * which is why the app worked in an emulator and not on a handset.
 *
 * The order below is deliberate:
 *   1. `EXPO_PUBLIC_API_URL`, when the build was told outright;
 *   2. the dev server's own host, whenever it is a real address — it is the
 *      one host the device has already reached successfully;
 *   3. `10.0.2.2` on Android only when the dev server *is* loopback, which is
 *      the genuine emulator case;
 *   4. loopback elsewhere, for the simulator and for web.
 *
 * Steps 2–4 all describe a machine on the developer's desk, so they are
 * reachable only while a dev server exists. A build with none is a shipped
 * app, and a shipped app belongs on the deployed server.
 */
export const DEFAULT_API_URL = ((): string => {
  if (CONFIGURED_API_URL) {
    return CONFIGURED_API_URL;
  }

  const host = devServerHost();

  if (host && !isLoopback(host)) {
    return `http://${host}:${API_PORT}`;
  }

  // No dev server host at all: this is a standalone build, not a laptop.
  if (!host) {
    return PRODUCTION_API_URL;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
})();

let currentBaseUrl = DEFAULT_API_URL;
setSharedBaseUrl(currentBaseUrl);

export async function loadSavedApiUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      currentBaseUrl = saved.trim();
      setSharedBaseUrl(currentBaseUrl);
      return currentBaseUrl;
    }
  } catch {
    // Ignore storage read errors
  }
  currentBaseUrl = DEFAULT_API_URL;
  setSharedBaseUrl(currentBaseUrl);
  return DEFAULT_API_URL;
}

export async function saveApiUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/$/, '');
  currentBaseUrl = clean;
  setSharedBaseUrl(clean);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, clean);
  } catch {
    // Ignore storage write errors
  }
}

export function getApiUrl(): string {
  return currentBaseUrl;
}

/**
 * Rewrite the LiveKit WebSocket URL so it reaches the host from this device.
 *
 * The API reports LiveKit's address as *it* sees it, which on a developer's
 * machine is loopback — meaningless on a phone, and on an Android emulator it
 * resolves to the emulator itself. The device has already proved it can reach
 * the API host, so that is the host LiveKit gets too.
 */
export function resolveMediaWsUrl(mediaUrl: string): string {
  try {
    const rawWs = mediaUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    const mediaUri = new URL(rawWs);
    const apiUri = new URL(currentBaseUrl);

    // If media_url points to loopback but the device reached the API on another host/IP:
    if (isLoopback(mediaUri.hostname) && !isLoopback(apiUri.hostname)) {
      mediaUri.hostname = apiUri.hostname;
    } else if (Platform.OS === 'android' && isLoopback(mediaUri.hostname) && apiUri.hostname === '10.0.2.2') {
      mediaUri.hostname = '10.0.2.2';
    }

    return mediaUri.toString();
  } catch {
    return mediaUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  }
}
