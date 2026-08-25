import { Button } from '@/components/Button'

import styles from './panels.module.css'

/**
 * "Load older" for a keyset-paged console list.
 *
 * A button rather than an infinite-scroll sentinel, deliberately. These lists
 * are worked, not browsed: somebody reading an audit trail is looking for one
 * entry, and a list that grows under the cursor makes "where was I" impossible
 * to answer. It also keeps the fetch an explicit act, so a filter that matches
 * a hundred thousand rows costs one page unless somebody asks for more.
 *
 * Renders nothing when there is no further page, so the absence of the button
 * is itself the "that's all" signal.
 */
export function Pager({
  loaded,
  hasMore,
  isLoading,
  onLoadMore,
  label = 'Load older',
  noun = 'entries',
}: {
  /** How many rows are on screen, for the count line. */
  loaded: number
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
  label?: string
  /** Plural noun for the count line — "entries", "accounts", "tickets". */
  noun?: string
}) {
  if (loaded === 0) return null

  return (
    <div className={styles.pager}>
      <span className={styles.pagerCount}>
        {/* Never "of N": counting the matches of an arbitrary filter over the
            whole audit table costs more than the page itself, so the console
            says what it has rather than guessing at what it does not. */}
        Showing {loaded} {noun}
        {hasMore ? '' : ' — nothing older'}
      </span>
      {hasMore && (
        <Button variant="secondary" onClick={onLoadMore} disabled={isLoading}>
          {isLoading ? 'Loading…' : label}
        </Button>
      )}
    </div>
  )
}
