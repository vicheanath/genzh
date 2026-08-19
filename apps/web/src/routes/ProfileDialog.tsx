import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useState, type FormEvent } from 'react'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  CopyIcon,
  ShieldIcon,
  UserPlusIcon,
} from '@/components/Icons'
import { Input } from '@/components/Input'
import { Skeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import {
  ApiError,
  auth as authApi,
  blocks as blocksApi,
  friends as friendsApi,
  users as usersApi,
  type CurrentUser,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'
import { primeProfile } from '@/lib/useProfiles'

import styles from './ProfileDialog.module.css'

const ACCENTS = [
  '#5865f2',
  '#57f287',
  '#fee75c',
  '#eb459e',
  '#ed4245',
  '#3ba55d',
  '#a855f7',
  '#06b6d4',
]

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetUserId?: Uuid
}

export function ProfileDialog({ open, onOpenChange, targetUserId }: ProfileDialogProps) {
  const { user } = useAuth()
  const isViewingSelf = !targetUserId || targetUserId === user?.id

  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.popup}>
          {isViewingSelf ? (
            <>
              <BaseDialog.Title className={styles.title}>Edit profile</BaseDialog.Title>
              <BaseDialog.Description className={styles.description}>
                This is what everyone else in your communities sees.
              </BaseDialog.Description>
              {user && (
                <ProfileForm key={String(open)} user={user} onDone={() => onOpenChange(false)} />
              )}
            </>
          ) : (
            <PublicProfileCard
              key={targetUserId}
              userId={targetUserId}
              onClose={() => onOpenChange(false)}
            />
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

function PublicProfileCard({
  userId,
  onClose,
}: {
  userId: Uuid
  onClose: () => void
}) {
  const { getToken } = useAuth()
  const toast = useToast()

  const publicProfile = useAsync(
    async () => usersApi.get(await getToken(), userId),
    [getToken, userId],
  )

  const [busy, setBusy] = useState(false)

  async function handleSendFriendRequest() {
    setBusy(true)
    try {
      await friendsApi.request(await getToken(), userId)
      toast.success('Friend request sent!')
    } catch (cause) {
      toast.error('Could not send request', cause instanceof ApiError ? cause.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  async function handleBlockUser() {
    setBusy(true)
    try {
      await blocksApi.block(await getToken(), userId)
      toast.success('User blocked', 'They can no longer message or interact with you.')
      onClose()
    } catch (cause) {
      toast.error('Could not block user', cause instanceof ApiError ? cause.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  function copyId() {
    void navigator.clipboard
      ?.writeText(userId)
      .then(() => toast.success('User ID copied!'))
      .catch(() => toast.error('Could not copy User ID'))
  }

  if (publicProfile.loading) {
    return (
      <div style={{ padding: '1rem' }}>
        <Skeleton height="70px" />
        <div style={{ marginTop: '-1.5rem' }}>
          <Skeleton circle width="3rem" height="3rem" />
        </div>
        <div style={{ marginTop: '1rem' }}>
          <Skeleton width="50%" height="1.2rem" />
        </div>
      </div>
    )
  }

  const profile = publicProfile.data

  return (
    <div>
      <div
        className={styles.preview}
        style={{ '--preview-accent': profile?.accent_color ?? '#5865f2' } as React.CSSProperties}
      >
        <div className={styles.previewBanner} />
        <Avatar
          name={profile?.display_name ?? '?'}
          src={profile?.avatar_url}
          color={profile?.accent_color}
          size="xl"
          presence="online"
          className={styles.previewAvatar}
        />
        <div className={styles.previewText}>
          <div className={styles.previewName}>{profile?.display_name ?? 'User Profile'}</div>
          <div className={styles.previewHandle}>@{profile?.handle}</div>
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
            {userId}
          </span>
          <Button size="sm" variant="secondary" onClick={copyId}>
            <CopyIcon size={14} />
            Copy ID
          </Button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <Button
            size="sm"
            onClick={() => void handleSendFriendRequest()}
            disabled={busy}
            style={{ flex: 1 }}
          >
            {busy && <Spinner />}
            <UserPlusIcon size={15} />
            Add Friend
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void handleBlockUser()}
            disabled={busy}
          >
            <ShieldIcon size={15} />
            Block
          </Button>
        </div>
      </div>
    </div>
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
