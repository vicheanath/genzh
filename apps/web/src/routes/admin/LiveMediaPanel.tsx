import { useConfirm } from '@/components/AlertDialog'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useIsPlatformAdmin,
  useLiveMediaSessions,
  useTerminateLiveMediaMutation,
  type LiveMediaSessionView,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import styles from './panels.module.css'

/**
 * Real-time active SFU media rooms, voice calls, and telemetry.
 */
export function LiveMediaPanel() {
  const isAdmin = useIsPlatformAdmin()
  const liveSessions = useLiveMediaSessions()
  const list = liveSessions.data ?? []

  return (
    <div className={styles.stack}>
      <div className={styles.filterBar}>
        <div style={{ flex: 1 }}>
          <p className={styles.rowMeta} style={{ margin: 0 }}>
            Live SFU Telemetry · Auto-refreshes every 5 seconds
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void liveSessions.refetch()}
          disabled={liveSessions.isFetching}
        >
          {liveSessions.isFetching ? 'Polling…' : 'Refresh Now'}
        </Button>
      </div>

      {liveSessions.isLoading && <Skeleton height="5rem" />}
      {liveSessions.error && (
        <Callout tone="danger">{errorText(liveSessions.error, 'Could not inspect live media sessions')}</Callout>
      )}

      {!liveSessions.isLoading && list.length === 0 && (
        <p className={styles.empty}>No active voice or video sessions currently running.</p>
      )}

      {list.map((session) => (
        <LiveMediaCard key={session.room_id} session={session} canEnforce={isAdmin} />
      ))}
    </div>
  )
}

function LiveMediaCard({
  session,
  canEnforce,
}: {
  session: LiveMediaSessionView
  canEnforce: boolean
}) {
  const confirm = useConfirm()
  const toast = useToast()
  const terminate = useTerminateLiveMediaMutation()

  async function handleTerminate() {
    const ok = await confirm({
      title: `Terminate Live Session in "${session.room_name}"?`,
      description:
        'This will forcefully disconnect all active WebRTC publishers and subscribers and reset the room state.',
      confirmLabel: 'Force Terminate',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await terminate.mutateAsync(session.room_id)
      toast.success(`Session in "${session.room_name}" terminated`)
    } catch (cause) {
      toast.error('Could not terminate session', errorText(cause))
    }
  }

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <strong>{session.room_name}</strong>
          {session.community_name && (
            <span className={styles.rowMeta}> · Community: {session.community_name}</span>
          )}
        </div>
        <div className={styles.badges}>
          <Badge tone="accent">{session.room_type}</Badge>
          <Badge tone={session.participant_count > 0 ? 'success' : 'neutral'}>
            {session.participant_count} active {session.participant_count === 1 ? 'peer' : 'peers'}
          </Badge>
          <Badge tone="neutral">{session.status}</Badge>
        </div>
      </div>

      <p className={styles.rowMeta}>
        Started {session.started_at ? formatFull(session.started_at) : 'Just now'} · Room ID: {session.room_id}
      </p>

      {canEnforce && (
        <div className={styles.cardActions}>
          <Button variant="danger" size="sm" onClick={() => void handleTerminate()}>
            Terminate Session
          </Button>
        </div>
      )}
    </article>
  )
}
