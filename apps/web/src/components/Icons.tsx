/**
 * The icon set.
 *
 * One file rather than a dependency: the app needs about thirty glyphs, and an
 * icon package would ship a thousand plus a tree-shaking question. They all
 * share one 24×24 stroked grid so they sit together optically at any size.
 *
 * Every icon takes its colour from `currentColor` and its size from the `size`
 * prop, so a caller styles the wrapper and the icon follows.
 */
import type { ReactNode, SVGProps } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number | string
}

/** Shared chrome: viewBox, stroke defaults, and `aria-hidden`. */
function Icon({ size = 18, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

/* ── navigation ─────────────────────────────────────────────────────────── */

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 10.2 12 3.5l9 6.7V20a1 1 0 0 1-1 1h-4.5v-6h-7v6H4a1 1 0 0 1-1-1v-9.8Z" />
  </Icon>
)

export const CompassIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </Icon>
)

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9.5" cy="7.5" r="3.5" />
    <path d="M21 20v-1.5a4 4 0 0 0-3-3.87M16.5 4.13a4 4 0 0 1 0 7.75" />
  </Icon>
)

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 9 7 7 7-7" />
  </Icon>
)

export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5v15M5.5 13l6.5 6.5L18.5 13" />
  </Icon>
)

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.5 12h-15M11 4.5 4.5 12 11 19.5" />
  </Icon>
)

/* ── rooms ──────────────────────────────────────────────────────────────── */

export const HashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 9h14M4.5 15h14M10.5 4 8.5 20M15.5 4l-2 16" />
  </Icon>
)

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Icon>
)

export const MicOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6.2A3 3 0 0 1 15 6v4.2M15 13.4a3 3 0 0 1-4.6 1" />
    <path d="M5.5 11a6.5 6.5 0 0 0 10.2 5.3M18.5 11v.5M12 17.5V21" />
    <path d="M3.5 3.5 20.5 20.5" />
  </Icon>
)

export const VideoIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="6" width="13" height="12" rx="3" />
    <path d="m15.5 11 6-3.5v9l-6-3.5" />
  </Icon>
)

export const SparkleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9 12 3.5Z" />
  </Icon>
)

export const HeadphonesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="2.5" y="13.5" width="4.5" height="7" rx="2" />
    <rect x="17" y="13.5" width="4.5" height="7" rx="2" />
  </Icon>
)

export const PhoneOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 10.5c5.5-4 10.5-4 16 0v3l-3.5.8-1-2.8a11 11 0 0 0-7 0l-1 2.8L3 13.5v-3Z" />
    <path d="M3.5 3.5 20.5 20.5" />
  </Icon>
)

/* ── actions ────────────────────────────────────────────────────────────── */

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.5 3.5 10.5 13.5M20.5 3.5 14 20.5l-3.5-7-7-3.5 17-6.5Z" />
  </Icon>
)

export const SmileIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14a4.2 4.2 0 0 0 7 0" />
    <path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.25" />
  </Icon>
)

export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4l10-10a2.83 2.83 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
)

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5h16M9.5 6.5V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
  </Icon>
)

export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="2.5" />
  </Icon>
)

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
    <path d="M15.5 5.5v-1a1 1 0 0 0-1-1h-9a2 2 0 0 0-2 2v9a1 1 0 0 0 1 1h1" />
  </Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
)

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.4a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3.4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z" />
  </Icon>
)

export const SignOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 20.5H5.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h4" />
    <path d="m15.5 16.5 5-4.5-5-4.5M20.5 12H9" />
  </Icon>
)

export const UserPlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9" cy="7.5" r="3.5" />
    <path d="M18.5 7.5v6M21.5 10.5h-6" />
  </Icon>
)

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 4.5 6v6c0 4.4 3 7.9 7.5 9.2 4.5-1.3 7.5-4.8 7.5-9.2V6L12 3Z" />
  </Icon>
)

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9.5a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5Z" />
    <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
  </Icon>
)

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </Icon>
)

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Icon>
)

export const MonitorIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8.5 20.5h7M12 17v3.5" />
  </Icon>
)
