import { useState, type FormEvent } from 'react'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { PlusIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import {
  ApiError,
  communities as communitiesApi,
  type CommunityWithPermissions,
  type Permission,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'
import { DEFAULT_ACCENT } from '@/lib/palette'

import {
  ALL_PERMISSIONS,
  DEFAULT_NEW_ROLE_PERMISSIONS,
  summarisePermissions,
} from './permissions'
import type { CommunityAbilities } from './tabs'
import { PanelList, PanelSkeleton } from './PanelList'
import styles from './communitySettings.module.css'

/** The colour a new role gets before anyone picks one. */
const DEFAULT_ROLE_COLOR = DEFAULT_ACCENT

export function RolesTab({
  community,
  abilities,
}: {
  community: CommunityWithPermissions
  abilities: CommunityAbilities
}) {
  const { getToken } = useAuth()
  const toast = useToast()

  const roles = useAsync(
    async () => communitiesApi.roles(await getToken(), community.id),
    [getToken, community.id],
  )

  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_ROLE_COLOR)
  const [granted, setGranted] = useState<Set<Permission>>(
    () => new Set(DEFAULT_NEW_ROLE_PERMISSIONS),
  )
  const [creating, setCreating] = useState(false)

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      await communitiesApi.createRole(await getToken(), community.id, {
        name: name.trim(),
        color,
        permissions: [...granted],
      })
      setName('')
      setGranted(new Set(DEFAULT_NEW_ROLE_PERMISSIONS))
      roles.reload()
      toast.success('Role created')
    } catch (cause) {
      toast.error('Could not create role', cause instanceof ApiError ? cause.message : undefined)
    } finally {
      setCreating(false)
    }
  }

  function toggle(permission: Permission, on: boolean) {
    setGranted((current) => {
      const next = new Set(current)
      if (on) next.add(permission)
      else next.delete(permission)
      return next
    })
  }

  return (
    <>
      <h2 className={styles.panelTitle}>Roles &amp; permissions</h2>
      <p className={styles.panelDescription}>
        A role is a bundle of permissions you hand to people. Everyone gets the default role;
        anything beyond it is a role you make here.
      </p>

      {abilities.roles && (
        <form className={styles.card} onSubmit={create}>
          <h3 className={styles.cardTitle}>New role</h3>

          <div className={styles.row}>
            <Input
              className={styles.grow}
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Moderator"
              maxLength={48}
              required
            />
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="role-color">
                Colour
              </label>
              {/* A colour input rather than a text field: the value is a hex
                  string either way, and typing one blind is not a design tool. */}
              <input
                id="role-color"
                type="color"
                className={styles.colorInput}
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </div>
          </div>

          <div className={styles.fieldLabel}>Permissions to grant</div>
          <div className={styles.permissions}>
            {ALL_PERMISSIONS.map((permission) => (
              <label key={permission.id} className={styles.permission}>
                <span className={styles.permissionText}>
                  <span className={styles.permissionLabel}>{permission.label}</span>
                  <span className={styles.permissionHint}>{permission.description}</span>
                </span>
                <Switch
                  checked={granted.has(permission.id)}
                  onCheckedChange={(checked) => toggle(permission.id, checked)}
                />
              </label>
            ))}
          </div>

          <div className={styles.cardActions}>
            <Button type="submit" disabled={creating || !name.trim()}>
              {creating ? <Spinner /> : <PlusIcon size={14} />}
              Create role
            </Button>
          </div>
        </form>
      )}

      <h3 className={styles.listHeading}>Server roles</h3>

      {roles.error && <Callout tone="danger">{roles.error}</Callout>}
      {roles.loading && <PanelSkeleton rows={3} />}

      <PanelList
        empty={!roles.loading && (roles.data?.length ?? 0) === 0}
        emptyText="No roles yet. The default role covers everyone until you add one."
      >
        {roles.data?.map((role) => (
          <li key={role.id} className={styles.listItem}>
            <span
              className={styles.roleDot}
              style={{ background: role.color ?? DEFAULT_ROLE_COLOR }}
              aria-hidden
            />
            <span className={styles.listText}>
              <span className={styles.listLabel}>
                {role.name}
                {role.is_default && <Badge>Default</Badge>}
              </span>
              <span className={styles.listHint}>{summarisePermissions(role.permissions)}</span>
            </span>
          </li>
        ))}
      </PanelList>
    </>
  )
}
