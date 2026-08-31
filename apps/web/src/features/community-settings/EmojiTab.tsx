import { useState, type FormEvent } from 'react'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { PlusIcon, TrashIcon } from '@/components/Icons'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/AlertDialog'
import {
  useCommunityEmojisQuery,
  useCreateEmojiMutation,
  useDeleteEmojiMutation,
  type CommunityWithPermissions,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { formatDayDivider } from '@/lib/time'

import { PanelList, PanelSkeleton } from './PanelList'
import type { CommunityAbilities } from './tabs'
import styles from './communitySettings.module.css'

/**
 * Mirrors `genzh_domain::emoji::validate_emoji_name`.
 *
 * Checked here so a bad name is refused while the field still has focus, not
 * after a round-trip. The server remains the authority — this is the courtesy,
 * not the rule.
 */
const NAME_PATTERN = /^[a-z0-9_]{2,32}$/

export function EmojiTab({
  community,
  abilities,
}: {
  community: CommunityWithPermissions
  abilities: CommunityAbilities
}) {
  const confirm = useConfirm()
  const toast = useToast()

  const emojiQuery = useCommunityEmojisQuery(community.id)
  const createEmoji = useCreateEmojiMutation(community.id)
  const deleteEmoji = useDeleteEmojiMutation(community.id)

  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  const canManage = abilities.isOwner || abilities.community
  const emoji = emojiQuery.data ?? []

  // Lower-cased as it is typed rather than on submit, so the field always shows
  // the name that will actually be stored — being silently renamed on save is
  // the kind of small surprise that makes people distrust a form.
  const normalisedName = name.trim().replace(/^:|:$/g, '').toLowerCase()

  const nameProblem =
    normalisedName === ''
      ? null
      : /^\d+$/.test(normalisedName)
        ? 'A name cannot be only digits — it would turn timestamps into emoji.'
        : !NAME_PATTERN.test(normalisedName)
          ? 'Use 2–32 letters, digits or underscores.'
          : emoji.some((entry) => entry.name === normalisedName)
            ? `:${normalisedName}: already exists here.`
            : null

  const urlProblem =
    imageUrl.trim() === '' || imageUrl.trim().startsWith('https://')
      ? null
      : 'The image must be an https:// link.'

  const ready =
    normalisedName !== '' && imageUrl.trim() !== '' && !nameProblem && !urlProblem

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!ready) return

    try {
      await createEmoji.mutateAsync({
        name: normalisedName,
        image_url: imageUrl.trim(),
        // Read from the file's extension rather than asked as a checkbox
        // nobody would understand: it only decides whether a client honours
        // "reduce motion", and the answer is on the end of the URL.
        is_animated: /\.(gif|webp|apng)(\?|#|$)/i.test(imageUrl.trim()),
      })
      toast.success(`:${normalisedName}: added`)
      setName('')
      setImageUrl('')
    } catch (cause) {
      toast.error('Could not add the emoji', errorText(cause))
    }
  }

  async function handleDelete(emojiId: string, emojiName: string) {
    const ok = await confirm({
      title: `Remove :${emojiName}:?`,
      // Said plainly, because it is the surprising part: the shortcode stays in
      // the text of every message that used it.
      description:
        'Messages that already used it will show the text ":' +
        emojiName +
        ':" instead of the picture. This cannot be undone.',
      confirmLabel: 'Remove emoji',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await deleteEmoji.mutateAsync(emojiId)
      toast.success(`:${emojiName}: removed`)
    } catch (cause) {
      toast.error('Could not remove the emoji', errorText(cause))
    }
  }

  return (
    <>
      <h2 className={styles.panelTitle}>Custom emoji</h2>
      <p className={styles.panelDescription}>
        Glyphs your members can type as <code>:name:</code> in any channel here, and use as
        reactions. Paste a link to an image you already host — square images under 128px look
        best.
      </p>

      {canManage && (
        <form className={styles.card} onSubmit={(e) => void handleCreate(e)}>
          <h3 className={styles.cardTitle}>Add an emoji</h3>

          <div className={styles.row}>
            <Input
              label="Name"
              className={styles.field}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="party_blob"
              maxLength={34}
              error={nameProblem}
            />
            <Input
              label="Image URL"
              className={styles.field}
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://…/blob.png"
              type="url"
              error={urlProblem}
            />
          </div>

          {/* A live preview of exactly what a message will draw, which is the
              only reliable way to catch a link that is not an image. */}
          {!urlProblem && imageUrl.trim() !== '' && (
            <p className={styles.fieldLabel}>
              Preview:{' '}
              <img
                src={imageUrl.trim()}
                alt=""
                style={{ width: '1.5rem', height: '1.5rem', objectFit: 'contain', verticalAlign: 'middle' }}
              />{' '}
              {normalisedName && <code>:{normalisedName}:</code>}
            </p>
          )}

          <div className={styles.cardActions}>
            <Button type="submit" disabled={!ready || createEmoji.isPending}>
              {createEmoji.isPending ? <Spinner /> : <PlusIcon size={14} />}
              Add emoji
            </Button>
          </div>
        </form>
      )}

      <h3 className={styles.listHeading}>
        {emoji.length > 0
          ? `${emoji.length} emoji`
          : 'Emoji'}
      </h3>

      {emojiQuery.error && (
        <Callout tone="danger">{errorText(emojiQuery.error, 'Could not load emoji')}</Callout>
      )}
      {emojiQuery.isLoading && <PanelSkeleton rows={3} />}

      {!emojiQuery.isLoading && (
        <PanelList
          empty={emoji.length === 0}
          emptyText={
            canManage
              ? 'No custom emoji yet. Add one above and everybody here can type it.'
              : 'This community has no custom emoji yet.'
          }
        >
          {emoji.map((entry) => (
            <li key={entry.id} className={styles.listItem}>
              <img
                src={entry.image_url}
                alt=""
                className={styles.listIcon}
                style={{ width: '1.75rem', height: '1.75rem', objectFit: 'contain' }}
                loading="lazy"
              />
              <div className={styles.listText}>
                <div className={styles.listPrimary}>
                  <span className={styles.listName}>:{entry.name}:</span>
                </div>
                <div className={styles.listSecondary}>
                  <span>Added {formatDayDivider(entry.created_at)}</span>
                </div>
              </div>

              {canManage && (
                <div className={styles.listActions}>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    onClick={() => void handleDelete(entry.id, entry.name)}
                    aria-label={`Remove :${entry.name}:`}
                    title={`Remove :${entry.name}:`}
                  >
                    <TrashIcon size={14} />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </PanelList>
      )}
    </>
  )
}
