import { useState } from 'react'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useAuditActions, useAuditLog, type AuditEntry } from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import styles from './panels.module.css'

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'user', label: 'Auth & Users' },
  { id: 'community', label: 'Communities' },
  { id: 'room', label: 'Rooms' },
  { id: 'call', label: 'Calls' },
  { id: 'media', label: 'Media' },
  { id: 'message', label: 'Messages' },
  { id: 'ticket', label: 'Support' },
  { id: 'friend', label: 'Social' },
] as const

function getActionTone(action: string): 'danger' | 'accent' | 'success' | 'neutral' {
  if (
    action.includes('suspended') ||
    action.includes('removed') ||
    action.includes('blocked')
  ) {
    return 'danger'
  }
  if (
    action.includes('registered') ||
    action.includes('created') ||
    action.includes('reinstated') ||
    action.includes('unblocked')
  ) {
    return 'success'
  }
  if (
    action.includes('role') ||
    action.includes('joined') ||
    action.includes('pinned') ||
    action.includes('invite')
  ) {
    return 'accent'
  }
  return 'neutral'
}

/**
 * Platform Audit Log: Comprehensive trail of system & moderation events.
 */
export function AuditLogPanel() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [action, setAction] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [openMetaIds, setOpenMetaIds] = useState<Record<string, boolean>>({})

  const actions = useAuditActions()
  const log = useAuditLog({
    category: selectedCategory === 'all' ? undefined : selectedCategory,
    action: action === 'all' ? undefined : action,
    q: searchQuery.trim() || undefined,
  })
  const toast = useToast()

  const actionOptions = [
    { value: 'all', label: 'Every action' },
    ...(actions.data ?? [])
      .filter((key) => selectedCategory === 'all' || key.startsWith(`${selectedCategory}.`))
      .map((key) => ({ value: key, label: key })),
  ]

  const entries = log.data ?? []

  function toggleMeta(id: string) {
    setOpenMetaIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function copyMeta(entry: AuditEntry) {
    navigator.clipboard.writeText(JSON.stringify(entry.metadata, null, 2))
    toast.success('Metadata copied to clipboard')
  }

  return (
    <div className={styles.stack}>
      {/* Category Filter Chips */}
      <div className={styles.chips} role="tablist" aria-label="Audit action categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`${styles.chip} ${selectedCategory === cat.id ? styles.chipActive : ''}`}
            onClick={() => {
              setSelectedCategory(cat.id)
              setAction('all')
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.filterBar}>
        <div style={{ flex: 1, minWidth: '16rem' }}>
          <Input
            label="Search entries"
            aria-label="Search audit entries"
            placeholder="Search by actor handle, summary, or ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ minWidth: '14rem' }}>
          <Select
            aria-label="Filter by action"
            value={action}
            onValueChange={setAction}
            options={actionOptions}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void log.refetch()}
          disabled={log.isFetching}
        >
          {log.isFetching ? 'Refreshing…' : 'Refresh Log'}
        </Button>
      </div>

      {log.isLoading && <Skeleton height="6rem" />}
      {log.error && (
        <Callout tone="danger">{errorText(log.error, 'Could not read the audit log')}</Callout>
      )}

      {!log.isLoading && entries.length === 0 && (
        <p className={styles.empty}>No audit log events match your filters.</p>
      )}

      {entries.map((entry) => {
        const hasMetadata = Object.keys(entry.metadata ?? {}).length > 0
        const isMetaOpen = openMetaIds[entry.id] ?? false

        return (
          <article key={entry.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.badges}>
                <Badge tone={getActionTone(entry.action)}>{entry.action}</Badge>
                {entry.subject_type && (
                  <Badge tone="neutral">
                    {entry.subject_type}
                    {entry.subject_id ? ` #${entry.subject_id.slice(0, 8)}` : ''}
                  </Badge>
                )}
              </div>
              <span className={styles.rowMeta}>{formatFull(entry.created_at)}</span>
            </div>

            <p className={styles.entrySummary}>
              <strong>{entry.actor_handle ? `@${entry.actor_handle}` : 'system'}</strong>{' '}
              {entry.summary}
            </p>

            {hasMetadata && (
              <div className={styles.metaHeader}>
                <button
                  type="button"
                  className={styles.metaToggle}
                  onClick={() => toggleMeta(entry.id)}
                >
                  {isMetaOpen ? 'Hide event payload' : 'Show event payload'}
                </button>
                {isMetaOpen && (
                  <button
                    type="button"
                    className={styles.metaToggle}
                    onClick={() => copyMeta(entry)}
                  >
                    Copy JSON
                  </button>
                )}
              </div>
            )}

            {hasMetadata && isMetaOpen && (
              <pre className={styles.metadata}>{JSON.stringify(entry.metadata, null, 2)}</pre>
            )}
          </article>
        )
      })}
    </div>
  )
}
