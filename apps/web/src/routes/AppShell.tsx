import { useState } from 'react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import {
  CheckIcon,
  CompassIcon,
  HashIcon,
  HeadphonesIcon,
  HomeIcon,
  LockIcon,
  MenuIcon,
  MessageSquareIcon,
  MicIcon,
  MicOffIcon,
  MonitorIcon,
  MoonIcon,
  PhoneOffIcon,
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
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAppStore } from '@/lib/store'
import { useAsync } from '@/lib/useAsync'
import { useIsMobile } from '@/lib/useMediaQuery'
import { useTheme, type Theme } from '@/lib/useTheme'

import { AddCommunityDialog } from './AddCommunityDialog'
import { ProfileDialog } from './ProfileDialog'
import { UserSettingsModal } from './UserSettingsModal'

import styles from './AppShell.module.css'

/**
 * The signed-in frame: a community rail, a room sidebar, and the routed screen.
 */
export function AppShell() {
  const { communityId } = useParams<{ communityId?: string }>()
  const { getToken } = useAuth()
  const isMobile = useIsMobile()
  const location = useLocation()

  const addCommunityOpen = useAppStore((s) => s.addCommunityOpen)
  const openAddCommunity = useAppStore((s) => s.openAddCommunity)
  const closeAddCommunity = useAppStore((s) => s.closeAddCommunity)

  const userSettingsOpen = useAppStore((s) => s.userSettingsOpen)
  const openUserSettings = useAppStore((s) => s.openUserSettings)
  const closeUserSettings = useAppStore((s) => s.closeUserSettings)

  const profileUserId = useAppStore((s) => s.profileUserId)
  const profileOpen = useAppStore((s) => s.profileOpen)
  const closeProfile = useAppStore((s) => s.closeProfile)

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

  const myRooms = useAsync(async () => {
    if (communityId) return []
    return roomsApi.mine(await getToken())
  }, [getToken, communityId])

  const navigation = (
    <>
      <CommunityRail
        communities={communities.data}
        loading={communities.loading}
        onAddClick={() => openAddCommunity()}
      />
      <ChannelSidebar
        communityId={communityId}
        community={communities.data?.find((item) => item.id === communityId)}
        rooms={rooms.data}
        directRooms={myRooms.data?.filter((r) => r.category === 'dm') ?? []}
        loading={rooms.loading || myRooms.loading}
        onOpenSettings={() => openUserSettings()}
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
                reloadMyRooms: myRooms.reload,
              } satisfies ShellContext
            }
          />
        </div>
      </main>

      {isMobile && <MobileNav onOpenAdd={() => openAddCommunity()} />}

      <AddCommunityDialog
        open={addCommunityOpen}
        onClose={closeAddCommunity}
        onCreated={() => {
          communities.reload()
        }}
      />

      <UserSettingsModal
        open={userSettingsOpen}
        onClose={closeUserSettings}
      />

      {profileUserId && (
        <ProfileDialog
          open={profileOpen}
          onOpenChange={(open) => {
            if (!open) closeProfile()
          }}
          targetUserId={profileUserId}
        />
      )}
    </div>
  )
}

/** Context handed to child routes so they can refresh navigation after
 *  creating a community or a room. */
export interface ShellContext {
  reloadCommunities: () => void
  reloadRooms: () => void
  reloadMyRooms?: () => void
}

// ── the rail ───────────────────────────────────────────────────────────────

function CommunityRail({
  communities,
  loading,
  onAddClick,
}: {
  communities: Community[] | null
  loading: boolean
  onAddClick: () => void
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

      <Tooltip content="Explore Communities" side="right">
        <NavLink
          to="/explore"
          className={({ isActive }) => cx(styles.railItem, isActive && styles.railItemActive)}
          aria-label="Explore Communities"
        >
          <span className={styles.railPill} aria-hidden />
          <span className={styles.railGlyph}>
            <CompassIcon size={20} />
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

      <Tooltip content="Add a Server" side="right">
        <button
          type="button"
          className={cx(styles.railItem, styles.railAdd)}
          onClick={onAddClick}
          aria-label="Add a Server"
        >
          <span className={styles.railGlyph}>
            <PlusIcon size={20} />
          </span>
        </button>
      </Tooltip>
    </nav>
  )
}

