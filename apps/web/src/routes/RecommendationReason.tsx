import { SparkleIcon } from '@/components/Icons'
import { explain, type Reason } from '@/features/api'

import styles from './HomeRoute.module.css'

/**
 * The "why you're seeing this" line under a recommended card.
 *
 * Renders nothing when the server sent no reasons, rather than a placeholder.
 * An unexplained recommendation is better shown as an ordinary card than as one
 * with an empty justification under it — the gap invites the reader to wonder
 * what is missing.
 *
 * The text itself comes from the server. Pluralisation and phrasing for seven
 * reason kinds is exactly the logic that drifts when two clients each own a
 * copy, and the mobile app will want the same sentences.
 */
export function RecommendationReason({ reasons }: { reasons: Reason[] }) {
  const text = explain(reasons)
  if (!text) return null

  return (
    <p className={styles.reason}>
      <span className={styles.reasonMark} aria-hidden>
        <SparkleIcon size={11} />
      </span>
      {/* Truncated with ellipsis rather than wrapped, so a card with a long
          reason stays the same height as its neighbours in the grid. */}
      <span className={styles.reasonText} title={text}>
        {text}
      </span>
    </p>
  )
}
