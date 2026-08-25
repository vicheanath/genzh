import { useMemo, useState } from 'react'

import { useConfirm } from '@/components/AlertDialog'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Checkbox } from '@/components/Checkbox'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useBulkReinstateMutation,
  useBulkSuspendMutation,
  useIsPlatformAdmin,
  useReinstateUserMutation,
  useRevokeUserSessionsMutation,
  useSetPlatformRoleMutation,
  useStaffList,
  useSearchedAccounts,
  useStaffUpdateUserProfileMutation,
  useSuspendUserMutation,
  useUserSearch,
  type BulkOutcome,
  type BulkReport,
  type PlatformRole,
  type StaffUserView,
} from '@/features/api'
import type { Uuid } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import { Pager } from './Pager'
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
  const accounts = useSearchedAccounts(results)

  // Keyed by id rather than by index: the list grows as pages load and shrinks
  // as filters change, so a positional selection would silently come to mean
  // different accounts than the ones that were ticked.
  const [selected, setSelected] = useState<ReadonlySet<Uuid>>(new Set())

  // Only what is still on screen counts. Narrowing the filter after ticking
  // somebody must not leave them queued for a suspension nobody can see.
  const visibleSelection = useMemo(
    () => accounts.filter((account) => selected.has(account.id)).map((account) => account.id),
    [accounts, selected],
  )

  const toggle = (id: Uuid, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

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

      {accounts.map((account) =>
        isAdmin ? (
          <div key={account.id} className={styles.selectRow}>
            <Checkbox
              checked={selected.has(account.id)}
              onCheckedChange={(checked) => toggle(account.id, checked === true)}
              aria-label={`Select @${account.handle}`}
            />
            <UserCard account={account} canEnforce />
          </div>
        ) : (
          <UserCard key={account.id} account={account} canEnforce={false} />
        ),
      )}

      <Pager
        loaded={accounts.length}
        hasMore={Boolean(results.hasNextPage)}
        isLoading={results.isFetchingNextPage}
        onLoadMore={() => results.fetchNextPage()}
        label="Load older accounts"
        noun="accounts"
      />

      {isAdmin && visibleSelection.length > 0 && (
        <BulkBar
          userIds={visibleSelection}
          onDone={() => setSelected(new Set())}
        />
      )}

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

/**
 * The bulk action bar, shown only while something is selected.
 *
 * Suspension needs a reason and reinstatement does not — the reason is what the
 * audit entry will say, and one is written per account rather than one for the
 * batch. That is why the confirmation names the count: forty audit entries with
 * the same reason is the intended outcome, and it should be an intended one.
 */
function BulkBar({ userIds, onDone }: { userIds: Uuid[]; onDone: () => void }) {
  const confirm = useConfirm()
  const toast = useToast()
  const suspend = useBulkSuspendMutation()
  const reinstate = useBulkReinstateMutation()
  const [reason, setReason] = useState('')

  const busy = suspend.isPending || reinstate.isPending
  const count = userIds.length

  /**
   * Report a batch honestly.
   *
   * A settled mutation is not "it worked": the request succeeded and each
   * account has its own outcome. Naming the accounts that failed is the whole
   * point — a moderator told only "37 of 40" has no way to find the other three.
   */
  const report = (result: BulkReport, verb: string) => {
    if (result.failed === 0) {
      toast.success(`${verb} ${result.succeeded} accounts`)
    } else {
      const failed = result.outcomes
        .filter((outcome: BulkOutcome) => !outcome.succeeded)
        .map((outcome: BulkOutcome) => outcome.handle ?? outcome.user_id)
      toast.error(
        `${verb} ${result.succeeded}, ${result.failed} could not be`,
        failed.join(', '),
      )
    }
    onDone()
  }

  return (
    <div className={styles.bulkBar}>
      <span className={styles.bulkCount}>
        {count} account{count === 1 ? '' : 's'} selected
      </span>

      <div className={styles.bulkReason}>
        <Input
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why — recorded against every account"
        />
      </div>

      <span className={styles.bulkSpacer} />

      <Button variant="ghost" onClick={onDone} disabled={busy}>
        Clear
      </Button>

      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          if (
            !(await confirm({
              title: `Reinstate ${count} account${count === 1 ? '' : 's'}?`,
              description:
                'Each will be able to sign in again, and each gets its own audit entry.',
              confirmLabel: 'Reinstate',
            }))
          )
            return
          try {
            report(await reinstate.mutateAsync(userIds), 'Reinstated')
          } catch (error) {
            toast.error(errorText(error, 'Could not reinstate'))
          }
        }}
      >
        Reinstate
      </Button>

      <Button
        variant="danger"
        // The reason is required by the server too; disabling here turns a
        // round trip into an obvious blank field.
        disabled={busy || reason.trim().length === 0}
        onClick={async () => {
          if (
            !(await confirm({
              title: `Suspend ${count} account${count === 1 ? '' : 's'}?`,
              description: `Each will be signed out and unable to return. The reason "${reason.trim()}" is recorded against every one of them.`,
              confirmLabel: 'Suspend',
              tone: 'danger',
            }))
          )
            return
          try {
            report(
              await suspend.mutateAsync({ userIds, reason: reason.trim() }),
              'Suspended',
            )
            setReason('')
          } catch (error) {
            toast.error(errorText(error, 'Could not suspend'))
          }
        }}
      >
        Suspend
      </Button>
    </div>
  )
}

