import { useState } from 'react'

import { Badge } from '@/components/Badge'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Skeleton } from '@/components/Skeleton'
import {
  useIsPlatformAdmin,
  useRecommendationCoverage,
  useRecommendationExplain,
  useUserSearch,
  useSearchedAccounts,
} from '@/features/api'
import type { Uuid } from '@/lib/api'
import { errorText } from '@/lib/errors'

import styles from './panels.module.css'

const SURFACES = [
  { value: 'rooms', label: 'Moments — the home feed' },
  { value: 'people', label: 'People you may know' },
  { value: 'communities', label: 'Communities to explore' },
] as const

/**
 * What the recommendation engine is doing, and why.
 *
 * Two questions, and they are different ones. Coverage answers *can it work at
 * all* — how many accounts have any signal, how many rooms are eligible to be
 * recommended to anybody. Explain answers *is it ranking well* for one named
 * account. Reaching for the second when the first is the problem is how an
 * afternoon disappears into tuning weights that were never the cause.
 */
export function RecommendationsPanel() {
  const isAdmin = useIsPlatformAdmin()

  return (
    <div className={styles.stack}>
      <CoverageSection />
      {isAdmin && <ExplainSection />}
      {!isAdmin && (
        <Callout tone="info">
          Inspecting one account&rsquo;s feed is admin-only: it shows the shape of
          their social graph.
        </Callout>
      )}
    </div>
  )
}

function CoverageSection() {
  const coverage = useRecommendationCoverage()

  if (coverage.isLoading) return <Skeleton height="8rem" />
  if (coverage.error) {
    return (
      <Callout tone="danger">
        {errorText(coverage.error, 'Could not read recommendation coverage')}
      </Callout>
    )
  }

  const data = coverage.data
  if (!data) return null

  const coldShare =
    data.total_accounts > 0 ? Math.round((data.cold_accounts / data.total_accounts) * 100) : 0

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Coverage</h2>

      <div className={styles.subsystemGrid}>
        <article className={styles.subsystemCard}>
          <div className={styles.cardHeader}>
            <strong>Accounts</strong>
            <Badge tone={coldShare > 60 ? 'danger' : 'neutral'}>{coldShare}% cold</Badge>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>No signal at all</span>
            <span className={styles.metricValue}>{data.cold_accounts}</span>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Total accounts</span>
            <span className={styles.metricValue}>{data.total_accounts}</span>
          </div>
          <p className={styles.pagerCount}>
            Cold accounts have no friends, no communities and no room history, so
            they are ranked on popularity alone. A high share here is an
            onboarding problem, not a ranking one.
          </p>
        </article>

        <article className={styles.subsystemCard}>
          <div className={styles.cardHeader}>
            <strong>What there is to recommend</strong>
            <Badge tone={data.eligible_rooms === 0 ? 'danger' : 'neutral'}>
              {data.eligible_rooms} rooms
            </Badge>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Eligible moments</span>
            <span className={styles.metricValue}>{data.eligible_rooms}</span>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Eligible communities</span>
            <span className={styles.metricValue}>{data.eligible_communities}</span>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Cached lists</span>
            <span className={styles.metricValue}>{data.cached_entries}</span>
          </div>
          {data.eligible_rooms === 0 && (
            <p className={styles.pagerCount}>
              Nothing is eligible: every room is ended, private, or a DM. A thin
              feed right now is a content problem, not a ranking one.
            </p>
          )}
        </article>
      </div>
    </section>
  )
}

/**
 * Run the engine for one account and show the ranking with its reasons.
 *
 * The account is chosen by searching, not by pasting a UUID: an operator
 * investigating "my feed is empty" has a handle, and asking them to find an id
 * first is how a debugging tool goes unused.
 */
function ExplainSection() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Uuid | null>(null)
  const [surface, setSurface] = useState<string>('rooms')

  const results = useUserSearch(search, { limit: 8 })
  const accounts = useSearchedAccounts(results)
  const explain = useRecommendationExplain(selected, surface)

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Inspect an account&rsquo;s feed</h2>

      <div className={styles.filterBar}>
        <Input
          label="Find an account"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Handle or e-mail…"
        />
        <Select
          aria-label="Surface"
          value={surface}
          onValueChange={setSurface}
          options={SURFACES}
        />
      </div>

      {search.trim().length > 0 && accounts.length > 0 && (
        <div className={styles.chips}>
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className={`${styles.chip} ${selected === account.id ? styles.chipActive : ''}`}
              onClick={() => setSelected(account.id)}
            >
              @{account.handle}
            </button>
          ))}
        </div>
      )}

      {!selected && (
        <p className={styles.empty}>Search for an account to see what it would be shown.</p>
      )}

      {selected && explain.isLoading && <Skeleton height="6rem" />}
      {selected && explain.error && (
        <Callout tone="danger">
          {errorText(explain.error, 'Could not run the engine for that account')}
        </Callout>
      )}

      {explain.data && (
        <>
          <div className={styles.subsystemCard}>
            <div className={styles.cardHeader}>
              <strong>Signals</strong>
              <Badge tone={explain.data.personalized ? 'success' : 'neutral'}>
                {explain.data.personalized ? 'Personalized' : 'Cold — popularity only'}
              </Badge>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Friends</span>
              <span className={styles.metricValue}>{explain.data.friends}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Communities</span>
              <span className={styles.metricValue}>{explain.data.communities}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Rooms already seen</span>
              <span className={styles.metricValue}>{explain.data.known_rooms}</span>
            </div>
          </div>

          {explain.data.items.length === 0 ? (
            <p className={styles.empty}>
              Nothing to recommend on this surface. With {explain.data.known_rooms} rooms
              already seen, the likely cause is that this account has been
              everywhere eligible — check Coverage above before touching the
              ranking.
            </p>
          ) : (
            explain.data.items.map((item, index) => <ExplainRow key={index} item={item} />)
          )}
        </>
      )}
    </section>
  )
}

/** One ranked entry: what it is, what it scored, and which signals got it there. */
function ExplainRow({ item }: { item: Record<string, unknown> }) {
  // The three surfaces return three different shapes, and the panel is a
  // debugging view rather than a product surface — so it reads whichever
  // identifying field is present instead of branching on the surface.
  const title =
    (item.name as string) ?? (item.display_name as string) ?? (item.handle as string) ?? 'unnamed'
  const score = typeof item.score === 'number' ? item.score : 0
  const reasons = Array.isArray(item.reasons)
    ? (item.reasons as Array<{ kind: string; detail: string; contribution: number }>)
    : []

  return (
    <div className={styles.jobRow}>
      <span className={styles.jobName}>{title}</span>
      <Badge tone="neutral">{score.toFixed(3)}</Badge>

      <span className={styles.bulkSpacer} />

      <div className={styles.jobMeta}>
        {reasons.length === 0 ? (
          <span>no reasons — scored below the display threshold</span>
        ) : (
          reasons.map((reason) => (
            <span key={reason.kind}>
              {reason.detail} (+{reason.contribution.toFixed(2)})
            </span>
          ))
        )}
      </div>
    </div>
  )
}
