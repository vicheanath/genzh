import { Navigate, NavLink, Outlet } from 'react-router-dom'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { LoadingPanel } from '@/components/Spinner'
import { useAdminStats, useIsPlatformAdmin, useIsStaff, useSupportQueue } from '@/features/api'
import { useAuth } from '@/lib/auth'

import styles from './AdminRoute.module.css'

/**
 * The platform console layout route.
 *
 * Gated twice on purpose. This check decides what to *render*, and the server
 * decides what to answer — every endpoint behind these panels re-reads the
 * caller's role from the database rather than trusting anything sent from here.
 * Hiding a tab/route is a courtesy to staff, not a security boundary.
 */
export function AdminRoute() {
  const { loading } = useAuth()
  const isStaff = useIsStaff()
  const isAdmin = useIsPlatformAdmin()
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
            <span className={styles.statDesc}>
              {stats.data.active_users} active · {stats.data.suspended_users} suspended
            </span>
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

      <nav className={styles.nav} aria-label="Console navigation">
        <NavLink
          to="/admin/queue"
          className={({ isActive }) =>
            `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
          }
        >
          Support
        </NavLink>
        <NavLink
          to="/admin/users"
          className={({ isActive }) =>
            `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
          }
        >
          Users
        </NavLink>
        <NavLink
          to="/admin/communities"
          className={({ isActive }) =>
            `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
          }
        >
          Communities
        </NavLink>
        <NavLink
          to="/admin/live"
          className={({ isActive }) =>
            `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
          }
        >
          Live SFU
        </NavLink>
        <NavLink
          to="/admin/broadcasts"
          className={({ isActive }) =>
            `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
          }
        >
          Broadcasts
        </NavLink>
        {isAdmin && (
          <NavLink
            to="/admin/audit"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            Audit log
          </NavLink>
        )}
      </nav>

      <div className={styles.panel}>
        <Outlet />
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
