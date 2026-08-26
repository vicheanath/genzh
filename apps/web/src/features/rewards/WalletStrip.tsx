import { Button } from '@/components/Button'
import { FlameIcon, GemIcon, TrophyIcon } from '@/components/Icons'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errorText } from '@/lib/errors'

import { useBalanceQuery, useDailyCheckinMutation } from './api'
import styles from './rewards.module.css'

/**
 * The balance, the streak, and the button that pays out today.
 *
 * Shown at the top of every rewards tab rather than only on one: the number
 * that decides whether a purchase is possible should be visible from the screen
 * where purchases happen.
 */
export function WalletStrip() {
  const balance = useBalanceQuery()
  const checkin = useDailyCheckinMutation()
  const toast = useToast()

  if (balance.isLoading) return <Skeleton height="6rem" />

  const data = balance.data
  if (!data) return null

  async function claim() {
    try {
      const result = await checkin.mutateAsync()
      toast.success(
        `+${result.points_awarded} points`,
        result.daily_streak > 1 ? `Day ${result.daily_streak} of your streak.` : undefined,
      )
    } catch (cause) {
      toast.error('Could not claim today', errorText(cause))
    }
  }

  return (
    <>
      <section className={styles.wallet} aria-label="Your balance">
        <div className={`${styles.walletCard} ${styles.walletPrimary}`}>
          <span className={styles.walletLabel}>Balance</span>
          <span className={styles.walletValue}>{data.balance.toLocaleString()}</span>
          <span className={styles.walletHint}>Points to spend</span>
        </div>

        <div className={styles.walletCard}>
          <span className={styles.walletLabel}>
            <TrophyIcon size={13} /> Lifetime
          </span>
          <span className={styles.walletValue}>{data.lifetime_earned.toLocaleString()}</span>
          <span className={styles.walletHint}>Earned since you joined</span>
        </div>

        <div className={styles.walletCard}>
          <span className={styles.walletLabel}>
            <FlameIcon size={13} /> Streak
          </span>
          <span className={styles.walletValue}>{data.daily_streak}</span>
          <span className={styles.walletHint}>
            {data.daily_streak > 0 ? 'Days in a row' : 'Check in to start one'}
          </span>
        </div>
      </section>

      <section className={styles.claim} aria-label="Daily check-in">
        <div className={styles.claimCopy}>
          <span className={styles.claimTitle}>
            <GemIcon size={16} />
            {data.can_claim_daily ? 'Your daily points are waiting' : 'Claimed for today'}
          </span>
          <span className={styles.claimHint}>
            {data.can_claim_daily
              ? `Claim ${data.next_claim_points} points${
                  data.daily_streak > 0 ? ` and keep your ${data.daily_streak}-day streak` : ''
                }.`
              : nextClaimHint(data.next_claim_at)}
          </span>
        </div>

        <Button onClick={() => void claim()} disabled={!data.can_claim_daily || checkin.isPending}>
          {checkin.isPending
            ? 'Claiming…'
            : data.can_claim_daily
              ? `Claim ${data.next_claim_points}`
              : 'Come back tomorrow'}
        </Button>
      </section>
    </>
  )
}

/** How long until the next claim, in the roundest unit that is still true. */
function nextClaimHint(nextClaimAt: string | null): string {
  if (!nextClaimAt) return 'Come back tomorrow for more.'
  const minutes = Math.max(0, Math.round((Date.parse(nextClaimAt) - Date.now()) / 60000))
  if (minutes < 60) return `Next claim in ${minutes} minute${minutes === 1 ? '' : 's'}.`
  const hours = Math.round(minutes / 60)
  return `Next claim in ${hours} hour${hours === 1 ? '' : 's'}.`
}
