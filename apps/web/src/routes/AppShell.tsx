import { NavLink, Outlet, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/Callout'
import { Select } from '@/components/Select'
import { LoadingPanel } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import { communities as communitiesApi, rooms as roomsApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAsync } from '@/lib/useAsync'
import { useTheme, type Theme } from '@/lib/useTheme'

import styles from './AppShell.module.css'

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies ReadonlyArray<{ value: Theme; label: string }>

/**
 * The signed-in frame: community list, room list, and the routed content.
 *
 * The sidebar reloads its room list whenever the selected community changes,
 * which is the only cross-route data dependency in the app.
 */
export function AppShell() {
  const { user, logout, getToken } = useAuth()
  const { theme, setTheme } = useTheme()
  const { communityId } = useParams<{ communityId?: string }>()

  const communities = useAsync(
    async () => communitiesApi.list(await getToken()),
    [getToken],
  )

  const rooms = useAsync(async () => {
    if (!communityId) return []
    return roomsApi.list(await getToken(), communityId)
  }, [getToken, communityId])

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.brand}>genzh</span>
          <Select
            aria-label="Theme"
            value={theme}
            onValueChange={setTheme}
            options={THEMES}
            className={styles.themeSelect}
          />
        </div>

        <nav className={styles.nav}>
          <div className={styles.navHeading}>Communities</div>

          {communities.loading && <LoadingPanel />}
          {!communities.loading && communities.data?.length === 0 && (
            <EmptyState>No communities yet.</EmptyState>
          )}
          {communities.data?.map((community) => (
            <NavLink
              key={community.id}
              to={`/c/${community.id}`}
              className={({ isActive }) =>
                cx(styles.navItem, isActive && styles.navItemActive)
              }
            >
              <Avatar name={community.name} src={community.icon_url} size="sm" />
              {community.name}
            </NavLink>
          ))}

          {communityId && (
            <>
              <div className={styles.navHeading}>Rooms</div>
              {rooms.loading && <LoadingPanel />}
              {!rooms.loading && rooms.data?.length === 0 && (
                <EmptyState>No rooms yet.</EmptyState>
              )}
              {rooms.data?.map((room) => (
                <NavLink
                  key={room.id}
                  to={`/c/${communityId}/r/${room.id}`}
                  className={({ isActive }) =>
                    cx(styles.navItem, isActive && styles.navItemActive)
                  }
                >
                  <RoomIcon type={room.room_type} />
                  {room.name}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className={styles.footer}>
          <Avatar
            name={user?.profile.display_name ?? '?'}
            src={user?.profile.avatar_url}
            size="sm"
          />
          <div className={styles.identity}>
            <div className={styles.name}>{user?.profile.display_name}</div>
            <div className={styles.handle}>@{user?.handle}</div>
          </div>
          <Tooltip content="Sign out">
            <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label="Sign out">
              <SignOutIcon />
            </Button>
          </Tooltip>
        </div>
      </aside>

      <main className={styles.content}>
        <Outlet context={{ reloadCommunities: communities.reload, reloadRooms: rooms.reload }} />
      </main>
    </div>
  )
}

/** Context handed to child routes so they can refresh the sidebar after
 *  creating a community or a room. */
export interface ShellContext {
  reloadCommunities: () => void
  reloadRooms: () => void
}

function RoomIcon({ type }: { type: string }) {
  if (type === 'text') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M2 4.5A2.5 2.5 0 0 1 4.5 2h7A2.5 2.5 0 0 1 14 4.5v4A2.5 2.5 0 0 1 11.5 11H6l-3.2 2.6A.5.5 0 0 1 2 13.2V4.5Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2.5a2 2 0 0 0-2 2v3a2 2 0 1 0 4 0v-3a2 2 0 0 0-2-2ZM4 7.5a4 4 0 0 0 8 0M8 11.5v2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 14H3.5A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2H6M10.5 11 14 8l-3.5-3M14 8H6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
