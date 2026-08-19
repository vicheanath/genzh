import { useState } from 'react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import {
  CheckIcon,
  HashIcon,
  HomeIcon,
  MenuIcon,
  MicIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SignOutIcon,
  SparkleIcon,
  SunIcon,
  UsersIcon,
  VideoIcon,
} from '@/components/Icons'
import { Menu, MenuItem, MenuSeparator } from '@/components/Menu'
import { Sheet } from '@/components/Sheet'
import { Skeleton } from '@/components/Skeleton'
import { Tooltip } from '@/components/Tooltip'
import {
  communities as communitiesApi,
  rooms as roomsApi,
  type Community,
  type Room,
  type RoomType,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAsync } from '@/lib/useAsync'
import { useIsMobile } from '@/lib/useMediaQuery'
import { useTheme, type Theme } from '@/lib/useTheme'

import { ProfileDialog } from './ProfileDialog'

import styles from './AppShell.module.css'

/**
 * The signed-in frame: a community rail, a room sidebar, and the routed screen.
 *
 * Navigation is fetched once here rather than per screen, because every screen
 * shows it. The two lists are the app's only cross-route data dependency, and
 * child routes refresh them through {@link ShellContext} after creating
 * something.
 *
 * On a phone the rail and sidebar move into a drawer and the whole thing gets a
 * bottom tab bar — the same components, mounted somewhere else, rather than a
 * second navigation written twice.
 */
export function AppShell() {
  const { communityId } = useParams<{ communityId?: string }>()
  const { getToken } = useAuth()
  const isMobile = useIsMobile()
  const location = useLocation()

  // The drawer remembers *where* it was opened rather than merely that it is
  // open, so any navigation closes it without an effect watching the location.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const drawerOpen = openedAt === location.pathname
  const setDrawerOpen = (open: boolean) => setOpenedAt(open ? location.pathname : null)

  const communities = useAsync(
    async () => communitiesApi.list(await getToken()),
    [getToken],
  )

  const rooms = useAsync(async () => {
    if (!communityId) return []
    return roomsApi.list(await getToken(), communityId)
  }, [getToken, communityId])

  const navigation = (
    <>
      <CommunityRail communities={communities.data} loading={communities.loading} />
      <ChannelSidebar
        communityId={communityId}
        community={communities.data?.find((item) => item.id === communityId)}
        rooms={rooms.data}
        loading={rooms.loading}
      />
    </>
  )

  return (
    <div className={styles.shell}>
      {!isMobile && <div className={styles.navigation}>{navigation}</div>}

      {isMobile && (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen} title="Navigation">
          <div className={styles.drawerBody}>{navigation}</div>
        </Sheet>
      )}

      <main className={styles.content}>
        {isMobile && (
          <MobileTopBar
            title={
              communities.data?.find((item) => item.id === communityId)?.name ?? 'genzh'
            }
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        )}

        <div className={styles.outlet}>
          <Outlet
            context={
              {
                reloadCommunities: communities.reload,
                reloadRooms: rooms.reload,
              } satisfies ShellContext
            }
          />
        </div>
      </main>

      {isMobile && <MobileNav />}
    </div>
  )
}

/** Context handed to child routes so they can refresh navigation after
 *  creating a community or a room. */
export interface ShellContext {
  reloadCommunities: () => void
  reloadRooms: () => void
}

// ── the rail ───────────────────────────────────────────────────────────────

/**
 * The community strip.
 *
 * Icons only, because it is a switcher and not a directory: at a glance you are
 * picking a place you already know, and the names are one hover away.
 */
function CommunityRail({
  communities,
  loading,
}: {
  communities: Community[] | null
  loading: boolean
}) {
  return (
    <nav className={styles.rail} aria-label="Communities">
      <Tooltip content="Home" side="right">
        <NavLink
          to="/"
          end
          className={({ isActive }) => cx(styles.railItem, isActive && styles.railItemActive)}
          aria-label="Home"
        >
          <span className={styles.railPill} aria-hidden />
          <span className={styles.railGlyph}>
            <HomeIcon size={20} />
          </span>
        </NavLink>
      </Tooltip>

      <Tooltip content="Friends" side="right">
        <NavLink
          to="/friends"
          className={({ isActive }) => cx(styles.railItem, isActive && styles.railItemActive)}
          aria-label="Friends"
        >
          <span className={styles.railPill} aria-hidden />
          <span className={styles.railGlyph}>
            <UsersIcon size={20} />
          </span>
        </NavLink>
      </Tooltip>

      <div className={styles.railDivider} />

      {loading &&
        Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} circle width="2.75rem" height="2.75rem" />
        ))}

      {communities?.map((community) => (
        <Tooltip key={community.id} content={community.name} side="right">
          <NavLink
            to={`/c/${community.id}`}
            className={({ isActive }) => cx(styles.railItem, isActive && styles.railItemActive)}
            aria-label={community.name}
          >
            <span className={styles.railPill} aria-hidden />
            <Avatar name={community.name} src={community.icon_url} size="md" />
          </NavLink>
        </Tooltip>
      ))}

      <Tooltip content="Add a community" side="right">
        <NavLink to="/" end className={cx(styles.railItem, styles.railAdd)} aria-label="Add a community">
          <span className={styles.railGlyph}>
            <PlusIcon size={20} />
          </span>
        </NavLink>
      </Tooltip>
    </nav>
  )
}

