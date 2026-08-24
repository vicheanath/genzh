import { useState, type FormEvent } from 'react'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { CopyIcon, TrashIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import {
  ApiError,
  type CommunityWithPermissions,
} from '@/lib/api'
import { communitiesApi } from '@/features/communities'
import { useAuth } from '@/lib/auth'

import type { CommunityAbilities } from './tabs'
import styles from './communitySettings.module.css'
import { useConfirm } from '@/components/AlertDialog'

/**
 * Who the server is: name, icon, description, and the two irreversible things.
 *
 * Deleting lives here rather than in the nav, where it used to sit as a
 * permanently visible red button next to the ordinary destinations. A
 * destructive action is not a place to go — it belongs at the bottom of the
 * page it destroys, behind a heading that says so.
 */
export function OverviewTab({
  community,
  abilities,
  onUpdated,
  onDeleted,
}: {
  community: CommunityWithPermissions
  abilities: CommunityAbilities
  onUpdated?: () => void
  onDeleted?: () => void
}) {
  const confirm = useConfirm()
  const { getToken } = useAuth()
  const toast = useToast()

  const [name, setName] = useState(community.name)
  const [description, setDescription] = useState(community.description ?? '')
  const [iconUrl, setIconUrl] = useState(community.icon_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editable = abilities.community

  async function save(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await communitiesApi.update(await getToken(), community.id, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        icon_url: iconUrl.trim() || undefined,
      })
      toast.success('Server settings saved')
      onUpdated?.()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save server settings')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${community.name}?`,
      description: 'Every channel and every message in them goes with it. This cannot be undone.',
      confirmLabel: 'Delete community',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await communitiesApi.delete(await getToken(), community.id)
      toast.success('Server deleted')
      onDeleted?.()
    } catch (cause) {
      toast.error('Could not delete server', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  function copyId() {
    void navigator.clipboard
      ?.writeText(community.id)
      .then(() => toast.success('Invite code copied'))
      .catch(() => toast.error('Could not copy the invite code'))
  }

  return (
    <>
      <h2 className={styles.panelTitle}>Overview</h2>
      <p className={styles.panelDescription}>
        {editable
          ? 'How this server introduces itself, and how people get in.'
          : 'How this server introduces itself. You do not have permission to change it.'}
      </p>

      {error && <Callout tone="danger">{error}</Callout>}

      <div className={styles.identity}>
        <Avatar name={name || community.name} src={iconUrl || community.icon_url} size="xl" />
        <div className={styles.identityText}>
          <h3 className={styles.identityName}>{name || community.name}</h3>
          <p className={styles.identityMeta}>
            Created {new Date(community.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <form className={styles.form} onSubmit={save}>
        <Input
          label="Server name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Enter a server name"
          maxLength={64}
          required
          disabled={!editable}
        />

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="community-description">
            Description
          </label>
          <textarea
            id="community-description"
            className={styles.textarea}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this server about?"
            rows={3}
            disabled={!editable}
          />
        </div>

        <Input
          label="Icon URL"
          value={iconUrl}
          onChange={(event) => setIconUrl(event.target.value)}
          placeholder="https://example.com/icon.png"
          disabled={!editable}
        />

        <section className={styles.card}>
          <div className={styles.cardText}>
            <h3 className={styles.cardTitle}>Invite code</h3>
            {/* The id is the invite, so it is shown in full rather than
                truncated — a code you have to select carefully is a code people
                paste wrong. */}
            <p className={styles.code}>{community.id}</p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={copyId}>
            <CopyIcon size={14} />
            Copy
          </Button>
        </section>

        {editable && (
          <div>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner />}
              Save changes
            </Button>
          </div>
        )}
      </form>

      {abilities.isOwner && (
        <section className={styles.danger}>
          <h3 className={styles.dangerTitle}>Danger zone</h3>
          <div className={styles.dangerRow}>
            <p className={styles.dangerText}>
              Deleting the server removes every channel, message and membership. It cannot be
              undone.
            </p>
            <Button type="button" variant="danger" onClick={() => void remove()}>
              <TrashIcon size={15} />
              Delete server
            </Button>
          </div>
        </section>
      )}
    </>
  )
}
