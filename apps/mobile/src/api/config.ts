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
 * Where the API lives, before the user overrides it.
 *
 * This used to be a flat `10.0.2.2:8080` for Android. That alias is the
 * *emulator's* route back to the host machine and means nothing on a real
 * phone — a physical device resolved it to itself and every request failed,
 * which is why the app worked in an emulator and not on a handset.
 *
 * The order below is deliberate:
 *   1. the dev server's own host, whenever it is a real address — it is the
 *      one host the device has already reached successfully;
 *   2. `10.0.2.2` on Android only when the dev server *is* loopback, which is
 *      the genuine emulator case;
 *   3. loopback elsewhere, for the simulator and for web.
 */
export const DEFAULT_API_URL = ((): string => {
  const host = devServerHost();

  if (host && !isLoopback(host)) {
    return `http://${host}:${API_PORT}`;
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
