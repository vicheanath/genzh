import { NavLink } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import {
  BellIcon,
  CompassIcon,
  HomeIcon,
  MenuIcon,
  UsersIcon,
} from '@/components/Icons'
import { NotificationBadge } from '@/features/notifications'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useNotifications } from '@/lib/useNotifications'

import styles from './MobileChrome.module.css'

/**
 * The phone frame.
 *
 * Deliberately not a narrow rendering of the desktop shell. Desktop follows the
 * rail → sidebar → content arrangement people know from Discord, where
 * everything is on screen at once and secondary things live in strips and
 * popovers. A phone has one column and a thumb, so the same features are laid
 * out by a different rule: *anything with more than a glance of content is a
 * destination*, reachable from a bar at the bottom.
 *
 * That is why notifications and your account are routes here and panels there,
 * and why creating a community is not in this bar at all — it is a rare,
 * deliberate act, and it already has a home on the Explore screen.
 */

export function MobileTopBar({
  title,
  onOpenDrawer,
}: {
  title: string
  onOpenDrawer: () => void
}) {
  return (
    <header className={styles.topBar}>
      <Button variant="ghost" size="sm" iconOnly onClick={onOpenDrawer} aria-label="Open navigation">
        <MenuIcon size={20} />
      </Button>
      <span className={styles.topBarTitle}>{title}</span>
    </header>
  )
}

export function MobileNav() {
  const { user } = useAuth()
  const { unread } = useNotifications()

  return (
    <nav className={styles.mobileNav} aria-label="Main">
      <MobileNavLink to="/" end icon={<HomeIcon size={20} />} label="Home" />
      <MobileNavLink to="/friends" icon={<UsersIcon size={20} />} label="Friends" />
      <MobileNavLink to="/explore" icon={<CompassIcon size={20} />} label="Explore" />

      <MobileNavLink
        to="/notifications"
        label="Alerts"
        ariaLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        icon={
          <span className={styles.iconSlot}>
            <BellIcon size={20} />
            <NotificationBadge count={unread} />
          </span>
        }
      />

      <MobileNavLink
        to="/me"
        label="You"
        ariaLabel="Your account"
        icon={
          // Your own face rather than a generic glyph: this tab is the one
          // place on a phone that tells you which account you are in.
          <Avatar
            name={user?.profile.display_name ?? '?'}
            src={user?.profile.avatar_url}
            color={user?.profile.accent_color}
            size="xs"
          />
        }
      />
    </nav>
  )
}

function MobileNavLink({
  to,
  end,
  icon,
  label,
  ariaLabel,
}: {
  to: string
  end?: boolean
  icon: React.ReactNode
  label: string
  ariaLabel?: string
}) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={ariaLabel}
      className={({ isActive }) =>
        cx(styles.mobileNavItem, isActive && styles.mobileNavItemActive)
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
