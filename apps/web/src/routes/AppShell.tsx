import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import {
  CheckIcon,
  CompassIcon,
  FlameIcon,
  GamepadIcon,
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
  PaletteIcon,
  PhoneOffIcon,
  PlusIcon,
  RadioIcon,
  SettingsIcon,
  SignOutIcon,
  SparkleIcon,
  SunIcon,
  UsersIcon,
  VideoIcon,
  VoteIcon,
  ZapIcon,
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
  type UserRoom,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useVoice } from '@/lib/media'
import { useAppStore } from '@/lib/store'
import { useAsync } from '@/lib/useAsync'
import { useIsMobile } from '@/lib/useMediaQuery'
import { useProfiles } from '@/lib/useProfiles'
import { useTheme, type Theme } from '@/lib/useTheme'
import { chatSocket } from '@/lib/ws/ChatSocket'

import { UserSettingsModal } from '@/features/settings'

import { AddCommunityDialog } from './AddCommunityDialog'
import { ProfileDialog } from './ProfileDialog'


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

  const rooms = useAsync(
    async () => (communityId ? roomsApi.list(await getToken(), communityId) : null),
    [communityId, getToken],
  )

  // Load user's direct message / private playground rooms for the left sidebar
  const myRooms = useAsync(
    async () => roomsApi.mine(await getToken()),
    [getToken],
  )

  // The shell owns the socket, not the chat transcript.
  //
  // It used to connect only when a room was open, which meant somebody sitting
  // on Friends or Explore had no connection at all — and so never heard that a
  // conversation had been opened with them. The sidebar is always mounted, so
  // this is the one place that can hold it for the whole session.
  const reloadMyRooms = myRooms.reload
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const token = await getToken()
        if (!cancelled) chatSocket.setToken(token)
      } catch {
        // Not signed in yet, or the refresh failed; the socket stays down and
        // the sidebar falls back to what it fetched.
      }
    })()

    // Both participants get this, so the conversation appears for the person
    // who opened it and the person who was messaged, without either reloading.
    const off = chatSocket.on('direct_room_opened', () => reloadMyRooms())

    return () => {
      cancelled = true
      off()
    }
  }, [getToken, reloadMyRooms])

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
      <Tooltip content="Direct Messages" side="right">
        <NavLink
          to="/"
          end
          className={({ isActive }) => cx(styles.railItem, isActive && styles.railItemActive)}
          aria-label="Direct Messages"
        >
          <span className={styles.railPill} aria-hidden />
          <span className={styles.railGlyph}>
            <MessageSquareIcon size={20} />
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
          <span className={styles.railPill} aria-hidden />
          <span className={styles.railGlyph}>
            <PlusIcon size={20} className={styles.railAddIcon} />
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
  stage: RadioIcon,
  video: VideoIcon,
  debate: FlameIcon,
  poll: VoteIcon,
  game: GamepadIcon,
  confession: LockIcon,
  quick_chat: ZapIcon,
  activity: PaletteIcon,
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
  directRooms?: UserRoom[]
  loading: boolean
  onOpenSettings: () => void
}) {
  const textChannels =
    rooms?.filter(
      (room) =>
        room.room_type === 'text' ||
        room.room_type === 'quick_chat' ||
        room.room_type === 'confession',
    ) ?? []
  const voiceChannels =
    rooms?.filter(
      (room) =>
        room.room_type === 'voice' ||
        room.room_type === 'stage' ||
        room.room_type === 'video',
    ) ?? []
  const experienceChannels =
    rooms?.filter(
      (room) =>
        room.room_type === 'poll' ||
        room.room_type === 'debate' ||
        room.room_type === 'game' ||
        room.room_type === 'activity',
    ) ?? []

  return (
    <div className={styles.sidebar}>
      <header className={styles.sidebarHeader}>
        {/* Outside a community the header is the wordmark, so it gets the
            gradient; a community's own name stays plain text. */}
        <span className={cx(styles.sidebarTitle, !community && styles.sidebarBrand)}>
          {community?.name ?? 'genzh'}
        </span>
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
                <DirectMessageList rooms={directRooms} />
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
            <RoomGroup label="Text Channels" rooms={textChannels} communityId={communityId} />
            <RoomGroup label="Voice & Stage Channels" rooms={voiceChannels} communityId={communityId} />
            <RoomGroup label="Experience Lounges" rooms={experienceChannels} communityId={communityId} />
            {rooms?.length === 0 && (
              <p className={styles.sidebarHint}>
                No rooms yet. Create the first one from the community page.
              </p>
            )}
          </>
        )}
      </nav>

      <VoiceConnectionBar />
      <UserBar onOpenSettings={onOpenSettings} />
    </div>
  )
}

