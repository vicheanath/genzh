import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/Button'
import { PlusIcon } from '@/components/Icons'
import { ModeSwitch } from '@/components/ModeSwitch'
import { Spinner } from '@/components/Spinner'
import { usePlaygroundFeed, type FeedRoom } from '@/features/api'
import { cx } from '@/lib/cx'

import { CreatePlaygroundRoomDialog } from '@/routes/CreatePlaygroundRoomDialog'

import { MomentCard } from './MomentCard'
import styles from './playground.module.css'

const CATEGORIES: ReadonlyArray<{ key: string | null; label: string }> = [
  { key: null, label: '✨ Everything' },
  { key: 'random', label: '🎲 Random' },
  { key: 'gaming', label: '🎮 Gaming' },
  { key: 'debate', label: '🔥 Debates' },
  { key: 'confession', label: '🤫 Confessions' },
  { key: 'music', label: '🎵 Music' },
  { key: 'memes', label: '😂 Memes' },
  { key: 'tech', label: '💻 Tech' },
]

/**
 * The playground: throwaway rooms, one full screen at a time.
 *
 * This is the whole of one half of the product. There is no list here and no
 * browsing — a room is a panel you either walk into or scroll past, and the
 * next page is already loaded by the time you reach it.
 *
 * CSS scroll-snap rather than a carousel library: the feed is exactly a
 * scrolling column whose children happen to be viewport-tall, so the browser's
 * own scroller gives keyboard, trackpad, touch and the scrollbar for free.
 */
export function PlaygroundFeedRoute() {
  const navigate = useNavigate()

  const [category, setCategory] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const feed = usePlaygroundFeed(category ?? undefined)
  const scroller = useRef<HTMLDivElement>(null)

  const items: FeedRoom[] = useMemo(
    () => feed.data?.pages.flatMap((page) => page.rooms) ?? [],
    [feed.data],
  )

  function openRoom(room: FeedRoom) {
    void navigate(`/rooms/${room.id}`)
  }

  function pickCategory(next: string | null) {
    setCategory(next)
    // A new filter is a new feed, not a scrolled one — leaving the reader on
    // panel nine of a list that just changed underneath them is disorienting.
    scroller.current?.scrollTo({ top: 0 })
  }

  /**
   * Ask for the next page once the reader is within a screen of the end.
   *
   * Driven off the scroller rather than an intersection observer on the last
   * card: with snap points, the last card is only ever fully visible once the
   * reader is already on it, which is too late to be loading anything.
   */
  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    if (!feed.hasNextPage || feed.isFetchingNextPage) return

    const el = event.currentTarget
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
    if (remaining < el.clientHeight * 1.5) void feed.fetchNextPage()
  }

  function scrollToNext() {
    const el = scroller.current
    if (el) el.scrollBy({ top: el.clientHeight, behavior: 'smooth' })
  }

  const createDialog = (
    <CreatePlaygroundRoomDialog
      open={createOpen}
      onClose={() => setCreateOpen(false)}
    />
  )

  if (feed.isLoading) {
    return (
      <div className={styles.centre}>
        <Spinner />
        <p className={styles.centreBody}>Finding what is happening</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={styles.centre}>
        <div className={styles.chrome}>
          <ModeSwitch overlay />
        </div>
        <h1 className={styles.centreTitle}>Nothing is on right now</h1>
        <p className={styles.centreBody}>
          {category
            ? 'No rooms in this topic yet. Start one, or look at everything.'
            : 'The playground is quiet. Start the first room and people will find it.'}
        </p>
        <div className={styles.centreActions}>
          <Button onClick={() => setCreateOpen(true)}>Start a room</Button>
          {category ? (
            <Button variant="secondary" onClick={() => pickCategory(null)}>
              See everything
            </Button>
          ) : null}
        </div>
        {createDialog}
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      {/* Floating over the feed rather than sitting in a header: the card
          behind is the whole screen, and a bar across the top would cost every
          room its first line. */}
      <div className={styles.chrome}>
        <ModeSwitch overlay showTagline={false} />

        <div className={styles.filters}>
          {CATEGORIES.map((entry) => (
            <button
              key={entry.key ?? 'all'}
              type="button"
              aria-pressed={entry.key === category}
              className={cx(styles.filter, entry.key === category && styles.filterSelected)}
              onClick={() => pickCategory(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={styles.create}
          aria-label="Start a room"
          onClick={() => setCreateOpen(true)}
        >
          <PlusIcon size={20} />
        </button>
      </div>

      <div ref={scroller} className={styles.feed} onScroll={onScroll}>
        {items.map((room, index) => (
          <MomentCard
            key={room.id}
            room={room}
            hasNext={index < items.length - 1 || feed.hasNextPage}
            onJoin={() => openRoom(room)}
            onNext={scrollToNext}
          />
        ))}
      </div>

      {createDialog}
    </div>
  )
}
