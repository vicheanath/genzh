import { cx } from '@/lib/cx'

import styles from './PresenceDot.module.css'

export type Presence = 'online' | 'idle' | 'busy' | 'offline'

const LABELS: Record<Presence, string> = {
  online: 'Online',
  idle: 'Idle',
  busy: 'Do not disturb',
  offline: 'Offline',
}

/**
 * The status dot on an avatar.
 *
 * Positioned by the avatar wrapper, not by itself, so the same dot works on a
 * 28px sidebar avatar and a 64px profile one.
 */
export function PresenceDot({
  presence,
  className,
}: {
  presence: Presence
  className?: string
}) {
  return (
    <span
      className={cx(styles.dot, styles[presence], className)}
      role="img"
      aria-label={LABELS[presence]}
    />
  )
}
