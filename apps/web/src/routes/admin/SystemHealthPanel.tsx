import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  ActivityIcon,
  CheckCircleIcon,
  GlobeIcon,
  RadioIcon,
  RotateCcwIcon,
  TimerIcon,
} from '@/components/Icons'
import { Meter } from '@/components/Meter'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useAdminStats,
  useBackgroundJobs,
  useIsPlatformAdmin,
  useLiveMediaSessions,
  useRunJobMutation,
  useSystemTelemetry,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import styles from './panels.module.css'

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

/**
 * System health, PostgreSQL pool metrics, SFU status, and process telemetry.
 */
export function SystemHealthPanel() {
  const telemetry = useSystemTelemetry()
  const stats = useAdminStats()
  const liveMedia = useLiveMediaSessions()

  const t = telemetry.data
  const activeMedia = liveMedia.data ?? []
  const mediaCount = activeMedia.length
  const totalPeers = activeMedia.reduce((acc, curr) => acc + curr.participant_count, 0)

  const poolSize = t?.pool_size ?? 1
  const idleConnections = t?.pool_idle_connections ?? 0
  const activeConnections = Math.max(0, poolSize - idleConnections)
  const poolUsagePct = Math.round((activeConnections / Math.max(1, poolSize)) * 100)

  return (
    <div className={styles.stack}>
      <div className={styles.filterBar}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
              Infrastructure Telemetry & Health
            </h2>
            {t && (
              <Badge tone={t.database_status === 'healthy' ? 'success' : 'danger'} dot>
                {t.database_status === 'healthy' ? 'Operational' : 'Degraded'}
              </Badge>
            )}
          </div>
          <p className={styles.rowMeta} style={{ margin: 0 }}>
            Live status of PostgreSQL pool, WebRTC SFU media bridge, and API daemon (auto-polled 5s).
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void telemetry.refetch()
            void stats.refetch()
            void liveMedia.refetch()
          }}
          disabled={telemetry.isFetching}
        >
          <RotateCcwIcon size={14} />
          {telemetry.isFetching ? 'Refreshing…' : 'Refresh Telemetry'}
        </Button>
      </div>

      {telemetry.isLoading && <Skeleton height="8rem" />}
      {telemetry.error && (
        <Callout tone="danger">{errorText(telemetry.error, 'Could not read system telemetry')}</Callout>
      )}

      {t && (
        <>
          {/* Top Quick Status Metric Cards */}
          <section className={styles.statsGrid} aria-label="System Metrics">
            <div className={styles.statCard}>
              <div className={styles.cardHeader}>
                <span className={styles.statLabel}>Database Health</span>
                <CheckCircleIcon size={16} />
              </div>
              <span className={styles.statValue}>
                <Badge tone={t.database_status === 'healthy' ? 'success' : 'danger'}>
                  {t.database_status}
                </Badge>
              </span>
              <span className={styles.statDesc}>PostgreSQL connection active</span>
            </div>

            <div className={styles.statCard}>
              <div className={styles.cardHeader}>
                <span className={styles.statLabel}>Active DB Connections</span>
                <ActivityIcon size={16} />
              </div>
              <span className={styles.statValue}>
                {activeConnections} <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>/ {t.pool_size}</span>
              </span>
              <span className={styles.statDesc}>{t.pool_idle_connections} idle connections</span>
            </div>

            <div className={styles.statCard}>
              <div className={styles.cardHeader}>
                <span className={styles.statLabel}>API Uptime</span>
                <TimerIcon size={16} />
              </div>
              <span className={styles.statValue}>{formatDuration(t.uptime_seconds)}</span>
              <span className={styles.statDesc}>Service process runtime</span>
            </div>

            <div className={styles.statCard}>
              <div className={styles.cardHeader}>
                <span className={styles.statLabel}>Live SFU Streams</span>
                <RadioIcon size={16} />
              </div>
              <span className={styles.statValue}>{mediaCount}</span>
              <span className={styles.statDesc}>{totalPeers} WebRTC peer connections</span>
            </div>
          </section>

          {/* Subsystem Health Breakdowns */}
          <div className={styles.subsystemGrid}>
            {/* Database & Pool Subsystem */}
            <article className={styles.subsystemCard}>
              <div className={styles.cardHeader}>
                <strong>PostgreSQL Connection Pool</strong>
                <Badge tone={poolUsagePct > 80 ? 'danger' : 'neutral'}>
                  {poolUsagePct}% capacity
                </Badge>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <Meter
                  min={0}
                  max={poolSize}
                  value={activeConnections}
                  tone={poolUsagePct > 80 ? 'accent' : 'live'}
                  aria-label="Database Pool Utilization"
                />
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Active checked-out</span>
                  <span className={styles.metricValue}>{activeConnections}</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Idle in pool</span>
                  <span className={styles.metricValue}>{idleConnections}</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Max pool allocation</span>
                  <span className={styles.metricValue}>{poolSize}</span>
                </div>
              </div>
            </article>

            {/* Media & SFU Server Subsystem */}
            <article className={styles.subsystemCard}>
              <div className={styles.cardHeader}>
                <strong>Live SFU Voice & Video Bridge</strong>
                <Badge tone={mediaCount > 0 ? 'success' : 'neutral'}>
                  {mediaCount > 0 ? 'streaming' : 'idle'}
                </Badge>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Active call channels</span>
                  <span className={styles.metricValue}>{mediaCount}</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Connected voice peers</span>
                  <span className={styles.metricValue}>{totalPeers}</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Protocol</span>
                  <span className={styles.metricValue}>WebRTC / SFU</span>
                </div>
              </div>
            </article>
          </div>

          {/* Time Synchronization Details */}
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <GlobeIcon size={16} />
                <strong>Server Timestamp & Clock Synchronization</strong>
              </div>
              <Badge tone="neutral">UTC</Badge>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Synchronized Node Time</span>
              <span className={styles.metricValue}>{formatFull(t.server_timestamp)}</span>
            </div>
          </article>
        </>
      )}

      <BackgroundJobs />
    </div>
  )
}

