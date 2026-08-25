import { useMemo, useState, type CSSProperties } from 'react'

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

  // Only fetched when permitted.
  const roles = useCommunityRoles(community.id)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  const memberList = members.data ?? []
  const userIds = useMemo(() => memberList.map((m) => m.user_id), [memberList])
  const lookup = useProfiles(userIds)

  async function assignRole(userId: Uuid, roleId: Uuid) {
    try {
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
  const filtered = useMemo(() => {
    return memberList.filter((member) => {
      // Role filter check
      if (roleFilter !== 'all') {
        const hasRole = member.roles.some((r) => r.id === roleFilter)
        if (!hasRole) return false
      }

      if (!needle) return true
      const profile = lookup(member.user_id)
      return (
        profile?.display_name.toLowerCase().includes(needle) ||
        profile?.handle.toLowerCase().includes(needle) ||
        member.nickname?.toLowerCase().includes(needle)
      )
    })
  }, [memberList, roleFilter, needle, lookup])

  const total = memberList.length
  const onlineCount = useMemo(() => {
    return memberList.filter((m) => isOnline(m.user_id)).length
  }, [memberList, isOnline])
  const roleCount = roles.data?.length ?? 0

  const roleFilterOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'All Roles' }]
    for (const r of roles.data ?? []) {
      if (!r.is_default) {
        opts.push({ value: r.id, label: `@${r.name}` })
      }
    }
    return opts
  }, [roles.data])

  return (
    <>
      <h2 className={styles.panelTitle}>Members</h2>
      <p className={styles.panelDescription}>
        Manage server members and their assigned roles and permissions.
      </p>

      {/* Member Statistics */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{total}</span>
          <span className={styles.statLabel}>Total Members</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue} style={{ color: 'var(--color-mint)' }}>
            {onlineCount}
          </span>
          <span className={styles.statLabel}>Online Now</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{roleCount}</span>
          <span className={styles.statLabel}>Configured Roles</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className={styles.filterRow}>
        <div style={{ flex: 1 }}>
          <Input
            label="Search members"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, handle, or nickname..."
          />
        </div>

        {roleFilterOptions.length > 1 && (
          <div style={{ minWidth: '11rem' }}>
            <Select
              aria-label="Filter by role"
              value={roleFilter}
              onValueChange={setRoleFilter}
              options={roleFilterOptions}
            />
          </div>
        )}
      </div>

      <h3 className={styles.listHeading}>
        {filtered.length} {filtered.length === 1 ? 'member' : 'members'}
      </h3>

      {members.error && <Callout tone="danger">{errorText(members.error, 'Could not load members')}</Callout>}
      {members.isLoading && <PanelSkeleton rows={4} />}

      <PanelList
        empty={!members.isLoading && filtered.length === 0}
        emptyText={
          needle || roleFilter !== 'all'
            ? 'No members match the selected filters.'
            : 'No members in this server yet.'
        }
      >
        {filtered.map((member) => {
          const profile = lookup(member.user_id)
          const name = member.nickname ?? profile?.display_name ?? 'Loading…'
          const isOwner = member.user_id === community.owner_id
          const availableRoles = assignable(member.user_id)

          return (
            <li key={member.user_id} className={styles.listItem}>
              <Avatar
                name={name}
                src={profile?.avatar_url}
                color={profile?.accent_color}
                size="md"
                presence={isOnline(member.user_id) ? 'online' : undefined}
              />

              <div className={styles.listText}>
                <div className={styles.listLabel}>
                  <span>{name}</span>
                  {isOwner && (
                    <span title="Server Owner">
                      <CrownIcon size={14} className={styles.ownerMark} aria-label="Server Owner" />
                    </span>
                  )}
                </div>
                <div className={styles.listHint}>
                  @{profile?.handle ?? member.user_id.slice(0, 8)}
                  {member.nickname && profile?.display_name && (
                    <span> · {profile.display_name}</span>
                  )}
                </div>

                {member.roles.length > 0 && (
                  <div className={styles.roleChips}>
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
                            title={`Remove ${role.name}`}
                          >
                            <XIcon size={11} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.listActions}>
                {abilities.roles && availableRoles.length > 0 && (
                  <Select
                    aria-label={`Assign role to ${name}`}
                    value=""
                    onValueChange={(roleId) => roleId && void assignRole(member.user_id, roleId)}
                    options={[
                      { value: '', label: '+ Add Role' },
                      ...availableRoles.map((role) => ({
                        value: role.id,
                        label: role.name,
                      })),
                    ]}
                  />
                )}

                {abilities.members && !isOwner && (
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    onClick={() => void remove(member.user_id, name)}
                    aria-label={`Remove ${name}`}
                    title="Remove from server"
                  >
                    <UserMinusIcon size={16} />
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </PanelList>
    </>
  )
}
