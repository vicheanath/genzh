import { NavLink } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import {
  BellOffIcon,
  CompassIcon,
  FlameIcon,
  GamepadIcon,
  HashIcon,
  LockIcon,
  MicIcon,
  PaletteIcon,
  RadioIcon,
  SettingsIcon,
  SparkleIcon,
  UsersIcon,
  VideoIcon,
  VoteIcon,
  ZapIcon,
} from '@/components/Icons'
import { Skeleton } from '@/components/Skeleton'
import { useUnreadOverviewQuery } from '@/features/api'
import type { Community, Room, UserRoom } from '@/lib/api'
import { cx } from '@/lib/cx'

import { DirectMessageList } from './DirectMessageList'
import { NavGroup, NavItem } from './NavItem'
import { UserBar } from './UserBar'
import { VoiceConnectionBar } from './VoiceConnectionBar'
import styles from './shell.module.css'

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

/**
 * How a room type is filed in the sidebar.
 *
 * The grouping lived as three inline `filter` chains that each restated the
 * membership of a group; a room type added in one and forgotten in another
 * simply vanished from the sidebar. One table means a new type is filed in one
 * place, and anything unlisted is visibly missing rather than silently gone.
 */
const CHANNEL_GROUPS: ReadonlyArray<{ heading: string; types: readonly string[] }> = [
  { heading: 'Text Channels', types: ['text', 'quick_chat', 'confession'] },
  { heading: 'Voice & Stage', types: ['voice', 'stage', 'video'] },
  { heading: 'Experience Lounges', types: ['poll', 'debate', 'game', 'activity'] },
]

/**
 * The second column: where you are, and everywhere you can go inside it.
 *
 * Composed of parts rather than written as one block, so the same rows can be
 * assembled differently elsewhere — the phone's drawer mounts this whole
 * component, but a narrower view could take just the groups.
 */
export function ChannelSidebar({
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
  const unreadOverview = useUnreadOverviewQuery()
  const unreadMap = new Map((unreadOverview.data ?? []).map((u) => [u.room_id, u]))

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
            <NavGroup heading="Social & Playground">
              <NavItem
                to="/"
                end
                label="Discover Moments"
                leading={<SparkleIcon size={17} className={styles.navIcon} />}
              />
              <NavItem
                to="/friends"
                label="Friends"
                leading={<UsersIcon size={17} className={styles.navIcon} />}
              />
              <NavItem
                to="/explore"
                label="Explore Communities"
                leading={<CompassIcon size={17} className={styles.navIcon} />}
              />
            </NavGroup>

            {directRooms.length > 0 && (
              <NavGroup heading="Direct Messages">
                <DirectMessageList rooms={directRooms} unreadMap={unreadMap} />
              </NavGroup>
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
            {CHANNEL_GROUPS.map(({ heading, types }) => {
              const inGroup = (rooms ?? []).filter((room) => types.includes(room.room_type))
              if (inGroup.length === 0) return null

              return (
                <NavGroup key={heading} heading={heading}>
                  {inGroup.map((room) => {
                    const Icon = ROOM_ICONS[room.room_type] ?? HashIcon
                    const unreadEntry = unreadMap.get(room.id)
                    const count = unreadEntry?.unread ?? 0
                    const muted = unreadEntry?.muted ?? false

                    return (
                      <NavItem
                        key={room.id}
                        to={`/c/${communityId}/r/${room.id}`}
                        label={room.name}
                        leading={<Icon size={17} className={styles.navIcon} />}
                        trailing={
                          count > 0 || muted ? (
                            <div className={styles.navTrailing}>
                              {muted && <BellOffIcon size={12} className={styles.navMutedIcon} />}
                              {count > 0 && (
                                <Badge tone={muted ? 'neutral' : 'accent'}>{count}</Badge>
                              )}
                            </div>
                          ) : undefined
                        }
                      />
                    )
                  })}
                </NavGroup>
              )
            })}

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
