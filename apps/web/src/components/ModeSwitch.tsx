import { Link } from 'react-router-dom'

import { CompassIcon, UsersIcon } from '@/components/Icons'
import { MODE_COPY, useAppMode, type AppMode } from '@/lib/appMode'
import { cx } from '@/lib/cx'

import styles from './ModeSwitch.module.css'

const MODE_ICON: Record<AppMode, typeof CompassIcon> = {
  playground: CompassIcon,
  servers: UsersIcon,
}

/**
 * The one control that crosses between the two halves of the app.
 *
 * It names where you would *go*, not where you are: the label is the other
 * mode. A segmented control showing both was the first shape this took, and it
 * read as a filter over one list rather than as a door out of one product into
 * another.
 *
 * A link rather than a button, because on the web the mode *is* the address —
 * so this is navigation, and middle-click and "open in new tab" work.
 */
export function ModeSwitch({
  overlay = false,
  showTagline = true,
}: {
  /** Draw for a dark card ground rather than a themed surface. */
  overlay?: boolean
  showTagline?: boolean
}) {
  const { other, otherHome } = useAppMode()
  const Icon = MODE_ICON[other]
  const copy = MODE_COPY[other]

  return (
    <Link
      to={otherHome}
      className={cx(styles.pill, overlay && styles.overlay)}
      aria-label={`Switch to ${copy.label} — ${copy.tagline}`}
    >
      <Icon size={15} />
      <span>{copy.label}</span>
      {showTagline && <span className={styles.tagline}>{copy.tagline}</span>}
    </Link>
  )
}