/**
 * What the background scheduler has been doing.
 *
 * Before this the jobs were invisible: a nightly prune could fail every night
 * for a month and the only trace was a log line nobody was reading. Failing
 * jobs sort to the top, and the failure carries the message rather than just a
 * red dot — "which job is unhealthy" is not a useful answer on its own.
 */
function BackgroundJobs() {
  const isAdmin = useIsPlatformAdmin()
  const jobs = useBackgroundJobs()
  const run = useRunJobMutation()
  const toast = useToast()

  const rows = jobs.data ?? []

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Background jobs</h2>

      {jobs.isLoading && <Skeleton height="4rem" />}
      {jobs.error && (
        <Callout tone="danger">{errorText(jobs.error, 'Could not read job status')}</Callout>
      )}
      {!jobs.isLoading && rows.length === 0 && (
        <p className={styles.empty}>No background jobs are registered on this instance.</p>
      )}

      {rows.map((job) => (
        <div
          key={job.name}
          className={`${styles.jobRow} ${job.healthy ? '' : styles.jobFailing}`}
        >
          <span className={styles.jobName}>{job.name}</span>
          <Badge tone={job.healthy ? 'success' : 'danger'}>
            {job.healthy ? 'Healthy' : 'Failing'}
          </Badge>

          <span className={styles.bulkSpacer} />

          <div className={styles.jobMeta}>
            <span>
              {job.last_run_at ? `Last run ${formatFull(job.last_run_at)}` : 'Not yet run'}
            </span>
            {job.last_duration_ms !== null && <span>{job.last_duration_ms} ms</span>}
            {/* Failures out of total, not a rate: "2 / 480" tells an operator
                both how bad it is and how long it has been running, which a
                percentage collapses into one uninformative number. */}
            <span>
              {job.failures} failed / {job.total_runs} runs
            </span>
          </div>

          {isAdmin && (
            <Button
              variant="secondary"
              size="sm"
              disabled={run.isPending}
              onClick={async () => {
                try {
                  const report = await run.mutateAsync(job.name)
                  // The request succeeding does not mean the job did.
                  if (report.healthy) {
                    toast.success(`${job.name} ran`)
                  } else {
                    toast.error(`${job.name} failed`, report.last_error ?? undefined)
                  }
                } catch (error) {
                  toast.error(errorText(error, 'Could not run the job'))
                }
              }}
            >
              Run now
            </Button>
          )}

          {job.last_error && <code className={styles.jobError}>{job.last_error}</code>}
        </div>
      ))}

      <p className={styles.pagerCount}>
        Counters are per-process and reset when the API restarts — they describe
        the instance that answered this request.
      </p>
    </section>
  )
}
