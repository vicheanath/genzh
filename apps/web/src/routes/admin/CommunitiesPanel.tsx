import { useState } from 'react'

import { useConfirm } from '@/components/AlertDialog'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useAdminCommunities,
  useDeleteAdminCommunityMutation,
  useIsPlatformAdmin,
  useQuarantineCommunityMutation,
  useUnquarantineCommunityMutation,
  type AdminCommunityView,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import styles from './panels.module.css'

const QUARANTINE_FILTERS = [
  { id: 'all', label: 'All Communities' },
  { id: 'active', label: 'Healthy Only' },
  { id: 'quarantined', label: 'Quarantined Only' },
] as const

/**
 * Community safety and moderation management.
 */
export function CommunitiesPanel() {
  const isAdmin = useIsPlatformAdmin()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'quarantined'>('all')

  const communities = useAdminCommunities({
    q: query.trim() || undefined,
    is_quarantined: filter === 'all' ? undefined : filter === 'quarantined',
  })

  const list = communities.data ?? []

  return (
    <div className={styles.stack}>
      <div className={styles.chips} role="tablist" aria-label="Community status filters">
        {QUARANTINE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.chip} ${filter === f.id ? styles.chipActive : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.filterBar}>
        <div style={{ flex: 1, minWidth: '16rem' }}>
          <Input
            label="Find a community"
            placeholder="Search by community name, description, or owner handle…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void communities.refetch()}
          disabled={communities.isFetching}
        >
          {communities.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {communities.isLoading && <Skeleton height="5rem" />}
      {communities.error && (
        <Callout tone="danger">{errorText(communities.error, 'Could not load communities')}</Callout>
      )}

      {!communities.isLoading && list.length === 0 && (
        <p className={styles.empty}>No communities match your search or filters.</p>
      )}

      {list.map((c) => (
        <CommunityCard key={c.id} community={c} canEnforce={isAdmin} />
      ))}
    </div>
  )
}

function CommunityCard({
  community,
  canEnforce,
}: {
  community: AdminCommunityView
  canEnforce: boolean
}) {
  const confirm = useConfirm()
  const toast = useToast()
  const quarantine = useQuarantineCommunityMutation()
  const unquarantine = useUnquarantineCommunityMutation()
  const deleteCommunity = useDeleteAdminCommunityMutation()

  const [reason, setReason] = useState('')

  const PRESET_REASONS = [
    'Violating Terms of Service',
    'Hate Speech / Harassment',
    'Spam / Phishing Outpost',
    'Copyright Infringement',
  ]

  async function handleQuarantine() {
    if (!reason.trim()) {
      toast.error('Quarantine reason required', 'State why this community is being restricted.')
      return
    }
    const ok = await confirm({
      title: `Quarantine "${community.name}"?`,
      description:
        'This hides the community from discovery and invalidates external invite links until lifted.',
      confirmLabel: 'Quarantine',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await quarantine.mutateAsync({ communityId: community.id, reason: reason.trim() })
      setReason('')
      toast.success(`"${community.name}" has been quarantined`)
    } catch (cause) {
      toast.error('Could not quarantine community', errorText(cause))
    }
  }

  async function handleUnquarantine() {
    try {
      await unquarantine.mutateAsync(community.id)
      toast.success(`Quarantine lifted for "${community.name}"`)
    } catch (cause) {
      toast.error('Could not lift quarantine', errorText(cause))
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Permanently Delete "${community.name}"?`,
      description:
        'This will immediately remove the community, all its rooms, roles, and message history. This action cannot be undone.',
      confirmLabel: 'Delete Forever',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await deleteCommunity.mutateAsync(community.id)
      toast.success(`Community "${community.name}" deleted`)
    } catch (cause) {
      toast.error('Could not delete community', errorText(cause))
    }
  }

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <strong>{community.name}</strong>
          <span className={styles.rowMeta}>
            {' '}· Owner: {community.owner_handle ? `@${community.owner_handle}` : community.owner_id}
          </span>
        </div>
        <div className={styles.badges}>
          <Badge tone="neutral">{community.member_count} members</Badge>
          <Badge tone="neutral">{community.room_count} rooms</Badge>
          {community.is_quarantined ? (
            <Badge tone="danger">quarantined</Badge>
          ) : (
            <Badge tone="success">active</Badge>
          )}
        </div>
      </div>

      {community.description && (
        <p className={styles.entrySummary}>{community.description}</p>
      )}

      <p className={styles.rowMeta}>
        Created {formatFull(community.created_at)}
      </p>

      {community.is_quarantined && community.quarantine_reason && (
        <Callout tone="danger">
          Quarantined {community.quarantined_at ? formatFull(community.quarantined_at) : ''} —{' '}
          {community.quarantine_reason}
        </Callout>
      )}

      {canEnforce && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {!community.is_quarantined && (
            <div className={styles.cannedResponses}>
              <span className={styles.cannedLabel}>Quick reasons:</span>
              {PRESET_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={styles.chip}
                  onClick={() => setReason(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          <div className={styles.cardActions}>
            {!community.is_quarantined ? (
              <>
                <div style={{ flex: 1, minWidth: '14rem' }}>
                  <Input
                    label="Quarantine reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why this community is being restricted"
                    maxLength={280}
                  />
                </div>
                <Button variant="danger" onClick={() => void handleQuarantine()}>
                  Quarantine
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => void handleUnquarantine()}>
                Lift Quarantine
              </Button>
            )}

            <Button variant="ghost" onClick={() => void handleDelete()}>
              Delete Community
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}