/**
 * The caller's direct conversations, each shown as the person it is with.
 *
 * A DM's stored name is fixed to whoever opened it ("DM: @bob"), so rendering
 * it names the wrong person for the other half of every conversation — Bob's
 * own sidebar would list a chat with Bob. The server resolves the peer per
 * caller as `dm_peer_id`; this looks up that profile for the avatar and the
 * display name, and falls back to the stored name only when a room predates
 * the field or the profile has not loaded yet.
 */
function DirectMessageList({ rooms }: { rooms: UserRoom[] }) {
  const peerIds = rooms.flatMap((room) => (room.dm_peer_id ? [room.dm_peer_id] : []))
  const lookup = useProfiles(peerIds)

  return (
    <>
      {rooms.map((dm) => {
        const peer = dm.dm_peer_id ? lookup(dm.dm_peer_id) : null
        const label = peer?.display_name ?? dm.name.replace(/^DM:\s*/, '')

        return (
          <NavLink
            key={dm.id}
            to={`/rooms/${dm.id}`}
            className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
          >
            {peer ? (
              <Avatar
                name={peer.display_name}
                src={peer.avatar_url}
                color={peer.accent_color}
                size="xs"
                presence="online"
              />
            ) : (
              <MessageSquareIcon size={16} className={styles.navIcon} />
            )}
            <span className={styles.navLabel}>{label}</span>
          </NavLink>
        )
      })}
    </>
  )
}

function VoiceConnectionBar() {
  const voice = useVoice()
  const navigate = useNavigate()

  if (!voice.activeRoomId || voice.status === 'idle') return null

  const isConnected = voice.status === 'connected'
  const isConnecting = voice.status === 'connecting' || voice.status === 'reconnecting'

  const targetUrl = voice.activeCommunityId
    ? `/c/${voice.activeCommunityId}/r/${voice.activeRoomId}`
    : `/rooms/${voice.activeRoomId}`

  return (
    <div className={styles.voiceBar}>
      <div
        className={styles.voiceBarInfo}
        onClick={() => void navigate(targetUrl)}
        title="Click to go to active voice room"
      >
        <div className={styles.voiceBarStatus}>
          <span
            className={cx(styles.voiceDot, isConnected && styles.voiceDotConnected)}
            aria-hidden
          />
          <span className={styles.voiceStatusText}>
            {isConnected ? 'Voice Connected' : isConnecting ? 'Connecting…' : 'Disconnected'}
          </span>
        </div>
        <div className={styles.voiceRoomName}>
          {voice.activeRoomName || 'Voice Channel'}
        </div>
      </div>

      <div className={styles.voiceBarActions}>
        <Tooltip content={voice.muted ? 'Unmute' : 'Mute'}>
          <button
            type="button"
            className={cx(styles.voiceActionBtn, voice.muted && styles.voiceActionMuted)}
            onClick={() => voice.toggleMute()}
            aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {voice.muted ? <MicOffIcon size={15} /> : <MicIcon size={15} />}
          </button>
        </Tooltip>

        <Tooltip content="Disconnect from voice">
          <button
            type="button"
            className={cx(styles.voiceActionBtn, styles.voiceDisconnectBtn)}
            onClick={() => void voice.leave()}
            aria-label="Disconnect from voice"
          >
            <PhoneOffIcon size={15} />
          </button>
        </Tooltip>
      </div>
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
