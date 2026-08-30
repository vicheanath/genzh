import { useState } from 'react'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { CheckIcon, CopyIcon, GemIcon, UsersIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { cx } from '@/lib/cx'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import { useClaimReferralMutation, useReferralOverviewQuery } from './api'
import styles from './rewards.module.css'

/** The invite link, the ladder, and who has already joined. */
export function ReferralHub() {
  const overview = useReferralOverviewQuery()

  if (overview.isLoading) return <Skeleton height="20rem" />
  if (overview.error) {
    return (
      <Callout tone="danger">{errorText(overview.error, 'Could not load your invites')}</Callout>
    )
  }

  const data = overview.data
  if (!data) return null

  const nextRung = data.milestones.find((m) => !m.reached)

  return (
    <div className={styles.referral}>
      <div className={styles.referralColumn}>
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Your invite link</h3>
          <span className={styles.code}>{data.referral_code}</span>

          <div className={styles.codeRow}>
            <span className={styles.codeField} title={data.share_url}>
              {data.share_url}
            </span>
            <CopyButton value={data.share_url} />
          </div>

          <p className={styles.claimHint}>
            You and whoever joins both get 100 points, the moment they use it.
          </p>
        </section>

        {!data.has_claimed_code && <ClaimCodePanel />}

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>
            Who you have invited ({data.total_referred})
          </h3>

          {data.referrals.length === 0 ? (
            <p className={styles.empty}>Nobody yet. Share your link and it fills up here.</p>
          ) : (
            <div className={styles.rows}>
              {data.referrals.map((referral) => {
                const name = referral.referee_display_name ?? referral.referee_handle ?? 'Someone'
                return (
                  <div key={referral.id} className={styles.row}>
                    <Avatar name={name} src={referral.referee_avatar_url} size="sm" />
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>{name}</span>
                      <span className={styles.rowMeta}>
                        Joined {formatFull(referral.completed_at ?? referral.created_at)}
                      </span>
                    </div>
                    <span className={cx(styles.amount, styles.amountCredit)}>
                      +{referral.reward_points}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Milestones</h3>
        <p className={styles.claimHint}>
          {nextRung
            ? `${nextRung.invites - data.total_referred} more to reach ${nextRung.label}.`
            : 'Every milestone reached. Nothing left to prove.'}
        </p>

        <div className={styles.milestones}>
          {data.milestones.map((milestone) => (
            <div key={milestone.label} className={styles.milestone}>
              <span
                className={cx(styles.milestoneDot, milestone.reached && styles.milestoneReached)}
              >
                {milestone.reached ? <CheckIcon size={12} /> : milestone.invites}
              </span>
              <span className={styles.milestoneLabel}>{milestone.label}</span>
              <span className={styles.milestoneMeta}>
                {milestone.bonus_points > 0 ? `+${milestone.bonus_points}` : '—'}
              </span>
            </div>
          ))}
        </div>

        <div className={cx(styles.row, styles.rowNoBorder)}>
          <UsersIcon size={15} />
          <div className={styles.rowMain}>
            <span className={styles.rowTitle}>{data.total_referred} joined</span>
            <span className={styles.rowMeta}>Through your link</span>
          </div>
          <span className={cx(styles.amount, styles.amountCredit)}>
            <GemIcon size={13} /> {data.total_earned_points.toLocaleString()}
          </span>
        </div>
      </section>
    </div>
  )
}

/**
 * Entering somebody else's code.
 *
 * Only rendered while `has_claimed_code` is false. A code can be claimed once
 * per account, and hiding the field afterwards beats letting somebody discover
 * that rule by being refused.
 */
function ClaimCodePanel() {
  const [code, setCode] = useState('')
  const claim = useClaimReferralMutation()
  const toast = useToast()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!code.trim()) return
    try {
      const result = await claim.mutateAsync(code.trim())
      toast.success(result.message, `You now have ${result.new_balance} points.`)
      setCode('')
    } catch (cause) {
      toast.error('Could not use that code', errorText(cause))
    }
  }

  return (
    <form className={styles.panel} onSubmit={submit}>
      <h3 className={styles.panelTitle}>Were you invited?</h3>
      <p className={styles.claimHint}>
        Enter the code you were given and you both get 100 points. One code per account.
      </p>
      <div className={styles.codeRow}>
        <Input
          label="Referral code"
          placeholder="e.g. VICHEA"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={32}
        />
        <Button type="submit" disabled={claim.isPending || !code.trim()}>
          {claim.isPending ? 'Applying…' : 'Apply'}
        </Button>
      </div>
    </form>
  )
}

/** Copy, with the confirmation on the button rather than in a toast. */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const toast = useToast()

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused outright — by permissions, or by an
      // insecure origin. Saying so beats a button that silently does nothing.
      toast.error('Could not copy', 'Select the link and copy it by hand.')
    }
  }

  return (
    <Button variant="secondary" onClick={() => void copy()}>
      {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}
