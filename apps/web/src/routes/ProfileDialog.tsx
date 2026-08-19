import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useState, type FormEvent } from 'react'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { ApiError, auth as authApi, type CurrentUser } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { primeProfile } from '@/lib/useProfiles'

import styles from './ProfileDialog.module.css'

/** Accent choices, as OKLCH so the swatches stay evenly bright across hues. */
const ACCENTS = [
  'oklch(0.62 0.19 275)',
  'oklch(0.65 0.2 330)',
  'oklch(0.64 0.17 20)',
  'oklch(0.7 0.16 60)',
  'oklch(0.7 0.15 145)',
  'oklch(0.68 0.13 200)',
]

/**
 * Edit the signed-in user's profile.
 *
 * Everything previews live against the current values, because the one thing a
 * profile editor must answer — "what will other people see?" — is not
 * answerable from a form full of text fields.
 */
export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()

  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.popup}>
          <BaseDialog.Title className={styles.title}>Edit profile</BaseDialog.Title>
          <BaseDialog.Description className={styles.description}>
            This is what everyone else in your communities sees.
          </BaseDialog.Description>

          {/* Keyed on `open` so each opening mounts a fresh form seeded from the
              saved profile — cancelling an edit cannot leave it behind. */}
          {user && (
            <ProfileForm key={String(open)} user={user} onDone={() => onOpenChange(false)} />
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

function ProfileForm({ user, onDone }: { user: CurrentUser; onDone: () => void }) {
  const { getToken, applyProfile } = useAuth()
  const toast = useToast()

  const [displayName, setDisplayName] = useState(user.profile.display_name)
  const [bio, setBio] = useState(user.profile.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user.profile.avatar_url ?? '')
  const [accent, setAccent] = useState<string | null>(user.profile.accent_color)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const profile = await authApi.updateProfile(await getToken(), {
        display_name: displayName.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl.trim(),
        ...(accent ? { accent_color: accent } : {}),
      })
      applyProfile(profile)
      // Keep the shared author cache in step, so your own messages in the
      // transcript pick the change up without a reload.
      primeProfile({
        id: user.id,
        handle: user.handle,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        avatar_effect: profile.avatar_effect,
        accent_color: profile.accent_color,
      })
      toast.success('Profile saved')
      onDone()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save your profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* The preview is the point of the dialog, so it leads. */}
      <div
        className={styles.preview}
        style={{ '--preview-accent': accent ?? undefined } as React.CSSProperties}
      >
        <div className={styles.previewBanner} />
        <Avatar
          name={displayName || user.handle}
          src={avatarUrl || null}
          color={accent}
          size="xl"
          presence="online"
          className={styles.previewAvatar}
        />
        <div className={styles.previewText}>
          <div className={styles.previewName}>{displayName || user.handle}</div>
          <div className={styles.previewHandle}>@{user.handle}</div>
          {bio && <p className={styles.previewBio}>{bio}</p>}
        </div>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <form className={styles.form} onSubmit={save}>
        <Input
          label="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={32}
          required
        />

        <Input
          label="Bio"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          placeholder="Something about you"
          maxLength={190}
        />

        <Input
          label="Avatar URL"
          value={avatarUrl}
          onChange={(event) => setAvatarUrl(event.target.value)}
          placeholder="https://…"
          spellCheck={false}
          description="Leave it blank to use your initials."
        />

        <fieldset className={styles.accents}>
          <legend className={styles.accentsLabel}>Accent</legend>
          <div className={styles.swatches}>
            {ACCENTS.map((value, index) => (
              <button
                key={value}
                type="button"
                className={styles.swatch}
                style={{ background: value }}
                // The colour is the whole content, so the label has to carry
                // the meaning instead.
                aria-label={`Accent ${index + 1}`}
                aria-pressed={accent === value}
                data-selected={accent === value || undefined}
                onClick={() => setAccent(value)}
              />
            ))}
          </div>
        </fieldset>

        <div className={styles.actions}>
          <BaseDialog.Close render={<Button variant="secondary">Cancel</Button>} />
          <Button type="submit" disabled={saving || !displayName.trim()}>
            {saving && <Spinner />}
            Save
          </Button>
        </div>
      </form>
    </>
  )
}
