import { NavLink } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import {
  BellOffIcon,
  CompassIcon,
  FlameIcon,
  GamepadIcon,
  GemIcon,
  HashIcon,
  HeartIcon,
  HelpCircleIcon,
  LockIcon,
  MessageSquareIcon,
  MicIcon,
  PaletteIcon,
  RadioIcon,
  SettingsIcon,
  ShuffleIcon,
  SparkleIcon,
  TagIcon,
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
  // 💬 Conversation
  text: HashIcon,
  voice: MicIcon,
  video: VideoIcon,
  stage: RadioIcon,

  // 🎮 Social Games
  truth_or_dare: SparkleIcon,
  would_you_rather: ShuffleIcon,
  hot_takes: FlameIcon,
  poll: VoteIcon,
  trivia: HelpCircleIcon,
  debate: FlameIcon,
  guess_who: UsersIcon,
  game: GamepadIcon,
  activity: PaletteIcon,

  // 🧭 Social Discovery
  random_chat: ZapIcon,
  anonymous_chat: LockIcon,
  match_interest: TagIcon,
  friend_finder: HeartIcon,
  topic_room: CompassIcon,
  confession: LockIcon,
  quick_chat: ZapIcon,
}

/**
 * How a room type is filed in the sidebar across the 3 pillars:
 * 1. Conversation (Base RTC)
 * 2. Social Games (Interactive mini-games)
 * 3. Social Discovery (Matchmaking & Exploration)
 */
const CHANNEL_GROUPS: ReadonlyArray<{ heading: string; types: readonly string[] }> = [
  {
    heading: 'Conversation',
    types: ['text', 'voice', 'video', 'stage'],
  },
  {
    heading: 'Social Games',
    types: [
      'truth_or_dare',
      'would_you_rather',
      'hot_takes',
      'poll',
      'trivia',
      'debate',
      'guess_who',
      'game',
      'activity',
    ],
  },
  {
    heading: 'Social Discovery',
    types: [
      'random_chat',
      'anonymous_chat',
      'match_interest',
      'friend_finder',
      'topic_room',
      'confession',
      'quick_chat',
    ],
  },
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
            {/* The playground is not in this list. It is the *other* half of
                the app, reached through the mode switch rather than through a
                nav item alongside the community screens — a link to it here
                read as one more feature of this side. */}
            <NavGroup heading="Servers">
              <NavItem
                to="/servers"
                end
                label="Your Servers"
                leading={<UsersIcon size={17} className={styles.navIcon} />}
              />
              <NavItem
                to="/friends"
                label="Friends"
                leading={<MessageSquareIcon size={17} className={styles.navIcon} />}
              />
              <NavItem
                to="/explore"
                label="Explore Communities"
                leading={<CompassIcon size={17} className={styles.navIcon} />}
              />
              <NavItem
                to="/rewards"
                label="Rewards & Store"
                leading={<GemIcon size={17} className={styles.navIcon} />}
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
