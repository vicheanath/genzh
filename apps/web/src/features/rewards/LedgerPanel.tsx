import { Callout } from '@/components/Callout'
import {
  FlameIcon,
  GemIcon,
  GiftIcon,
  PackageIcon,
  StoreIcon,
  TrophyIcon,
  UsersIcon,
} from '@/components/Icons'
import { Skeleton } from '@/components/Skeleton'
import { cx } from '@/lib/cx'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import type { BalanceTransaction } from './api'
import { useBalanceQuery } from './api'
import styles from './rewards.module.css'

/**
 * How each reason reads to somebody who did not write the code.
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

const REASON_ICONS: Record<string, typeof GemIcon> = {
  daily_checkin: FlameIcon,
  referral_welcome_bonus: GiftIcon,
  referral_invite_bonus: UsersIcon,
  referral_milestone: TrophyIcon,
  store_purchase: StoreIcon,
  admin_grant: GiftIcon,
  admin_adjustment: PackageIcon,
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
      <h3 className={styles.panelTitle}>
        <GemIcon size={16} /> Points history
      </h3>

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
  const IconComponent = REASON_ICONS[entry.reason] ?? GemIcon

  return (
    <div className={styles.row}>
      <div className={cx(styles.ledgerIcon, credit && styles.ledgerIconCredit)}>
        <IconComponent size={14} />
      </div>

      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>
          {REASONS[entry.reason] ?? entry.reason}
          {itemName ? ` — ${itemName}` : ''}
        </span>
        <span className={styles.rowMeta}>{formatFull(entry.created_at)}</span>
      </div>
      <span className={cx(styles.amount, credit ? styles.amountCredit : styles.amountDebit)}>
        {credit ? '+' : '−'}
        {Math.abs(entry.amount).toLocaleString()} pts
      </span>
    </div>
  )
}
