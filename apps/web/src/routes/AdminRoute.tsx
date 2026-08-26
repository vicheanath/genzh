import { Navigate, NavLink, Outlet } from 'react-router-dom'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import {
  ActivityIcon,
  BellIcon,
  FileTextIcon,
  FlagIcon,
  GlobeIcon,
  HelpCircleIcon,
  LockIcon,
  RadioIcon,
  ShieldIcon,
  SparkleIcon,
  StoreIcon,
  UsersIcon,
} from '@/components/Icons'
import { LoadingPanel } from '@/components/Spinner'
import {
  useAdminStats,
  useConsoleLiveUpdates,
  useIsPlatformAdmin,
  useIsStaff,
  useOpenTicketCount,
  useSupportQueue,
} from '@/features/api'
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

  // Mounted here rather than per panel: one subscription for the whole console,
  // torn down when it is left. Subscribing inside each panel would mean a
  // signal only reached whichever panel happened to be open, which is the one
  // that needed it least.
  useConsoleLiveUpdates(isStaff)

  // The role arrives with `/me`, so waiting avoids bouncing a real staff
  // member off their own console during the first render of a reload.
  if (loading) return <LoadingPanel />
  if (!isStaff) return <Navigate to="/" replace />

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <h1 className={styles.title}>Platform Console</h1>
            <span className={styles.titleBadge}>{isAdmin ? 'Super Admin' : 'Staff Moderation'}</span>
          </div>
          <p className={styles.subtitle}>
            {isAdmin
              ? 'Real-time telemetry, enforcement, safety rules, server controls, and platform audit trail.'
              : 'Support ticket queue, community moderation, and account lookups.'}
          </p>
        </div>
        <div className={styles.headerRight}>
          <QueueBadge />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void stats.refetch()}
            disabled={stats.isFetching}
          >
            {stats.isFetching ? 'Refreshing…' : 'Refresh Metrics'}
          </Button>
        </div>
      </header>

      {stats.data && (
        <section className={styles.statsGrid} aria-label="Platform Metrics">
          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Total Accounts</span>
              <UsersIcon size={16} className={styles.statIcon} />
            </div>
            <span className={styles.statValue}>{stats.data.total_users}</span>
            <span className={styles.statDesc}>
              {stats.data.active_users} active · {stats.data.suspended_users} suspended
            </span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Staff Team</span>
              <ShieldIcon size={16} className={styles.statIcon} />
            </div>
            <span className={styles.statValue}>{stats.data.staff_users}</span>
            <span className={styles.statDesc}>Platform support & admins</span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Support Queue</span>
              <HelpCircleIcon size={16} className={styles.statIcon} />
            </div>
            <span className={styles.statValue}>{stats.data.open_tickets}</span>
            <span className={styles.statDesc}>{stats.data.resolved_tickets} resolved tickets</span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Communities & Rooms</span>
              <GlobeIcon size={16} className={styles.statIcon} />
            </div>
            <span className={styles.statValue}>{stats.data.total_communities}</span>
            <span className={styles.statDesc}>{stats.data.total_rooms} total channels</span>
          </div>

          {isAdmin && (
            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>Audit Trail</span>
                <FileTextIcon size={16} className={styles.statIcon} />
              </div>
              <span className={styles.statValue}>{stats.data.total_audit_entries}</span>
              <span className={styles.statDesc}>Platform events recorded</span>
            </div>
          )}
        </section>
      )}

      <div className={styles.navWrapper}>
        <nav className={styles.nav} aria-label="Console navigation">
          <NavLink
            to="/admin/queue"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            <HelpCircleIcon size={15} /> Support
          </NavLink>
          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            <UsersIcon size={15} /> Users
          </NavLink>
          <NavLink
            to="/admin/communities"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            <GlobeIcon size={15} /> Communities
          </NavLink>
          <NavLink
            to="/admin/live"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            <RadioIcon size={15} /> Live SFU
          </NavLink>
          <NavLink
            to="/admin/broadcasts"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            <BellIcon size={15} /> Broadcasts
          </NavLink>
          {isAdmin && (
            <>
              <NavLink
                to="/admin/features"
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                <FlagIcon size={15} /> Feature Flags
              </NavLink>
              <NavLink
                to="/admin/automod"
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                <ShieldIcon size={15} /> Auto-Mod
              </NavLink>
              <NavLink
                to="/admin/security"
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                <LockIcon size={15} /> Security & Bans
              </NavLink>
              <NavLink
                to="/admin/health"
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                <ActivityIcon size={15} /> System Health
              </NavLink>
              <NavLink
                to="/admin/store"
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                <StoreIcon size={15} /> Store
              </NavLink>
              <NavLink
                to="/admin/recommendations"
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                <SparkleIcon size={15} /> Recommendations
              </NavLink>
              <NavLink
                to="/admin/audit"
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                <FileTextIcon size={15} /> Audit Log
              </NavLink>
            </>
          )}
        </nav>
      </div>

      <div className={styles.panel}>
        <Outlet />
      </div>
    </div>
  )
}

/** How many tickets are waiting — every one, not just the page on screen. */
function QueueBadge() {
  const queue = useSupportQueue({ status: 'open' })
  const open = useOpenTicketCount(queue)
  if (open === 0) return null
  return (
    <Badge tone="danger" dot>
      {open} waiting
    </Badge>
  )
}