// ── the sidebar ────────────────────────────────────────────────────────────

const ROOM_ICONS: Record<RoomType, typeof HashIcon> = {
  text: HashIcon,
  voice: MicIcon,
  video: VideoIcon,
  activity: SparkleIcon,
}

/** The rooms inside the selected community, plus the signed-in user's bar. */
function ChannelSidebar({
  communityId,
  community,
  rooms,
  loading,
}: {
  communityId?: string
  community?: Community
  rooms: Room[] | null
  loading: boolean
}) {
  // Voice rooms sit apart from text ones: joining one is a commitment (a
  // microphone opens), and mixing the two lists invites a misclick.
  const text = rooms?.filter((room) => room.room_type === 'text') ?? []
  const live = rooms?.filter((room) => room.room_type !== 'text') ?? []

  return (
    <div className={styles.sidebar}>
      <header className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>{community?.name ?? 'genzh'}</span>
        {community && (
          <NavLink
            to={`/c/${community.id}`}
            end
            className={styles.sidebarSettings}
            aria-label="Community settings"
          >
            <SettingsIcon size={15} />
          </NavLink>
        )}
      </header>

      <nav className={styles.nav} aria-label="Rooms">
        {!communityId && (
          <p className={styles.sidebarHint}>
            Pick a community from the rail, or create one from Home.
          </p>
        )}

        {communityId && loading && (
          <div className={styles.navSkeleton}>
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} height="1.9rem" />
            ))}
          </div>
        )}

        {communityId && !loading && (
          <>
            <RoomGroup label="Text" rooms={text} communityId={communityId} />
            <RoomGroup label="Voice & video" rooms={live} communityId={communityId} />
            {rooms?.length === 0 && (
              <p className={styles.sidebarHint}>
                No rooms yet. Create the first one from the community page.
              </p>
            )}
          </>
        )}
      </nav>

      <UserBar />
    </div>
  )
}

function RoomGroup({
  label,
  rooms,
  communityId,
}: {
  label: string
  rooms: Room[]
  communityId: string
}) {
  if (rooms.length === 0) return null

  return (
    <section className={styles.group}>
      <h2 className={styles.groupHeading}>{label}</h2>
      {rooms.map((room) => {
        const Icon = ROOM_ICONS[room.room_type] ?? HashIcon
        return (
          <NavLink
            key={room.id}
            to={`/c/${communityId}/r/${room.id}`}
            className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
          >
            <Icon size={17} className={styles.navIcon} />
            <span className={styles.navLabel}>{room.name}</span>
          </NavLink>
        )
      })}
    </section>
  )
}

// ── the user bar ───────────────────────────────────────────────────────────

const THEME_ITEMS: ReadonlyArray<{ value: Theme; label: string; icon: typeof SunIcon }> = [
  { value: 'system', label: 'System', icon: MonitorIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
]

function UserBar() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [editing, setEditing] = useState(false)

  return (
    <>
      <div className={styles.userBar}>
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

        <Menu
          side="top"
          align="end"
          trigger={
            <Button variant="ghost" size="sm" iconOnly aria-label="Account menu">
              <SettingsIcon size={16} />
            </Button>
          }
        >
          <MenuItem icon={<SettingsIcon size={15} />} onClick={() => setEditing(true)}>
            Edit profile
          </MenuItem>

          <MenuSeparator />

          {THEME_ITEMS.map(({ value, label, icon: Icon }) => (
            <MenuItem
              key={value}
              icon={theme === value ? <CheckIcon size={15} /> : <Icon size={15} />}
              // `closeOnClick={false}` keeps the menu open while cycling
              // themes, so the effect of each choice is visible immediately.
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

      <ProfileDialog open={editing} onOpenChange={setEditing} />
    </>
  )
}

// ── mobile chrome ──────────────────────────────────────────────────────────

function MobileTopBar({
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

function MobileNav() {
  return (
    <nav className={styles.mobileNav} aria-label="Main">
      <NavLink
        to="/"
        end
        className={({ isActive }) => cx(styles.mobileNavItem, isActive && styles.mobileNavItemActive)}
      >
        <HomeIcon size={20} />
        Home
      </NavLink>
      <NavLink
        to="/friends"
        className={({ isActive }) => cx(styles.mobileNavItem, isActive && styles.mobileNavItemActive)}
      >
        <UsersIcon size={20} />
        Friends
      </NavLink>
    </nav>
  )
}
