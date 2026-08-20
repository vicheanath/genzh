import {
  BanIcon,
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

export interface SettingsTabInfo {
  id: SettingsTab
  label: string
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
      { id: 'profile', label: 'Profile', icon: UsersIcon },
      { id: 'anonymous', label: 'Anonymous Persona', icon: LockIcon },
      { id: 'account', label: 'My Account', icon: ShieldIcon },
    ],
  },
  {
    heading: 'App Settings',
    tabs: [
      { id: 'appearance', label: 'Appearance', icon: SunIcon },
      { id: 'voice', label: 'Voice & Video', icon: HeadphonesIcon },
      { id: 'blocked', label: 'Blocked Users', icon: BanIcon },
    ],
  },
]

/**
 * The swatch palette, shared by the profile and persona pickers.
 *
 * Drawn from the app's own accent range rather than a generic rainbow, so a
 * custom accent still looks like it belongs to this product.
 */
export const DEFAULT_ACCENT = '#8b5cf6'

export const PRESET_COLORS = [
  DEFAULT_ACCENT, // Violet — the app accent
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#eab308', // Amber
  '#2fe6a7', // Mint
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#94a3b8', // Slate
]
