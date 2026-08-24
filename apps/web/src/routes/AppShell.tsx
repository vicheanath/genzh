import { useEffect, useState } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'

import { Sheet } from '@/components/Sheet'
import { UserSettingsModal } from '@/features/settings'
import { communities as communitiesApi, rooms as roomsApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAppStore } from '@/lib/store'
import { useAsync } from '@/lib/useAsync'
import { useIsMobile } from '@/lib/useMediaQuery'
import { chatSocket } from '@/lib/ws/ChatSocket'

import { AddCommunityDialog } from './AddCommunityDialog'
import { CallDialogs } from './CallDialogs'
import { ProfileDialog } from './ProfileDialog'
import { ChannelSidebar, CommunityRail, MobileNav, MobileTopBar } from './shell'

import styles from './shell/shell.module.css'

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

      {isMobile && <MobileNav />}

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

      {/* Above every screen in the shell: a call arrives while you are looking
          at something else, by definition. */}
      <CallDialogs />

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