function UserCard({ account, canEnforce }: { account: StaffUserView; canEnforce: boolean }) {
  const confirm = useConfirm()
  const toast = useToast()
  const suspend = useSuspendUserMutation()
  const reinstate = useReinstateUserMutation()
  const setRole = useSetPlatformRoleMutation()

  const revokeSessions = useRevokeUserSessionsMutation()
  const updateProfile = useStaffUpdateUserProfileMutation()

  const [reason, setReason] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [modHandle, setModHandle] = useState(account.handle)
  const [modDisplayName, setModDisplayName] = useState(account.display_name ?? '')

  const PRESET_REASONS = [
    'Spam & Bot Activity',
    'Harassment & Hate Speech',
    'TOS Violation',
    'Compromised Account',
  ]

  async function handleRevokeSessions() {
    const ok = await confirm({
      title: `Revoke all sessions for @${account.handle}?`,
      description: 'The user will be immediately logged out of all active devices.',
      confirmLabel: 'Revoke Sessions',
    })
    if (!ok) return
    try {
      await revokeSessions.mutateAsync(account.id)
      toast.success(`Sessions revoked for @${account.handle}`)
    } catch (cause) {
      toast.error('Could not revoke sessions', errorText(cause))
    }
  }

  async function handleSaveProfile() {
    try {
      await updateProfile.mutateAsync({
        userId: account.id,
        patch: {
          handle: modHandle.trim() || undefined,
          display_name: modDisplayName.trim() || undefined,
        },
      })
      setEditingProfile(false)
      toast.success(`Profile updated for @${account.handle}`)
    } catch (cause) {
      toast.error('Could not update profile', errorText(cause))
    }
  }

  async function handleSuspend() {
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

      {editingProfile && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'flex-end', padding: 'var(--space-2) 0' }}>
          <Input
            label="Moderate Handle"
            value={modHandle}
            onChange={(e) => setModHandle(e.target.value)}
          />
          <Input
            label="Moderate Display Name"
            value={modDisplayName}
            onChange={(e) => setModDisplayName(e.target.value)}
          />
          <Button size="sm" onClick={() => void handleSaveProfile()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingProfile(false)}>Cancel</Button>
        </div>
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

            <Button variant="ghost" size="sm" onClick={() => void handleRevokeSessions()}>
              Revoke Sessions
            </Button>

            <Button variant="ghost" size="sm" onClick={() => setEditingProfile(!editingProfile)}>
              Moderate Profile
            </Button>

            <div style={{ minWidth: '12rem' }}>
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
