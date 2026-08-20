import { useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'

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
import { communities as communitiesApi, rooms as roomsApi, type Room } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAsync } from '@/lib/useAsync'

import type { ShellContext } from './AppShell'
import { CreatePlaygroundRoomDialog } from './CreatePlaygroundRoomDialog'
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

export function HomeRoute() {
  const { getToken } = useAuth()
  const { reloadCommunities } = useOutletContext<ShellContext>()
  const navigate = useNavigate()
  const toast = useToast()

  const [createRoomOpen, setCreateRoomOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [matching, setMatching] = useState(false)

  // Communities list
  const communities = useAsync(
    async () => communitiesApi.list(await getToken()),
    [getToken],
  )

  // Playground discovery feed
  const discovery = useAsync(
    async () => roomsApi.discovery(await getToken(), selectedCategory || undefined),
    [getToken, selectedCategory],
  )

  async function handleFindRandomRoom() {
    setMatching(true)
    try {
      const room = await roomsApi.random(await getToken(), selectedCategory || undefined)
      if (room) {
        toast.success(`Entering ${room.name}!`)
        void navigate(`/rooms/${room.id}`)
      } else {
        toast.success('No active rooms in this topic', 'Starting one now!')
        setCreateRoomOpen(true)
      }
    } catch {
      toast.error('Could not find a random room right now')
    } finally {
      setMatching(false)
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
        <div className={styles.categories}>
          {categoryList.map(({ key, label }) => (
            <button
              key={label}
              type="button"
              className={cx(
                styles.categoryPill,
                selectedCategory === key && styles.categoryPillActive,
              )}
              onClick={() => setSelectedCategory(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 🔥 Trending & Active Moments */}
        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <span>🔥 Trending Moments</span>
              {discovery.data?.rooms && <Badge>{discovery.data.rooms.length}</Badge>}
            </h2>
          </div>

          {discovery.loading && (
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

          {!discovery.loading && (!discovery.data?.rooms || discovery.data.rooms.length === 0) && (
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

          {communities.loading && (
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

          {!communities.loading && (!communities.data || communities.data.length === 0) && (
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
        onCreated={() => {
          discovery.reload()
          reloadCommunities()
        }}
      />
    </div>
  )
}
