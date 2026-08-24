import { Ban, Headphones, Lock, Palette, Server, Shield, User } from 'lucide-react-native';

export type SettingsTab =
  | 'profile'
  | 'anonymous'
  | 'account'
  | 'appearance'
  | 'voice'
  | 'blocked'
  | 'server';

export interface SettingsTabInfo {
  id: SettingsTab;
  label: string;
  /** The short form, for the strip where the full label will not fit. */
  short: string;
  icon: typeof User;
}

/**
 * The nav, as data.
 *
 * Grouped the way the web app groups it: things about *you*, then things about
 * *the app on this device*. `server` is the one entry the web app has no need
 * for — a browser talks to the origin it was served from, while a phone has to
 * be told which machine on the network is running the API.
 */
export const SETTINGS_GROUPS: ReadonlyArray<{
  heading: string;
  tabs: ReadonlyArray<SettingsTabInfo>;
}> = [
  {
    heading: 'User settings',
    tabs: [
      { id: 'profile', label: 'Profile', short: 'Profile', icon: User },
      { id: 'anonymous', label: 'Anonymous persona', short: 'Persona', icon: Lock },
      { id: 'account', label: 'My account', short: 'Account', icon: Shield },
    ],
  },
  {
    heading: 'App settings',
    tabs: [
      { id: 'appearance', label: 'Appearance', short: 'Look', icon: Palette },
      { id: 'voice', label: 'Voice & video', short: 'Voice', icon: Headphones },
      { id: 'blocked', label: 'Blocked users', short: 'Blocked', icon: Ban },
      { id: 'server', label: 'Server', short: 'Server', icon: Server },
    ],
  },
];

export const SETTINGS_TABS: ReadonlyArray<SettingsTabInfo> = SETTINGS_GROUPS.flatMap(
  (group) => group.tabs,
);

export { ACCENT_SWATCHES, ACCENT_COLORS as PRESET_COLORS, DEFAULT_ACCENT } from '@genzh/shared';
