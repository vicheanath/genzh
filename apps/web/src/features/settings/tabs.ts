import {
  BanIcon,
  GlobeIcon,
  HeadphonesIcon,
  LockIcon,
  ShieldIcon,
  SunIcon,
  UsersIcon,
} from '@/components/Icons'

export type SettingsTab =
  | 'profile'
  | 'anonymous'
  | 'account'
  | 'appearance'
  | 'voice'
  | 'blocked'
  | 'language'

export interface SettingsTabInfo {
  id: SettingsTab
  label: string
  /**
   * A line of secondary text, for the surfaces that have room for one.
   *
   * The phone's account screen shows it under the label; the desktop sidebar
   * ignores it. It lives here rather than in that screen so there is one list
   * of what settings contains — the parallel copy that screen used to keep had
   * already drifted, leaving "My Account" reachable on desktop and missing on
   * a phone.
   */
  hint: string
  icon: typeof UsersIcon
}

/**
 * The nav, as data.
 *
 * The sidebar used to be six hand-written buttons that each repeated the same
 * `cx(navButton, activeTab === … && navButtonActive)` incantation; adding a tab
 * meant editing three places. Grouping matches the split people expect: things
 * about *you*, then things about *the app on this machine*.
 */
export const SETTINGS_GROUPS: ReadonlyArray<{
  heading: string
  tabs: ReadonlyArray<SettingsTabInfo>
}> = [
  {
    heading: 'User Settings',
    tabs: [
      { id: 'profile', label: 'Profile', hint: 'Name, avatar, accent', icon: UsersIcon },
      {
        id: 'anonymous',
        label: 'Anonymous Persona',
        hint: 'Your masked identity',
        icon: LockIcon,
      },
      { id: 'account', label: 'My Account', hint: 'E-mail, password, sessions', icon: ShieldIcon },
    ],
  },
  {
    heading: 'App Settings',
    tabs: [
      { id: 'appearance', label: 'Appearance', hint: 'Theme', icon: SunIcon },
      {
        id: 'voice',
        label: 'Voice & Video',
        hint: 'Microphone, camera, output',
        icon: HeadphonesIcon,
      },
      { id: 'language', label: 'Language', hint: 'Display language', icon: GlobeIcon },
      { id: 'blocked', label: 'Blocked Users', hint: 'Who cannot reach you', icon: BanIcon },
    ],
  },
]


/**
 * The swatch palette, shared by the profile and persona pickers.
 *
 * Re-exported rather than defined here: the same swatches are offered for
 * community roles too, so the list lives in `lib/palette` and this module just
 * points at it. Kept as a named re-export so the existing call sites in
 * ProfileTab and AnonymousTab did not all have to change import paths.
 */
export { ACCENT_COLORS as PRESET_COLORS, DEFAULT_ACCENT } from '@/lib/palette'

/** Every settings tab, flattened out of its group. */
export const SETTINGS_TABS: ReadonlyArray<SettingsTabInfo> = SETTINGS_GROUPS.flatMap(
  (group) => group.tabs,
)
