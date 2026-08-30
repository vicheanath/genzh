import { useState } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'

import { Sheet } from '@/components/Sheet'
import { UserSettingsModal } from '@/features/settings'
import { useCommunitiesList, useCommunityRoomsQuery, useMyRoomsQuery } from '@/features/api'
import { useAppStore } from '@/lib/store'
import { useIsMobile } from '@/lib/useMediaQuery'

import { AddCommunityDialog } from './AddCommunityDialog'
import { CallDialogs } from './CallDialogs'
import { ProfileDialog } from './ProfileDialog'
import { ChannelSidebar, CommunityRail, MobileNav, MobileTopBar } from './shell'
import { GlobalBroadcastBanner } from './shell/GlobalBroadcastBanner'

import styles from './shell/shell.module.css'

/**
 * The signed-in frame: a community rail, a room sidebar, and the routed screen.
 */
export function AppShell() {
  const { communityId } = useParams<{ communityId?: string }>()
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

  const communities = useCommunitiesList()
  const rooms = useCommunityRoomsQuery(communityId)
  // Direct messages and private playground rooms, for the left sidebar.
  const myRooms = useMyRoomsQuery()

  /*
   * The playground keeps the shell.
   *
   * It used to be full-bleed — no community rail, no channel sidebar — on the
   * argument that a rail of servers over a screen about rooms nobody belongs to
   * describes the wrong app. That cost more than it bought: the feed took the
   * whole window, so leaving it meant finding the one small mode switch
   * floating over a card, and the servers you belong to were invisible from
   * the half of the app you spend idle time in.
   *
   * The feed is a Reels-shaped column inside the content area instead, which
   * is the arrangement Shorts and Reels both settled on: navigation stays put,
   * the moment is a panel in the middle of it. Nothing here has to classify
   * `/rooms/:id` as throwaway or direct any more, which is why the room-list
   * lookup that used to do it is gone.
   */
  const navigation = (
    <>
      <CommunityRail
        communities={communities.data ?? null}
        loading={communities.isLoading}
        onAddClick={() => openAddCommunity()}
      />
      <ChannelSidebar
        communityId={communityId}
        community={communities.data?.find((item) => item.id === communityId)}
        rooms={rooms.data ?? null}
        directRooms={myRooms.data?.filter((r) => r.category === 'dm') ?? []}
        loading={rooms.isLoading || myRooms.isLoading}
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
        <GlobalBroadcastBanner />
        {isMobile && (
          <MobileTopBar
            title={
              communities.data?.find((item) => item.id === communityId)?.name ?? 'genzh'
            }
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        )}

        {/* No context handed down any more: a child route that creates a
            community or a room runs a mutation, and the mutation invalidates
            these queries. The sidebar redraws because its data changed, not
            because the screen remembered to call back into the shell. */}
        <div className={styles.outlet}>
          <Outlet />
        </div>
      </main>

      {isMobile && <MobileNav />}

      <AddCommunityDialog
        open={addCommunityOpen}
        onClose={closeAddCommunity}
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
