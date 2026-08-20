import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import {
  BanIcon,
  ChevronDownIcon,
  HeadphonesIcon,
  LockIcon,
  SignOutIcon,
  SunIcon,
  UsersIcon,
} from '@/components/Icons'
import { useAuth } from '@/lib/auth'
import { useAppStore } from '@/lib/store'
import type { SettingsTab } from '@/features/settings'

import styles from './MobilePages.module.css'

const SECTIONS: ReadonlyArray<{
  tab: SettingsTab
  label: string
  hint: string
  icon: typeof UsersIcon
}> = [
  { tab: 'profile', label: 'Profile', hint: 'Name, avatar, accent', icon: UsersIcon },
  { tab: 'anonymous', label: 'Anonymous persona', hint: 'Your masked identity', icon: LockIcon },
  { tab: 'voice', label: 'Voice & video', hint: 'Microphone, camera, output', icon: HeadphonesIcon },
  { tab: 'appearance', label: 'Appearance', hint: 'Theme', icon: SunIcon },
  { tab: 'blocked', label: 'Blocked users', hint: 'Who cannot reach you', icon: BanIcon },
]

/**
 * You, as a screen.
 *
 * The desktop user bar is a strip at the foot of the sidebar, which on a phone
 * is inside a drawer nobody opens to check their own name. This is the same
 * information given the room a tap deserves, and it is where the bottom bar's
 * profile tab lands.
 *
 * The settings themselves stay in the existing modal rather than being
 * duplicated as mobile screens: one implementation, opened at the right tab.
 */
export function AccountRoute() {
  const { user, logout } = useAuth()
  const openUserSettings = useAppStore((s) => s.openUserSettings)
  const navigate = useNavigate()

  if (!user) return null

  return (
    <div className={styles.page}>
      <div className={styles.identityCard}>
        <Avatar
          name={user.profile.display_name}
          src={user.profile.avatar_url}
          color={user.profile.accent_color}
          size="xl"
          presence="online"
        />
        <div className={styles.identityText}>
          <h1 className={styles.identityName}>{user.profile.display_name}</h1>
          <p className={styles.identityHandle}>@{user.handle}</p>
          {user.profile.bio && <p className={styles.identityBio}>{user.profile.bio}</p>}
        </div>
      </div>

      <div className={styles.pageBody}>
        <nav className={styles.menu} aria-label="Settings">
          {SECTIONS.map(({ tab, label, hint, icon: Icon }) => (
            <button
              key={tab}
              type="button"
              className={styles.menuItem}
              onClick={() => openUserSettings(tab)}
            >
              <span className={styles.menuIcon}>
                <Icon size={17} />
              </span>
              <span className={styles.menuText}>
                <span className={styles.menuLabel}>{label}</span>
                <span className={styles.menuHint}>{hint}</span>
              </span>
              <ChevronDownIcon size={16} className={styles.menuChevron} />
            </button>
          ))}
        </nav>

        <button
          type="button"
          className={styles.signOut}
          onClick={() => {
            void logout()
            void navigate('/')
          }}
        >
          <SignOutIcon size={17} />
          Sign out
        </button>
      </div>
    </div>
  )
}
