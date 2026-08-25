import { useState } from 'react'

import { useConfirm } from '@/components/AlertDialog'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useAdminBroadcasts,
  useCreateBroadcastMutation,
  useDeleteBroadcastMutation,
  useIsPlatformAdmin,
  type SystemBroadcast,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import styles from './panels.module.css'

const LEVEL_OPTIONS = [
  { value: 'info', label: 'Info (Blue)' },
  { value: 'warning', label: 'Warning (Orange/Yellow)' },
  { value: 'danger', label: 'Urgent Alert (Red)' },
]

/**
 * System broadcasts & platform announcement banners.
 */
export function BroadcastsPanel() {
  const isAdmin = useIsPlatformAdmin()
  const broadcasts = useAdminBroadcasts()
  const createBroadcast = useCreateBroadcastMutation()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [level, setLevel] = useState('info')

  const list = broadcasts.data ?? []

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !message.trim()) {
      toast.error('Title and message are required')
      return
    }

    try {
      await createBroadcast.mutateAsync({
        title: title.trim(),
        message: message.trim(),
        level,
      })
      setTitle('')
      setMessage('')
      toast.success('Broadcast published across the platform')
    } catch (cause) {
      toast.error('Could not create broadcast', errorText(cause))
    }
  }

  return (
    <div className={styles.stack}>
      {isAdmin && (
        <form onSubmit={handleCreate} className={styles.card} style={{ gap: 'var(--space-3)' }}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
            Publish New Announcement
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 14rem', gap: 'var(--space-3)' }}>
            <Input
              label="Broadcast Title"
              placeholder="e.g. Scheduled Maintenance Notice"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
            />
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
                Urgency Level
              </label>
              <Select
                aria-label="Broadcast Level"
                value={level}
                onValueChange={setLevel}
                options={LEVEL_OPTIONS}
              />
            </div>
          </div>

          <Input
            label="Announcement Message"
            placeholder="Detailed broadcast notice visible to all connected users…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            required
          />

          <div className={styles.cardActions} style={{ justifyContent: 'flex-end' }}>
            <Button type="submit" disabled={createBroadcast.isPending || !title.trim() || !message.trim()}>
              {createBroadcast.isPending ? 'Publishing…' : 'Publish Broadcast'}
            </Button>
          </div>
        </form>
      )}

      <div className={styles.filterBar}>
        <div style={{ flex: 1 }}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
            Broadcast History
          </h2>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void broadcasts.refetch()}
          disabled={broadcasts.isFetching}
        >
          {broadcasts.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {broadcasts.isLoading && <Skeleton height="5rem" />}
      {broadcasts.error && (
        <Callout tone="danger">{errorText(broadcasts.error, 'Could not load broadcasts')}</Callout>
      )}

      {!broadcasts.isLoading && list.length === 0 && (
        <p className={styles.empty}>No platform announcements published yet.</p>
      )}

      {list.map((b) => (
        <BroadcastCard key={b.id} broadcast={b} canEnforce={isAdmin} />
      ))}
    </div>
  )
}

function BroadcastCard({
  broadcast,
  canEnforce,
}: {
  broadcast: SystemBroadcast
  canEnforce: boolean
}) {
  const confirm = useConfirm()
  const toast = useToast()
  const deleteBroadcast = useDeleteBroadcastMutation()

  function getLevelTone(lvl: string): 'accent' | 'danger' | 'neutral' {
    if (lvl === 'danger') return 'danger'
    if (lvl === 'warning') return 'accent'
    return 'neutral'
  }

  async function handleDismiss() {
    const ok = await confirm({
      title: `Dismiss Broadcast "${broadcast.title}"?`,
      description: 'This will immediately hide the announcement banner for all users.',
      confirmLabel: 'Dismiss Banner',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await deleteBroadcast.mutateAsync(broadcast.id)
      toast.success('Broadcast dismissed')
    } catch (cause) {
      toast.error('Could not dismiss broadcast', errorText(cause))
    }
  }

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <strong>{broadcast.title}</strong>
        </div>
        <div className={styles.badges}>
          <Badge tone={getLevelTone(broadcast.level)}>{broadcast.level}</Badge>
          {broadcast.is_active ? (
            <Badge tone="success">active banner</Badge>
          ) : (
            <Badge tone="neutral">dismissed</Badge>
          )}
        </div>
      </div>

      <p className={styles.entrySummary}>{broadcast.message}</p>

      <p className={styles.rowMeta}>
        Published {formatFull(broadcast.created_at)}
        {broadcast.expires_at ? ` · Expires ${formatFull(broadcast.expires_at)}` : ''}
      </p>

      {canEnforce && broadcast.is_active && (
        <div className={styles.cardActions}>
          <Button variant="ghost" size="sm" onClick={() => void handleDismiss()}>
            Dismiss Banner
          </Button>
        </div>
      )}
    </article>
  )
}
