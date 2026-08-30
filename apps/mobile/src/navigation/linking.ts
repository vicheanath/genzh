import { getWebUrl } from '../api/config';

/**
 * Which URLs belong to this app.
 *
 * Three kinds, and each is here for a different reason:
 *
 *   `genzh://`  — the custom scheme. It always works, on any Android and any
 *                 iOS, with nothing hosted anywhere. It is the floor.
 *   `https://…` — the real link, the one people actually send each other. It
 *                 opens the app on a device that has it and the website on one
 *                 that does not, which is the only shape of link worth sharing.
 *   the dev host — so a link works against a laptop during development too,
 *                  where the origin is an IP rather than the domain.
 *
 * The https prefixes need more than this file to *auto*-open: Android wants an
 * `assetlinks.json` and iOS an `apple-app-site-association`, both served from
 * the web origin. Without them Android offers the app in a chooser and iOS
 * falls back to the browser — degraded, not broken, which is why they are
 * listed rather than held back until the hosting lands.
 */
const PRODUCTION_WEB_ORIGIN = 'https://genzh.pdfpaperkit.com';

export function linkingPrefixes(): string[] {
  const configured = getWebUrl();
  const prefixes = ['genzh://', PRODUCTION_WEB_ORIGIN];
  if (!prefixes.includes(configured)) prefixes.push(configured);
  return prefixes;
}

/**
 * Paths this app can open from a URL.
 *
 * Deliberately short, and a screen earns its place here only when everything it
 * needs can be read out of the path. `InviteScreen` needs a code and nothing
 * else. Rooms and communities are absent on purpose: their screens take a name
 * and a type alongside the id, which a URL does not carry, so linking to them
 * would open a screen with a blank header rather than the thing the reader
 * tapped.
 *
 * There is no catch-all pattern either. One would swallow every unrecognised
 * URL into whichever screen it named, and an app that opens the wrong page is
 * harder to explain than one that opens its own front door.
 */
export const linkingConfig = {
  screens: {
    // Both spellings, because the web app serves both and a link that works in
    // a browser but not in the app is worse than no deep link at all.
    Invite: {
      path: 'invite/:code',
      alias: ['invites/:code'],
    },
  },
};

export function buildLinking() {
  return {
    prefixes: linkingPrefixes(),
    config: linkingConfig,
  };
}

/**
 * The invite code in a URL, or null if it is not an invite link.
 *
 * Used for the case React Navigation's own linking cannot cover: a signed-out
 * launch, where the screen the URL names is not mounted yet and the navigator
 * has nowhere to put it. The code is held until there is a session and then
 * navigated to by hand — see `RootNavigator`.
 *
 * Parsed with a regex rather than `new URL`, because the custom-scheme form
 * (`genzh://invite/abc`) is not a URL every runtime agrees how to parse:
 * Hermes reads the host as `invite` and the path as `/abc`, which turns the
 * one shape into two cases for no gain.
 */
export function inviteCodeFromUrl(url: string): string | null {
  const match = /(?:^|[/:])invites?\/([A-Za-z0-9_-]+)/.exec(url);
  return match ? match[1] : null;
}
