import { useState } from 'react'

import { Badge } from '@/components/Badge'
import { Callout } from '@/components/Callout'
import { Select } from '@/components/Select'
import { Skeleton } from '@/components/Skeleton'
import { useAuditActions, useAuditLog } from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import styles from './panels.module.css'

/**
 * What staff did, newest first.
 *
 * Read-only, and there is no control here that could be added to change that:
 * the API has no update or delete for these rows, so the console could not
 * offer an edit even if somebody built the button.
 */
export function AuditLogPanel() {
  const [action, setAction] = useState<string>('all')
  const actions = useAuditActions()
  const log = useAuditLog(action === 'all' ? {} : { action })

  const options = [
    { value: 'all', label: 'Every action' },
    ...(actions.data ?? []).map((key) => ({ value: key, label: key })),
  ]

  return (
    <div className={styles.stack}>
      <Select
        aria-label="Filter by action"
        value={action}
        onValueChange={setAction}
        options={options}
      />

      {log.isLoading && <Skeleton height="6rem" />}
      {log.error && (
        <Callout tone="danger">{errorText(log.error, 'Could not read the audit log')}</Callout>
      )}
      {!log.isLoading && log.data?.length === 0 && (
        <p className={styles.empty}>Nothing recorded yet.</p>
      )}

      {log.data?.map((entry) => (
        <article key={entry.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <Badge tone="accent">{entry.action}</Badge>
            <span className={styles.rowMeta}>{formatFull(entry.created_at)}</span>
          </div>
          <p className={styles.entrySummary}>
            {/* The handle is stored on the row, so this still names somebody
                after the account is deleted and the join has nothing to find. */}
            <strong>{entry.actor_handle ? `@${entry.actor_handle}` : 'system'}</strong>{' '}
            {entry.summary}
          </p>
          {Object.keys(entry.metadata ?? {}).length > 0 && (
            <pre className={styles.metadata}>{JSON.stringify(entry.metadata, null, 2)}</pre>
          )}
        </article>
      ))}
    </div>
  )
}
