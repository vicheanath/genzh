import { useState, type FormEvent } from 'react'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { CopyIcon, LinkIcon, PlusIcon, TrashIcon } from '@/components/Icons'
import { Select } from '@/components/Select'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import type { CommunityWithPermissions } from '@/lib/api'
import {
  useCommunityInvites,
  useCreateInviteMutation,
  useRevokeInviteMutation,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatClock, formatDayDivider } from '@/lib/time'

import { PanelList, PanelSkeleton } from './PanelList'
import type { CommunityAbilities } from './tabs'
import styles from './communitySettings.module.css'
import { useConfirm } from '@/components/AlertDialog'

const EXPIRY_OPTIONS = [
  { value: '0', label: 'Never expires' },
  { value: '1', label: '1 hour' },
  { value: '6', label: '6 hours' },
  { value: '24', label: '1 day' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
]

const USES_OPTIONS = [
  { value: '0', label: 'Unlimited uses' },
  { value: '1', label: '1 use' },
  { value: '5', label: '5 uses' },
  { value: '10', label: '10 uses' },
  { value: '25', label: '25 uses' },
  { value: '50', label: '50 uses' },
  { value: '100', label: '100 uses' },
]

export function InvitesTab({
  community,
  abilities,
}: {
  community: CommunityWithPermissions
  abilities: CommunityAbilities
}) {
  const confirm = useConfirm()
  const toast = useToast()

  const invitesQuery = useCommunityInvites(community.id)
  const createInvite = useCreateInviteMutation(community.id)
  const revokeInvite = useRevokeInviteMutation(community.id)

  const [expiresInHours, setExpiresInHours] = useState('168') // 7 days default
  const [maxUses, setMaxUses] = useState('0') // unlimited default

  const canManage = abilities.isOwner || abilities.community

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    const exp = parseInt(expiresInHours, 10)
    const uses = parseInt(maxUses, 10)

    try {
      const invite = await createInvite.mutateAsync({
        expires_in_hours: exp > 0 ? exp : undefined,
        max_uses: uses > 0 ? uses : undefined,
      })
      toast.success('Invite link created')
      const url = `${window.location.origin}/invite/${invite.code}`
      void navigator.clipboard?.writeText(url)
    } catch (cause) {
      toast.error('Could not create invite link', errorText(cause))
    }
  }

  async function handleRevoke(code: string) {
    const ok = await confirm({
      title: 'Revoke invite link?',
      description: 'Anyone with this link will no longer be able to join the community.',
      confirmLabel: 'Revoke link',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await revokeInvite.mutateAsync(code)
      toast.success('Invite link revoked')
    } catch (cause) {
      toast.error('Could not revoke invite link', errorText(cause))
    }
  }

  function copyInvite(code: string) {
    const url = `${window.location.origin}/invite/${code}`
    void navigator.clipboard?.writeText(url)
    toast.success('Invite link copied')
  }

  const invites = (invitesQuery.data ?? []).filter((inv) => !inv.revoked_at)

  return (
    <>
      <h2 className={styles.panelTitle}>Invite Links</h2>
      <p className={styles.panelDescription}>
        Create and manage invite links for your community.
      </p>

      {canManage && (
        <form className={styles.card} onSubmit={(e) => void handleCreate(e)}>
          <h3 className={styles.cardTitle}>New invite link</h3>
          <div className={styles.row}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Expires after</span>
              <Select
                aria-label="Expiration"
                value={expiresInHours}
                onValueChange={setExpiresInHours}
                options={EXPIRY_OPTIONS}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Max uses</span>
              <Select
                aria-label="Max uses"
                value={maxUses}
                onValueChange={setMaxUses}
                options={USES_OPTIONS}
              />
            </div>
          </div>

          <div className={styles.cardActions}>
            <Button type="submit" disabled={createInvite.isPending}>
              {createInvite.isPending ? <Spinner /> : <PlusIcon size={14} />}
              Generate invite link
            </Button>
          </div>
        </form>
      )}

      <h3 className={styles.listHeading}>
        {invites.length > 0 ? `${invites.length} invite${invites.length === 1 ? '' : 's'}` : 'Invites'}
      </h3>

      {invitesQuery.error && (
        <Callout tone="danger">{errorText(invitesQuery.error, 'Could not load invite links')}</Callout>
      )}
      {invitesQuery.isLoading && <PanelSkeleton rows={3} />}

      {!invitesQuery.isLoading && (
        <PanelList
          empty={invites.length === 0}
          emptyText="No active invite links. Create one above to share with friends and grow your community."
        >
          {invites.map((invite) => {
            const isExpired = invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()
            const isMaxedOut = invite.max_uses !== null && invite.uses >= invite.max_uses

            return (
              <li key={invite.code} className={styles.listItem}>
                <LinkIcon size={18} className={styles.listIcon} />
                <div className={styles.listText}>
                  <div className={styles.listPrimary}>
                    <span className={styles.listName}>{invite.code}</span>
                    <Badge tone={isExpired || isMaxedOut ? 'danger' : 'accent'}>
                      {isExpired ? 'Expired' : isMaxedOut ? 'Used up' : `${invite.uses} ${invite.max_uses ? `/ ${invite.max_uses}` : ''} uses`}
                    </Badge>
                  </div>
                  <div className={styles.listSecondary}>
                    <span>Created {formatDayDivider(invite.created_at)}</span>
                    <span> · </span>
                    <span>
                      {invite.expires_at
                        ? `Expires ${formatDayDivider(invite.expires_at)} at ${formatClock(invite.expires_at)}`
                        : 'Never expires'}
                    </span>
                  </div>
                </div>

                <div className={styles.listActions}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => copyInvite(invite.code)}
                  >
                    <CopyIcon size={14} />
                    Copy link
                  </Button>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      onClick={() => void handleRevoke(invite.code)}
                      aria-label="Revoke invite link"
                      title="Revoke invite link"
                    >
                      <TrashIcon size={15} />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </PanelList>
      )}
    </>
  )
}
