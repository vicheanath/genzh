import { useState } from 'react'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useAuditActions,
  useAuditEntries,
  useAuditLog,
  type AuditEntry,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import { Pager } from './Pager'
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

  const entries = useAuditEntries(log)

  function toggleMeta(id: string) {
    setOpenMetaIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function copyMeta(entry: AuditEntry) {
    navigator.clipboard.writeText(JSON.stringify(entry.metadata, null, 2))
    toast.success('Metadata copied to clipboard')
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Audit log JSON exported')
  }

  function exportCsv() {
    const headers = ['id', 'created_at', 'action', 'actor_handle', 'summary', 'subject_type', 'subject_id']
    const rows = entries.map((e) => [
      e.id,
      e.created_at,
      e.action,
      e.actor_handle ?? 'system',
      `"${(e.summary ?? '').replace(/"/g, '""')}"`,
      e.subject_type ?? '',
      e.subject_id ?? '',
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Audit log CSV exported')
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
          {log.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={exportCsv}
          disabled={entries.length === 0}
        >
          Export CSV
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={exportJson}
          disabled={entries.length === 0}
        >
          Export JSON
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

      {/* Export writes whatever is loaded, which is what the operator can see.
          Exporting "everything matching the filter" would mean paging the whole
          table server-side into the browser, and an audit table is the one
          place that is genuinely large. */}
      <Pager
        loaded={entries.length}
        hasMore={Boolean(log.hasNextPage)}
        isLoading={log.isFetchingNextPage}
        onLoadMore={() => log.fetchNextPage()}
        label="Load older entries"
        noun="entries"
      />

    </div>
  )
}
