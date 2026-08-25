import { useState } from 'react'
import { Navigate } from 'react-router-dom'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { LoadingPanel } from '@/components/Spinner'
import { Tab, TabsList, TabsRoot } from '@/components/Tabs'
import { useAdminStats, useIsPlatformAdmin, useIsStaff, useSupportQueue } from '@/features/api'
import { useAuth } from '@/lib/auth'

import { AuditLogPanel } from './admin/AuditLogPanel'
import { StaffUsersPanel } from './admin/StaffUsersPanel'
import { SupportQueuePanel } from './admin/SupportQueuePanel'

import styles from './AdminRoute.module.css'

type ConsoleTab = 'queue' | 'users' | 'audit'

/**
 * The platform console.
 *
 * Gated twice on purpose. This check decides what to *render*, and the server
 * decides what to answer — every endpoint behind these panels re-reads the
 * caller's role from the database rather than trusting anything sent from here.
 * Hiding a tab is a courtesy to staff, not a security boundary.
 */
export function AdminRoute() {
  const { loading } = useAuth()
  const isStaff = useIsStaff()
  const isAdmin = useIsPlatformAdmin()
  const [tab, setTab] = useState<ConsoleTab>('queue')
  const stats = useAdminStats()

  // The role arrives with `/me`, so waiting avoids bouncing a real staff
  // member off their own console during the first render of a reload.
  if (loading) return <LoadingPanel />
  if (!isStaff) return <Navigate to="/" replace />

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Platform console</h1>
          <p className={styles.subtitle}>
            {isAdmin
              ? 'Support, enforcement, communities, and real-time audit trail.'
              : 'The support queue and account lookups.'}
          </p>
        </div>
        <div className={styles.headerRight}>
          <QueueBadge />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void stats.refetch()}
            disabled={stats.isFetching}
          >
            {stats.isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </header>

      {stats.data && (
        <section className={styles.statsGrid} aria-label="Platform Metrics">
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Accounts</span>
            <span className={styles.statValue}>{stats.data.total_users}</span>
            <span className={styles.statDesc}>{stats.data.active_users} active · {stats.data.suspended_users} suspended</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Staff Members</span>
            <span className={styles.statValue}>{stats.data.staff_users}</span>
            <span className={styles.statDesc}>Support & Admin</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Support Tickets</span>
            <span className={styles.statValue}>{stats.data.open_tickets}</span>
            <span className={styles.statDesc}>{stats.data.resolved_tickets} resolved</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Communities & Rooms</span>
            <span className={styles.statValue}>{stats.data.total_communities}</span>
            <span className={styles.statDesc}>{stats.data.total_rooms} total rooms</span>
          </div>

          {isAdmin && (
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Audit Trail</span>
              <span className={styles.statValue}>{stats.data.total_audit_entries}</span>
              <span className={styles.statDesc}>Platform events logged</span>
            </div>
          )}
        </section>
      )}

      <TabsRoot value={tab} onValueChange={(value) => setTab(value as ConsoleTab)}>
        <TabsList>
          <Tab value="queue">Support</Tab>
          <Tab value="users">Users</Tab>
          {/* The log records enforcement against real accounts; the fewer
              people who can page through it, the better. */}
          {isAdmin && <Tab value="audit">Audit log</Tab>}
        </TabsList>
      </TabsRoot>

      <div className={styles.panel}>
        {tab === 'queue' && <SupportQueuePanel />}
        {tab === 'users' && <StaffUsersPanel />}
        {tab === 'audit' && isAdmin && <AuditLogPanel />}
      </div>
    </div>
  )
}

/** How many tickets are waiting — every one, not just the page on screen. */
function QueueBadge() {
  const queue = useSupportQueue({ status: 'open' })
  const open = queue.data?.open_count ?? 0
  if (open === 0) return null
  return (
    <Badge tone="danger" dot>
      {open} waiting
    </Badge>
  )
}
