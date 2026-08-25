import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import {
  CompassIcon,
  FlameIcon,
  GamepadIcon,
  HashIcon,
  LockIcon,
  MicIcon,
  PaletteIcon,
  PlusIcon,
  RadioIcon,
  SparkleIcon,
  UsersIcon,
  VideoIcon,
  VoteIcon,
  ZapIcon,
} from '@/components/Icons'
import { Skeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { Toggle, ToggleGroup } from '@/components/ToggleGroup'
import type { Room } from '@/lib/api'
import {
  useCommunitiesList,
  useDiscoveryRooms,
  useRandomRoomMutation,
  useRecommendedRooms,
} from '@/features/api'

import { CreatePlaygroundRoomDialog } from './CreatePlaygroundRoomDialog'
import { RecommendationReason } from './RecommendationReason'
import styles from './HomeRoute.module.css'

const ROOM_TYPE_ICONS: Record<string, typeof HashIcon> = {
  text: HashIcon,
  voice: MicIcon,
  video: VideoIcon,
  stage: RadioIcon,
  activity: PaletteIcon,
  poll: VoteIcon,
  debate: FlameIcon,
  game: GamepadIcon,
  confession: LockIcon,
  quick_chat: ZapIcon,
}

/** Stands in for "no filter" — a toggle group needs a value for every option. */
const ALL_CATEGORIES = 'all'

export function HomeRoute() {
  const navigate = useNavigate()
  const toast = useToast()

  const [createRoomOpen, setCreateRoomOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const communities = useCommunitiesList()
  const discovery = useDiscoveryRooms(selectedCategory || undefined)
  const suggested = useRecommendedRooms(selectedCategory || undefined, 6)
  const findRandomRoom = useRandomRoomMutation()
  const matching = findRandomRoom.isPending

  async function handleFindRandomRoom() {
    try {
      const room = await findRandomRoom.mutateAsync({
        category: selectedCategory || undefined,
      })
      if (room) {
        toast.success(`Entering ${room.name}!`)
        void navigate(`/rooms/${room.id}`)
      } else {
        toast.success('No active rooms in this topic', 'Starting one now!')
        setCreateRoomOpen(true)
      }
    } catch {
      toast.error('Could not find a random room right now')
    }
  }

  const categoryList = [
    { key: null, label: '✨ All Moments' },
    { key: 'gaming', label: '🎮 Gaming' },
    { key: 'debate', label: '🔥 Debates' },
    { key: 'confession', label: '🤫 Confessions' },
    { key: 'tech', label: '💻 Tech & Code' },
    { key: 'music', label: '🎵 Music' },
    { key: 'memes', label: '😂 Memes' },
    { key: 'random', label: '🎲 Random' },
  ]

  return (
    <div className={styles.scroll}>
      <div className={styles.page}>
        {/* Playground Hero Banner */}
        <section className={styles.heroCard}>
          <div className={styles.heroContent}>
            <div className={styles.greeting}>
              Anonymous Social Playground
            </div>
            <h1 className={styles.title}>Don't join communities. Join moments.</h1>
            <p className={styles.lede}>
              Discover vibrant live conversations, poll strangers, drop confessions, or debate unpopular opinions anonymously.
            </p>
          </div>

          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.randomButton}
              onClick={() => void handleFindRandomRoom()}
              disabled={matching}
            >
              {matching ? <Spinner /> : <span>🎲</span>}
              <span>Find Something Fun</span>
            </button>

            <Button
              variant="secondary"
              onClick={() => setCreateRoomOpen(true)}
            >
              <PlusIcon size={16} />
              Start a Moment
            </Button>
          </div>
        </section>

        {/* Categories Bar */}
        {/* A single-choice filter, so the group owns the value and the arrow
            keys move through it. "All" is the sentinel for no filter: clearing
            the pressed pill lands on the same state, which is why deselecting
            is allowed to fall through to it rather than being blocked. */}
        <ToggleGroup
          variant="loose"
          size="sm"
          className={styles.categories}
          aria-label="Filter moments by category"
          value={[selectedCategory ?? ALL_CATEGORIES]}
          onValueChange={(next) => {
            const picked = next[0]
            setSelectedCategory(picked && picked !== ALL_CATEGORIES ? String(picked) : null)
          }}
        >
          {categoryList.map(({ key, label }) => (
            <Toggle key={label} value={key ?? ALL_CATEGORIES}>
              {label}
            </Toggle>
          ))}
        </ToggleGroup>

        {/* ✨ Ranked for this account, when there is anything to rank.
            Additive rather than a replacement for trending below: the feed has
            to work signed-out and for an account that has already seen
            everything, and both of those fall through to the generic list. */}
        <ForYouSection query={suggested} />

        {/* 🔥 Trending & Active Moments */}
        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <span>🔥 Trending Moments</span>
              {discovery.data?.rooms && <Badge>{discovery.data.rooms.length}</Badge>}
            </h2>
          </div>

          {discovery.isLoading && (
            <div className={styles.roomsGrid}>
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className={styles.roomCard}>
                  <Skeleton width="40%" height="0.9rem" />
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <Skeleton width="80%" height="1.1rem" />
                  </div>
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <Skeleton width="95%" height="0.85rem" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!discovery.isLoading && (!discovery.data?.rooms || discovery.data.rooms.length === 0) && (
            <div className={styles.empty}>
              <span className={styles.emptyMark} aria-hidden>
                <SparkleIcon size={22} />
              </span>
              <div>
                <p>No active moments right now in this category.</p>
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Button size="sm" onClick={() => setCreateRoomOpen(true)}>
                    <PlusIcon size={15} />
                    Start the First Room
                  </Button>
                </div>
              </div>
            </div>
          )}

          {discovery.data?.rooms && discovery.data.rooms.length > 0 && (
            <div className={styles.roomsGrid}>
              {(discovery.data.rooms as Room[]).map((room: Room) => {
                const Icon = ROOM_TYPE_ICONS[room.room_type] ?? HashIcon
                return (
                  <Link
                    key={room.id}
                    to={room.community_id ? `/c/${room.community_id}/r/${room.id}` : `/rooms/${room.id}`}
                    className={styles.roomCard}
                  >
                    <div className={styles.roomCardHead}>
                      <span className={styles.roomTypeTag}>
                        <Icon size={14} />
                        {room.room_type.replace('_', ' ')}
                      </span>
                      <span className={styles.participantCount}>
                        <UsersIcon size={12} />
                        {room.current_participants || 1}
                      </span>
                    </div>

                    <h3 className={styles.roomName}>{room.name}</h3>
                    <p className={styles.roomTopic}>
                      {room.topic || `Join this ${room.category} session and chat anonymously.`}
                    </p>

                    <div className={styles.roomCardFooter}>
                      {room.is_anonymous ? (
                        <span className={styles.anonPill}>
                          <LockIcon size={12} />
                          Anonymous
                        </span>
                      ) : (
                        <span className={styles.anonPill}>
                          Public
                        </span>
                      )}
                      <Button size="sm" variant="ghost">
                        Enter →
                      </Button>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* 👥 Your Persistent Communities */}
        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Your Communities</h2>
            <Link to="/explore">
              <Button size="sm" variant="ghost">
                <CompassIcon size={15} />
                Explore Servers
              </Button>
            </Link>
          </div>

          {communities.isLoading && (
            <div className={styles.grid}>
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className={styles.card}>
                  <Skeleton circle width="2.375rem" height="2.375rem" />
                  <div className={styles.cardBody} style={{ flex: 1 }}>
                    <Skeleton width="70%" height="1rem" />
                    <div style={{ marginTop: '0.35rem' }}>
                      <Skeleton width="90%" height="0.75rem" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!communities.isLoading && (!communities.data || communities.data.length === 0) && (
            <div className={styles.empty}>
              <span className={styles.emptyMark} aria-hidden>
                <CompassIcon size={22} />
              </span>
              <div>
                <p>You haven't joined any persistent communities yet.</p>
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Link to="/explore">
                    <Button size="sm">
                      <CompassIcon size={15} />
                      Browse Communities
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {communities.data && communities.data.length > 0 && (
            <div className={styles.grid}>
              {communities.data.map((community) => (
                <Link
                  key={community.id}
                  to={`/c/${community.id}`}
                  className={styles.card}
                >
                  <Avatar name={community.name} src={community.icon_url} size="md" />
                  <div className={styles.cardBody}>
                    <div className={styles.cardName}>{community.name}</div>
                    <div className={styles.cardDescription}>
                      {community.description ?? 'Server'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <CreatePlaygroundRoomDialog
        open={createRoomOpen}
        onClose={() => setCreateRoomOpen(false)}
      />
    </div>
  )
}

/**
 * "For you" — moments ranked for the signed-in account.
 *
 * Renders nothing at all when there is nothing to show. That is the common
 * case rather than an edge one: a viewer who has already joined every live room
 * has no recommendations, and an empty section with an apology in it would be a
 * worse answer than simply falling through to Trending below.
 */
function ForYouSection({
  query,
}: {
  query: ReturnType<typeof useRecommendedRooms>
}) {
  const items = query.data?.items ?? []

  // Nothing while loading, either. A skeleton here would push Trending down the
  // page on every navigation only to collapse again when the list comes back
  // empty, which is the layout shift users notice most.
  if (query.isLoading || items.length === 0) return null

  const personalized = query.data?.personalized ?? false

  return (
    <section>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          {/* Honest about which one this is. Calling a popularity ranking "for
              you" is the thing that makes a recommender feel broken — the user
              can tell, and then stops trusting the label when it is earned. */}
          <span>{personalized ? '✨ For you' : '✨ Popular right now'}</span>
          <Badge>{items.length}</Badge>
        </h2>
      </div>

      {!personalized && (
        <p className={styles.sectionNote}>
          Join a moment or two and this starts matching what you actually like.
        </p>
      )}

      <div className={styles.roomsGrid}>
        {items.map((room) => {
          const Icon = ROOM_TYPE_ICONS[room.room_type] ?? HashIcon
          return (
            <Link
              key={room.id}
              to={room.community_id ? `/c/${room.community_id}/r/${room.id}` : `/rooms/${room.id}`}
              className={`${styles.roomCard} ${styles.forYouCard}`}
            >
              <div className={styles.roomCardHead}>
                <span className={styles.roomTypeTag}>
                  <Icon size={14} />
                  {room.room_type.replace('_', ' ')}
                </span>
                <span className={styles.participantCount}>
                  <UsersIcon size={12} />
                  {room.current_participants || 1}
                </span>
              </div>

              <h3 className={styles.roomName}>{room.name}</h3>
              <p className={styles.roomTopic}>
                {room.topic || `Join this ${room.category} session and chat anonymously.`}
              </p>

              <RecommendationReason reasons={room.reasons} />

              <div className={styles.roomCardFooter}>
                <span className={styles.anonPill}>
                  {room.is_anonymous ? 'Anonymous' : 'Public'}
                </span>
                <Button size="sm" variant="ghost">
                  Enter →
                </Button>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
