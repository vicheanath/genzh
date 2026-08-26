import { Callout } from '@/components/Callout'
import { Skeleton } from '@/components/Skeleton'
import { cx } from '@/lib/cx'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import type { BalanceTransaction } from './api'
import { useBalanceQuery } from './api'
import styles from './rewards.module.css'

/**
 * How each reason reads to somebody who did not write the code.
 *
 * Unknown keys fall through to the raw reason rather than to "Other": a new
 * server that starts writing a reason this build has never heard of should
 * still say something specific.
 */
const REASONS: Record<string, string> = {
  daily_checkin: 'Daily check-in',
  referral_welcome_bonus: 'Welcome bonus',
  referral_invite_bonus: 'Friend joined',
  referral_milestone: 'Invite milestone',
  store_purchase: 'Store purchase',
  admin_grant: 'Granted by staff',
  admin_adjustment: 'Balance correction',
}

/** Every movement of points, newest first. */
export function LedgerPanel() {
  const balance = useBalanceQuery()

  if (balance.isLoading) return <Skeleton height="14rem" />
  if (balance.error) {
    return <Callout tone="danger">{errorText(balance.error, 'Could not load your history')}</Callout>
  }

  const entries = balance.data?.recent_transactions ?? []

  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>Points history</h3>

      {entries.length === 0 ? (
        <p className={styles.empty}>Nothing yet. Your first check-in shows up here.</p>
      ) : (
        <div className={styles.rows}>
          {entries.map((entry) => (
            <LedgerRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  )
}

function LedgerRow({ entry }: { entry: BalanceTransaction }) {
  const credit = entry.amount >= 0
  const itemName = typeof entry.metadata?.name === 'string' ? entry.metadata.name : null

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>
          {REASONS[entry.reason] ?? entry.reason}
          {itemName ? ` — ${itemName}` : ''}
        </span>
        <span className={styles.rowMeta}>{formatFull(entry.created_at)}</span>
      </div>
      <span className={cx(styles.amount, credit ? styles.amountCredit : styles.amountDebit)}>
        {credit ? '+' : '−'}
        {Math.abs(entry.amount).toLocaleString()}
      </span>
    </div>
  )
}
