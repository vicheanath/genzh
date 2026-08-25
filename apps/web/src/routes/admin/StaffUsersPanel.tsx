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

/** Find an account, see its state, and (as an admin) act on it. */
export function StaffUsersPanel() {
  const isAdmin = useIsPlatformAdmin()
  const [query, setQuery] = useState('')
  const results = useUserSearch(query)
  const staff = useStaffList()

  return (
    <div className={styles.stack}>
      <Input
        label="Find an account"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="handle or e-mail"
      />

      {results.isLoading && <Skeleton height="4rem" />}
      {results.error && (
        <Callout tone="danger">{errorText(results.error, 'Could not search')}</Callout>
      )}
      {query.trim() !== '' && results.data?.length === 0 && (
        <p className={styles.empty}>No account matches that.</p>
      )}

      {results.data?.map((account) => (
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
        <div className={styles.cardActions}>
          {account.is_active ? (
            <>
              <Input
                label="Reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="why this account is being suspended"
                maxLength={280}
              />
              <Button variant="danger" onClick={() => void handleSuspend()}>
                Suspend
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => void handleReinstate()}>
              Reinstate
            </Button>
          )}

          <Select
            aria-label={`Platform role for ${account.handle}`}
            value={account.platform_role}
            onValueChange={(role) => void handleRole(role)}
            options={ROLES}
          />
        </div>
      )}
    </article>
  )
}
