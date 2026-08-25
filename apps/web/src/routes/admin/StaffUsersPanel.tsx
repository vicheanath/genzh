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
  useIsPlatformAdmin,
  useReinstateUserMutation,
  useSetPlatformRoleMutation,
  useStaffList,
  useSuspendUserMutation,
  useUserSearch,
  type PlatformRole,
  type StaffUserView,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import styles from './panels.module.css'

const ROLES = [
  { value: 'user', label: 'User — no platform authority' },
  { value: 'support', label: 'Support — works the queue' },
  { value: 'admin', label: 'Admin — enforcement and the log' },
] as const satisfies ReadonlyArray<{ value: PlatformRole; label: string }>

const STATUS_FILTERS = [
  { id: 'all', label: 'All Statuses' },
  { id: 'active', label: 'Active Only' },
  { id: 'suspended', label: 'Suspended Only' },
] as const

const ROLE_FILTERS = [
  { id: 'all', label: 'All Roles' },
  { id: 'user', label: 'Users' },
  { id: 'support', label: 'Support' },
  { id: 'admin', label: 'Admins' },
] as const

/** Find an account, see its state, and (as an admin) act on it. */
export function StaffUsersPanel() {
  const isAdmin = useIsPlatformAdmin()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')
  const [roleFilter, setRoleFilter] = useState<PlatformRole | 'all'>('all')

  const results = useUserSearch(query, {
    role: roleFilter === 'all' ? undefined : roleFilter,
    is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
  })
  const staff = useStaffList()

  const accounts = results.data ?? []

  return (
    <div className={styles.stack}>
      <div className={styles.chips} role="tablist" aria-label="Account status filters">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`${styles.chip} ${statusFilter === s.id ? styles.chipActive : ''}`}
            onClick={() => setStatusFilter(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className={styles.chips} role="tablist" aria-label="Account role filters">
        {ROLE_FILTERS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`${styles.chip} ${roleFilter === r.id ? styles.chipActive : ''}`}
            onClick={() => setRoleFilter(r.id as PlatformRole | 'all')}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Input
        label="Find an account"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by handle or e-mail…"
      />

      {results.isLoading && <Skeleton height="4rem" />}
      {results.error && (
        <Callout tone="danger">{errorText(results.error, 'Could not search')}</Callout>
      )}
      {!results.isLoading && accounts.length === 0 && (
        <p className={styles.empty}>No accounts match your query and filters.</p>
      )}

      {accounts.map((account) => (
        <UserCard key={account.id} account={account} canEnforce={isAdmin} />
      ))}

      {isAdmin && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Staff</h2>
          {staff.isLoading && <Skeleton height="3rem" />}
          {staff.data?.length === 0 && (
            <p className={styles.empty}>Nobody has a platform role yet.</p>
          )}
          {staff.data?.map((account) => (
            <UserCard key={account.id} account={account} canEnforce />
          ))}
        </section>
      )}
    </div>
  )
}

function UserCard({ account, canEnforce }: { account: StaffUserView; canEnforce: boolean }) {
  const confirm = useConfirm()
  const toast = useToast()
  const suspend = useSuspendUserMutation()
  const reinstate = useReinstateUserMutation()
  const setRole = useSetPlatformRoleMutation()

  const [reason, setReason] = useState('')

  const PRESET_REASONS = [
    'Spam & Bot Activity',
    'Harassment & Hate Speech',
    'TOS Violation',
    'Compromised Account',
  ]

  async function handleSuspend() {
    // The reason is required by the server too — it is what the audit entry
    // will say, and an entry reading "suspended, no reason given" is useless to
    // whoever reads it in six months.
    if (!reason.trim()) {
      toast.error('A reason is required', 'It is what the audit entry will say.')
      return
    }
    const ok = await confirm({
      title: `Suspend @${account.handle}?`,
      description:
        'They are signed out everywhere immediately and cannot sign back in until reinstated.',
      confirmLabel: 'Suspend',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await suspend.mutateAsync({ userId: account.id, reason: reason.trim() })
      setReason('')
      toast.success(`@${account.handle} suspended`)
    } catch (cause) {
      toast.error('Could not suspend', errorText(cause))
    }
  }

  async function handleReinstate() {
    try {
      await reinstate.mutateAsync(account.id)
      toast.success(`@${account.handle} reinstated`)
    } catch (cause) {
      toast.error('Could not reinstate', errorText(cause))
    }
  }

  async function handleRole(role: PlatformRole) {
    try {
      await setRole.mutateAsync({ userId: account.id, role })
      toast.success(`@${account.handle} is now ${role}`)
    } catch (cause) {
      toast.error('Could not change the role', errorText(cause))
    }
  }

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <strong>{account.display_name ?? account.handle}</strong>
          <span className={styles.rowMeta}> @{account.handle}</span>
        </div>
        <div className={styles.badges}>
          {account.platform_role !== 'user' && (
            <Badge tone="accent">{account.platform_role}</Badge>
          )}
          {account.is_active ? (
            <Badge tone="success">active</Badge>
          ) : (
            <Badge tone="danger">suspended</Badge>
          )}
        </div>
      </div>

      <p className={styles.rowMeta}>
        {account.email} · joined {formatFull(account.created_at)}
      </p>

      {!account.is_active && account.suspension_reason && (
        <Callout tone="danger">
          Suspended {account.suspended_at ? formatFull(account.suspended_at) : ''} —{' '}
          {account.suspension_reason}
        </Callout>
      )}

      {canEnforce && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {account.is_active && (
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
            {account.is_active ? (
              <>
                <div style={{ flex: 1, minWidth: '14rem' }}>
                  <Input
                    label="Suspension Reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why this account is being suspended"
                    maxLength={280}
                  />
                </div>
                <Button variant="danger" onClick={() => void handleSuspend()}>
                  Suspend
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => void handleReinstate()}>
                Reinstate Account
              </Button>
            )}

            <div style={{ minWidth: '14rem' }}>
              <Select
                aria-label={`Platform role for ${account.handle}`}
                value={account.platform_role}
                onValueChange={(role) => void handleRole(role)}
                options={ROLES}
              />
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
