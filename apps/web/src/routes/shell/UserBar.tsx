import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import {
  CheckIcon,
  HeadphonesIcon,
  MicIcon,
  MicOffIcon,
  MonitorIcon,
  MoonIcon,
  PhoneOffIcon,
  SettingsIcon,
  ShieldIcon,
  SignOutIcon,
  SunIcon,
} from '@/components/Icons'
import { Menu, MenuItem, MenuSeparator } from '@/components/Menu'
import { Tooltip } from '@/components/Tooltip'
import { useIsStaff } from '@/features/api'
import { NotificationBell } from '@/features/notifications'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAppStore } from '@/lib/store'
import { useIsMobile } from '@/lib/useMediaQuery'
import { useTheme, type Theme } from '@/lib/useTheme'

import styles from './shell.module.css'

const THEME_ITEMS: ReadonlyArray<{ value: Theme; label: string; icon: typeof SunIcon }> = [
  { value: 'system', label: 'System', icon: MonitorIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
]

/**
 * Discord-style User Bar at the bottom of the channel sidebar.
 *
 * Left: Interactive user profile button that opens the account & status menu.
 * Right: Quick controls trio: Mute, Deafen, and User Settings (with tooltips).
 */
export function UserBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isStaff = useIsStaff()
  const isMobile = useIsMobile()
  const { theme, setTheme } = useTheme()
  const isMuted = useAppStore((s) => s.isMuted)
  const isDeafened = useAppStore((s) => s.isDeafened)
  const toggleMute = useAppStore((s) => s.toggleMute)
  const toggleDeafen = useAppStore((s) => s.toggleDeafen)

  return (
    <div className={styles.userBar}>
      <Menu
        side="top"
        align="start"
        trigger={
          <button
            type="button"
            className={styles.userCardBtn}
            aria-label="Account and status menu"
          >
            <Avatar
              name={user?.profile.display_name ?? '?'}
              src={user?.profile.avatar_url}
              color={user?.profile.accent_color}
              size="sm"
              presence="online"
            />
            <div className={styles.identity}>
              <span className={styles.identityName}>{user?.profile.display_name}</span>
              <span className={styles.identityHandle}>@{user?.handle}</span>
            </div>
          </button>
        }
      >
        <MenuItem icon={<SettingsIcon size={15} />} onClick={onOpenSettings}>
          User settings
        </MenuItem>

        {isStaff && (
          <MenuItem icon={<ShieldIcon size={15} />} onClick={() => void navigate('/admin')}>
            Platform console
          </MenuItem>
        )}

        <MenuSeparator />

        {THEME_ITEMS.map(({ value, label, icon: Icon }) => (
          <MenuItem
            key={value}
            icon={theme === value ? <CheckIcon size={15} /> : <Icon size={15} />}
            closeOnClick={false}
            onClick={() => setTheme(value)}
          >
            {label}
          </MenuItem>
        ))}

        <MenuSeparator />

        <MenuItem tone="danger" icon={<SignOutIcon size={15} />} onClick={() => void logout()}>
          Sign out
        </MenuItem>
      </Menu>

      <div className={styles.userBarActions}>
        {!isMobile && <NotificationBell />}

        <Tooltip content={isMuted ? 'Unmute' : 'Mute'}>
          <button
            type="button"
            className={cx(styles.userActionBtn, isMuted && styles.userActionBtnActive)}
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={!isMuted}
          >
            {isMuted ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
          </button>
        </Tooltip>

        <Tooltip content={isDeafened ? 'Undeafen' : 'Deafen'}>
          <button
            type="button"
            className={cx(styles.userActionBtn, isDeafened && styles.userActionBtnActive)}
            onClick={toggleDeafen}
            aria-label={isDeafened ? 'Undeafen audio' : 'Deafen audio'}
            aria-pressed={!isDeafened}
          >
            {isDeafened ? <PhoneOffIcon size={16} /> : <HeadphonesIcon size={16} />}
          </button>
        </Tooltip>

        <Tooltip content="User Settings">
          <button
            type="button"
            className={styles.userActionBtn}
            onClick={onOpenSettings}
            aria-label="User Settings"
          >
            <SettingsIcon size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
