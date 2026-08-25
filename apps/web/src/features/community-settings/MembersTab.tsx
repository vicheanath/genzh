import { useState, type CSSProperties } from 'react'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { CrownIcon, UserMinusIcon, XIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { useToast } from '@/components/Toast'
import {
  useAssignRoleMutation,
  useCommunityMembers,
  useCommunityRoles,
  useLeaveCommunityMutation,
  useRemoveRoleMutation,
} from '@/features/api'
import {
  type CommunityWithPermissions,
  type Uuid,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { usePresence } from '@/lib/usePresence'
import { useProfiles } from '@/lib/useProfiles'

import { PanelList, PanelSkeleton } from './PanelList'
import type { CommunityAbilities } from './tabs'
import styles from './communitySettings.module.css'
import { useConfirm } from '@/components/AlertDialog'

export function MembersTab({
  community,
  abilities,
}: {
  community: CommunityWithPermissions
  abilities: CommunityAbilities
}) {
  const confirm = useConfirm()

  const toast = useToast()
  const { isOnline } = usePresence()

  const members = useCommunityMembers(community.id)
  const assignRoleMutation = useAssignRoleMutation(community.id)
  const removeRoleMutation = useRemoveRoleMutation(community.id)
  const leaveCommunity = useLeaveCommunityMutation()

  // Only fetched when there is something to do with it. Someone who cannot
  // assign roles has no reason to pay for the list.
  const roles = useCommunityRoles(abilities.roles ? community.id : null)

  const [search, setSearch] = useState('')
  const lookup = useProfiles(members.data?.map((member) => member.user_id) ?? [])

  async function assignRole(userId: Uuid, roleId: Uuid) {
    try {
      // The mutation invalidates the member list, so the row redraws with the
      // new role: the assignment used to succeed silently and leave the row
      // exactly as it was, which is indistinguishable from having done nothing.
      await assignRoleMutation.mutateAsync({ userId, roleId })
      toast.success('Role assigned')
    } catch (cause) {
      toast.error('Could not assign role', errorText(cause))
    }
  }

  async function removeRole(userId: Uuid, roleId: Uuid, roleName: string, name: string) {
    try {
      await removeRoleMutation.mutateAsync({ userId, roleId })
      toast.success(`${roleName} removed from ${name}`)
    } catch (cause) {
      toast.error('Could not remove role', errorText(cause))
    }
  }

  async function remove(userId: Uuid, name: string) {
    const ok = await confirm({
      title: `Remove ${name}?`,
      description: `They lose access to ${community.name} and every channel in it. They can be invited back.`,
      confirmLabel: 'Remove member',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await leaveCommunity.mutateAsync({ communityId: community.id, userId })
      toast.success('Member removed')
    } catch (cause) {
      toast.error('Could not remove member', errorText(cause))
    }
  }

  /** Roles this member could still be given. */
  function assignable(userId: Uuid) {
    const held = new Set(
      (members.data ?? [])
        .find((member) => member.user_id === userId)
        ?.roles.map((role) => role.id) ?? [],
    )
    return (roles.data ?? []).filter((role) => !role.is_default && !held.has(role.id))
  }

  const needle = search.trim().toLowerCase()
  const filtered = (members.data ?? []).filter((member) => {
    if (!needle) return true
    const profile = lookup(member.user_id)
    return (
      profile?.display_name.toLowerCase().includes(needle) ||
      profile?.handle.toLowerCase().includes(needle) ||
      member.nickname?.toLowerCase().includes(needle)
    )
  })

  const total = members.data?.length ?? 0

  return (
    <>
      <h2 className={styles.panelTitle}>Members</h2>
      <p className={styles.panelDescription}>
        {total === 0 ? 'Nobody here yet.' : `${total} ${total === 1 ? 'person' : 'people'} in this server.`}
      </p>

      {total > 0 && (
        <Input
          label="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name or handle"
        />
      )}

      {members.error && <Callout tone="danger">{errorText(members.error, 'Could not load members')}</Callout>}
      {members.isLoading && <PanelSkeleton rows={4} />}

      <PanelList
        empty={!members.isLoading && filtered.length === 0}
        emptyText={needle ? `Nobody matches “${search.trim()}”.` : 'No members yet.'}
      >
        {filtered.map((member) => {
          const profile = lookup(member.user_id)
          const name = member.nickname ?? profile?.display_name ?? 'Loading…'
          const isOwner = member.user_id === community.owner_id

          return (
            <li key={member.user_id} className={styles.listItem}>
              <Avatar
                name={name}
                src={profile?.avatar_url}
                color={profile?.accent_color}
                size="sm"
                presence={isOnline(member.user_id) ? 'online' : undefined}
              />

              <span className={styles.listText}>
                <span className={styles.listLabel}>
                  {name}
                  {isOwner && (
                    <CrownIcon size={13} className={styles.ownerMark} aria-label="Owner" />
                  )}
                </span>
                <span className={styles.listHint}>
                  @{profile?.handle ?? member.user_id.slice(0, 8)}
                </span>

                {member.roles.length > 0 && (
                  <span className={styles.roleChips}>
                    {member.roles.map((role) => (
                      <span
                        key={role.id}
                        className={styles.roleChip}
                        style={{ '--role-color': role.color ?? 'var(--color-accent)' } as CSSProperties}
                      >
                        {role.name}
                        {abilities.roles && (
                          <button
                            type="button"
                            className={styles.roleChipRemove}
                            onClick={() =>
                              void removeRole(member.user_id, role.id, role.name, name)
                            }
                            aria-label={`Remove ${role.name} from ${name}`}
                          >
                            <XIcon size={11} />
                          </button>
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </span>

              <span className={styles.listActions}>
                {/* Only what they do not already hold, and never `@everyone`,
                    which is not assignable — offering either would be a menu
                    item whose only outcome is a no-op or an error. */}
                {abilities.roles && assignable(member.user_id).length > 0 && (
                  <Select
                    aria-label={`Assign a role to ${name}`}
                    value=""
                    onValueChange={(roleId) => roleId && void assignRole(member.user_id, roleId)}
                    options={[
                      { value: '', label: 'Assign role…' },
                      ...assignable(member.user_id).map((role) => ({
                        value: role.id,
                        label: role.name,
                      })),
                    ]}
                  />
                )}

                {/* The owner cannot be removed — the server would be left
                    without one, and the API refuses it anyway. */}
                {abilities.members && !isOwner && (
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    onClick={() => void remove(member.user_id, name)}
                    aria-label={`Remove ${name}`}
                  >
                    <UserMinusIcon size={16} />
                  </Button>
                )}
              </span>
            </li>
          )
        })}
      </PanelList>
    </>
  )
}