// ── the sidebar ────────────────────────────────────────────────────────────

const ROOM_ICONS: Record<string, typeof HashIcon> = {
  text: HashIcon,
  voice: MicIcon,
  video: VideoIcon,
  activity: SparkleIcon,
  stage: VideoIcon,
  poll: SparkleIcon,
  debate: SparkleIcon,
  game: SparkleIcon,
  confession: LockIcon,
  quick_chat: HashIcon,
}

function ChannelSidebar({
  communityId,
  community,
  rooms,
  directRooms = [],
  loading,
  onOpenSettings,
}: {
  communityId?: string
  community?: Community
  rooms: Room[] | null
  directRooms?: Room[]
  loading: boolean
  onOpenSettings: () => void
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

      <nav className={styles.nav} aria-label="Navigation">
        {!communityId && (
          <>
            <div className={styles.group}>
              <h2 className={styles.groupHeading}>Social & Playground</h2>
              <NavLink
                to="/"
                end
                className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
              >
                <SparkleIcon size={17} className={styles.navIcon} />
                <span className={styles.navLabel}>Discover Moments</span>
              </NavLink>
              <NavLink
                to="/friends"
                className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
              >
                <UsersIcon size={17} className={styles.navIcon} />
                <span className={styles.navLabel}>Friends</span>
              </NavLink>
              <NavLink
                to="/explore"
                className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
              >
                <CompassIcon size={17} className={styles.navIcon} />
                <span className={styles.navLabel}>Explore Communities</span>
              </NavLink>
            </div>

            {directRooms.length > 0 && (
              <div className={styles.group}>
                <h2 className={styles.groupHeading}>Direct Messages</h2>
                {directRooms.map((dm) => (
                  <NavLink
                    key={dm.id}
                    to={`/rooms/${dm.id}`}
                    className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
                  >
                    <MessageSquareIcon size={16} className={styles.navIcon} />
                    <span className={styles.navLabel}>{dm.name.replace(/^DM:\s*/, '')}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </>
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
            <RoomGroup label="Text Channels" rooms={text} communityId={communityId} />
            <RoomGroup label="Voice & Video" rooms={live} communityId={communityId} />
            {rooms?.length === 0 && (
              <p className={styles.sidebarHint}>
                No rooms yet. Create the first one from the community page.
              </p>
            )}
          </>
        )}
      </nav>

      <UserBar onOpenSettings={onOpenSettings} />
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

function UserBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const isMuted = useAppStore((s) => s.isMuted)
  const isDeafened = useAppStore((s) => s.isDeafened)
  const toggleMute = useAppStore((s) => s.toggleMute)
  const toggleDeafen = useAppStore((s) => s.toggleDeafen)

  return (
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

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={toggleMute}
        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        style={isMuted ? { color: 'var(--color-danger, #ed4245)' } : undefined}
      >
        {isMuted ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={toggleDeafen}
        aria-label={isDeafened ? 'Undeafen audio' : 'Deafen audio'}
        style={isDeafened ? { color: 'var(--color-danger, #ed4245)' } : undefined}
      >
        {isDeafened ? <PhoneOffIcon size={16} /> : <HeadphonesIcon size={16} />}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={onOpenSettings}
        aria-label="User Settings"
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
          User Settings
        </MenuItem>

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

function MobileNav({ onOpenAdd }: { onOpenAdd: () => void }) {
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
      <NavLink
        to="/explore"
        className={({ isActive }) => cx(styles.mobileNavItem, isActive && styles.mobileNavItemActive)}
      >
        <CompassIcon size={20} />
        Explore
      </NavLink>
      <button
        type="button"
        className={styles.mobileNavItem}
        onClick={onOpenAdd}
      >
        <PlusIcon size={20} />
        Add Server
      </button>
    </nav>
  )
}
