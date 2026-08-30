import { useEffect, useState } from 'react'

import { Avatar } from '@/components/Avatar'
import { ChevronUpIcon, RadioIcon, TimerIcon, UsersIcon } from '@/components/Icons'
import type { FeedRoom } from '@/features/api'
import { hueFor } from '@/lib/palette'
import { cx } from '@/lib/cx'

import { roomTypeIcon, roomTypeLabel } from '@/lib/roomTypes'
import styles from './playground.module.css'

/** How many faces fit on a card before the rest become a "+n". */
const FACES_SHOWN = 4

/**
 * How long is left, as a phrase rather than a clock.
 *
 * A throwaway room's deadline is a mood, not an appointment: "12m left" tells
 * you to hurry, `00:11:47` tells you to watch a timer. Nothing here counts
 * seconds, so this only has to be recomputed once a minute.
 */
function remaining(expiresAt: string | null | undefined, now: number): string | null {
  if (!expiresAt) return null

  const ms = new Date(expiresAt).getTime() - now
  if (Number.isNaN(ms) || ms <= 0) return 'ending'

  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'ends in <1m'
  if (minutes < 60) return `ends in ${minutes}m`

  return `ends in ${Math.round(minutes / 60)}h`
}

/**
 * One room, as one full-height panel of the feed.
 *
 * Everything on it answers a single question — would you walk into this room —
 * so it carries what a stranger needs to decide and nothing that only matters
 * once you are inside. The name, who is already there, how long it has left,
 * and one button.
 */
export function MomentCard({
  room,
  hasNext,
  onJoin,
  onNext,
}: {
  room: FeedRoom
  hasNext: boolean
  onJoin: () => void
  onNext: () => void
}) {
  // Ticks once a minute for the whole feed's worth of cards. Cheap enough that
  // it is not worth knowing which card is on screen to do it per card.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const Glyph = roomTypeIcon(room.room_type)
  const countdown = remaining(room.expires_at, now)
  const live = room.current_participants

  const faces = room.faces.slice(0, FACES_SHOWN)
  const overflow = Math.max(0, live - faces.length)
  const hostName = room.host?.display_name ?? room.host?.handle ?? null

  /*
   * Whether the host *is* the room, so far.
   *
   * A freshly started room comes back with the host as its only face, and the
   * card then drew them twice on consecutive lines — the same avatar beside
   * "started by Vichea" and again beside "inside right now". One of the two is
   * enough, and the one that also says who is in there is the one to keep.
   */
  const hostIsOnlyOneInside =
    Boolean(room.host) && faces.length === 1 && faces[0]?.id === room.host?.id && overflow === 0

  return (
    <article
      className={styles.card}
      // Hued off the id rather than the name: a uuid spreads evenly over the
      // wheel where short names clump, and the room looks the same to
      // everybody and after a rename. Two neighbours still land on a similar
      // hue now and then — the content is what tells them apart.
      style={{ '--room-hue': hueFor(room.id) } as React.CSSProperties}
    >
      <div className={styles.ground} aria-hidden />

      <div className={styles.middle}>
        {/* Up here with the name rather than stranded in the opposite corner.
            These two facts are the argument for walking in — how busy it is and
            how long it has left — and they were pinned to the top right while
            everything else sat bottom left, so a card read as two unrelated
            clusters with a screen of empty gradient between them. */}
        <div className={styles.top}>
          {live > 0 && (
            <span className={cx(styles.chip, styles.liveChip)}>
              <RadioIcon size={12} />
              {live} live
            </span>
          )}
          {countdown && (
            <span className={styles.chip}>
              <TimerIcon size={12} />
              {countdown}
            </span>
          )}
        </div>

        <div className={styles.typeRow}>
          <Glyph size={16} />
          <span>{roomTypeLabel(room.room_type)}</span>
          {room.is_anonymous && <span>· anonymous</span>}
        </div>

        <h2 className={styles.name}>{room.name}</h2>

        {room.topic && <p className={styles.topic}>{room.topic}</p>}

        {hostName && !hostIsOnlyOneInside && (
          <div className={styles.hostRow}>
            <Avatar
              name={hostName}
              src={room.host?.avatar_url}
              color={room.host?.accent_color}
              size="xs"
            />
            <span>started by {hostName}</span>
          </div>
        )}
      </div>

      <div className={styles.bottom}>
        {faces.length > 0 ? (
          <div className={styles.faces}>
            <div className={styles.faceStack}>
              {faces.map((person) => (
                <Avatar
                  key={person.id}
                  className={styles.face}
                  name={person.display_name || person.handle}
                  src={person.avatar_url}
                  color={person.accent_color}
                  size="sm"
                />
              ))}
            </div>
            <span>
              {overflow > 0
                ? `+${overflow} more inside`
                : hostIsOnlyOneInside
                  ? `${hostName} started this — nobody else yet`
                  : 'inside right now'}
            </span>
          </div>
        ) : (
          <div className={styles.faces}>
            <UsersIcon size={15} />
            <span>Empty — be the first one in</span>
          </div>
        )}

        <button type="button" className={styles.join} onClick={onJoin}>
          Join the room
        </button>

        {hasNext ? (
          <button type="button" className={styles.nextHint} onClick={onNext}>
            <ChevronUpIcon size={14} />
            Scroll for the next moment
          </button>
        ) : (
          <span className={styles.nextHint}>That is everything happening right now</span>
        )}
      </div>
    </article>
  )
}
