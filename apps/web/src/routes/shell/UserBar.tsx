import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import {
  CheckIcon,
  HeadphonesIcon,
  MenuIcon,
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
import { useIsStaff } from '@/features/api'
import { NotificationBell } from '@/features/notifications'
import { useAuth } from '@/lib/auth'
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
 * You, at the foot of the sidebar: who you are and the controls you reach for
 * mid-call.
 *
 * The desktop half of a pair — on a phone the same information is the `/me`
 * screen, because a strip inside a drawer is not somewhere anyone looks.
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
      {/* Your own dot is genuinely online whenever this renders — the shell
          holds the socket, so a signed-in session is a connected one. */}
      <Avatar
        name={user?.profile.display_name ?? '?'}
        src={user?.profile.avatar_url}
        color={user?.profile.accent_color}
        size="sm"
        presence="online"
      />
      <div className={styles.identity}>
        <div className={styles.identityName}>{user?.profile.display_name}</div>
        <div className={styles.identityHandle}>@{user?.handle}</div>
      </div>

      {/* Desktop only. The sidebar is a drawer on a phone, and a popover
          inside it would be wider than the drawer holding it — mobile reaches
          notifications through the bottom bar instead. */}
      {!isMobile && <NotificationBell />}

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={toggleMute}
        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        style={isMuted ? { color: 'var(--color-danger)' } : undefined}
      >
        {isMuted ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={toggleDeafen}
        aria-label={isDeafened ? 'Undeafen audio' : 'Deafen audio'}
        style={isDeafened ? { color: 'var(--color-danger)' } : undefined}
      >
        {isDeafened ? <PhoneOffIcon size={16} /> : <HeadphonesIcon size={16} />}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={onOpenSettings}
        aria-label="User settings"
      >
        <SettingsIcon size={16} />
      </Button>

      <Menu
        side="top"
        align="end"
        trigger={
          <Button variant="ghost" size="sm" iconOnly aria-label="Account menu">
            <MenuIcon size={16} />
          </Button>
        }
      >
        <MenuItem icon={<SettingsIcon size={15} />} onClick={onOpenSettings}>
          User settings
        </MenuItem>

        {/* Only staff are shown the way in. The route redirects and every
            endpoint behind it refuses regardless, so this is discoverability
            rather than a gate. */}
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
    </div>
  )
}
