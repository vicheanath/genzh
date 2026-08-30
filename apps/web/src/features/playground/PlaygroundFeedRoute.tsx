import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { PlusIcon } from '@/components/Icons'
import { ModeSwitch } from '@/components/ModeSwitch'
import { Spinner } from '@/components/Spinner'
import { usePlaygroundFeed, type FeedRoom } from '@/features/api'
import { cx } from '@/lib/cx'
import { ROOM_CATEGORIES, roomCategoryLabel } from '@/lib/roomTypes'

import { CreatePlaygroundRoomDialog } from '@/routes/CreatePlaygroundRoomDialog'

import { MomentCard } from './MomentCard'
import styles from './playground.module.css'

/**
 * The filter row: everything, then one pill per topic.
 *
 * Built from `ROOM_CATEGORIES` rather than restated, which is what closes the
 * gap this list used to have — it was missing Art, a topic the create dialog
 * happily filed rooms under, so those rooms could not be reached by browsing.
 */
const FILTERS: ReadonlyArray<{ key: string | null; label: string }> = [
  { key: null, label: '✨ Everything' },
  ...ROOM_CATEGORIES.map((entry) => ({
    key: entry.key,
    label: `${entry.emoji} ${entry.label}`,
  })),
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

  /*
   * The topic lives in the address, not in component state.
   *
   * Same argument `appMode` makes for which half of the app you are in: on the
   * web the URL is the state. Held in `useState` it was lost the moment you
   * opened a room — walk into something from the Music filter, come back, and
   * you were staring at an unfiltered feed from the top, with no way to tell
   * what had happened. It also means a filtered playground is a link somebody
   * can send.
   */
  const [params, setParams] = useSearchParams()
  const category = params.get('topic')
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
    // Replaced rather than pushed: the filter row is a control, and eight
    // history entries between the reader and wherever they came from is not
    // what Back is for.
    setParams(next ? { topic: next } : {}, { replace: true })
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

  const topicName = roomCategoryLabel(category)

  /*
   * One chrome, drawn for every state of the feed.
   *
   * The empty state used to render its own cut-down version with nothing in it
   * but the mode switch — so filtering to a topic that happened to be quiet
   * took the filter row away with it. You could not see which topic you were
   * on, could not move to another, and the only ways out were starting a room
   * or going back to everything. The row is navigation; it has to survive the
   * screen having nothing to show.
   */
  const chrome = (
    <div className={styles.chrome}>
      <ModeSwitch showTagline={false} />

      <div className={styles.filters}>
        {FILTERS.map((entry) => (
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
  )

  let body
  if (feed.isLoading) {
    body = (
      <div className={styles.centre}>
        <Spinner />
        <p className={styles.centreBody}>Finding what is happening</p>
      </div>
    )
  } else if (items.length === 0) {
    body = (
      <div className={styles.centre}>
        <h1 className={styles.centreTitle}>
          {/* Names the topic. "No rooms in this topic yet" left the reader to
              remember which one they had picked, on the one screen that no
              longer showed it. */}
          {topicName ? `Nothing in ${topicName} right now` : 'Nothing is on right now'}
        </h1>
        <p className={styles.centreBody}>
          {category
            ? 'Start one and it will be the first thing anybody sees here.'
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
      </div>
    )
  } else {
    body = (
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
    )
  }

  return (
    <div className={styles.screen}>
      {chrome}
      {body}
      {createDialog}
    </div>
  )
}
