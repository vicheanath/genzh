import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  CopyIcon,
  LockIcon,
  MessageSquareIcon,
  ShieldIcon,
  UserPlusIcon,
  UsersIcon,
} from '@/components/Icons'
import { Input } from '@/components/Input'
import { Skeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { Switch } from '@/components/Switch'
import {
  ApiError,
  auth as authApi,
  blocks as blocksApi,
  friends as friendsApi,
  rooms as roomsApi,
  users as usersApi,
  type CurrentUser,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAppStore } from '@/lib/store'
import { useAsync } from '@/lib/useAsync'
import { usePresence } from '@/lib/usePresence'
import { ACCENT_COLORS as ACCENTS } from '@/lib/palette'
import { primeProfile } from '@/lib/useProfiles'

import styles from './ProfileDialog.module.css'



const RANDOM_ALIASES = [
  'Shadow Fox',
  'Neon Phantom',
  'Cyber Panda',
  'Midnight Owl',
  'Pixel Knight',
  'Cosmic Voyager',
  'Stealth Tiger',
  'Quantum Hawk',
  'Nebula Dragon',
  'Mystic Wolf',
  'Astral Lynx',
  'Echo Viper',
]

const MASK_SYMBOLS = ['🎭', '🕶️', '🦊', '👻', '🤖', '🦉', '🐺', '🐼', '⚡', '🔮', '👾', '🛸']

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
              <BaseDialog.Title className={styles.title}>Edit Profile & Identity</BaseDialog.Title>
              <BaseDialog.Description className={styles.description}>
                Customize your public account or masked anonymous persona.
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
  const navigate = useNavigate()
  const toast = useToast()
  const { isOnline } = usePresence()

  const publicProfile = useAsync(
    async () => usersApi.get(await getToken(), userId),
    [getToken, userId],
  )

  const [busy, setBusy] = useState(false)

  async function handleOpenDM() {
    setBusy(true)
    try {
      const token = await getToken()
      const targetName = publicProfile.data?.display_name ?? 'User'
      const dmRoom = await roomsApi.openDM(token, userId)
      toast.success(`Opening conversation with ${targetName}!`)
      onClose()
      void navigate(`/rooms/${dmRoom.id}`)
    } catch (cause) {
      toast.error('Could not start direct message', cause instanceof ApiError ? cause.message : undefined)
    } finally {
      setBusy(false)
    }
  }

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
        style={
          { '--preview-accent': profile?.accent_color ?? 'var(--color-accent)' } as React.CSSProperties
        }
      >
        <div className={styles.previewBanner} />
        <Avatar
          name={profile?.display_name ?? '?'}
          src={profile?.avatar_url}
          color={profile?.accent_color}
          size="xl"
          presence={isOnline(userId) ? 'online' : 'offline'}
          className={styles.previewAvatar}
        />
        <div className={styles.previewText}>
          <div className={styles.previewName}>{profile?.display_name ?? 'User Profile'}</div>
          <div className={styles.previewHandle}>@{profile?.handle}</div>
        </div>
      </div>

      {profile?.bio && <div className={styles.bioCard}>{profile.bio}</div>}

      <div className={styles.cardSection}>
        <div className={styles.idRow}>
          <span className={styles.idCode}>{userId}</span>
          <Button size="sm" variant="secondary" onClick={copyId}>
            <CopyIcon size={14} />
            Copy ID
          </Button>
        </div>

        <div className={styles.cardActions}>
          <Button
            size="sm"
            onClick={() => void handleOpenDM()}
            disabled={busy}
          >
            {busy && <Spinner />}
            <MessageSquareIcon size={15} />
            Send Direct Message (DM)
          </Button>

          <div className={styles.actionRow}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleSendFriendRequest()}
              disabled={busy}
              style={{ flex: 1 }}
            >
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
    </div>
  )
}

function ProfileForm({ user, onDone }: { user: CurrentUser; onDone: () => void }) {
  const { getToken, applyProfile } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState<'public' | 'anonymous'>('public')

  // Public profile states
  const [displayName, setDisplayName] = useState(user.profile.display_name)
  const [bio, setBio] = useState(user.profile.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user.profile.avatar_url ?? '')
  const [accent, setAccent] = useState<string | null>(user.profile.accent_color)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Anonymous Persona states
  const anonymousAlias = useAppStore((s) => s.anonymousAlias)
  const anonymousAccent = useAppStore((s) => s.anonymousAccent)
  const anonymousAvatarSeed = useAppStore((s) => s.anonymousAvatarSeed)
  const isAnonymousByDefault = useAppStore((s) => s.isAnonymousByDefault)
  const setAnonymousSettings = useAppStore((s) => s.setAnonymousSettings)

  const [anonAlias, setAnonAlias] = useState(anonymousAlias)
  const [anonAccent, setAnonAccent] = useState(anonymousAccent)
  const [anonSymbol, setAnonSymbol] = useState(anonymousAvatarSeed)
  const [anonDefault, setAnonDefault] = useState(isAnonymousByDefault)

  async function savePublic(event: FormEvent) {
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
      toast.success('Public profile saved')
      onDone()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save your profile')
    } finally {
      setSaving(false)
    }
  }

  function saveAnonymous(event: FormEvent) {
    event.preventDefault()
    setAnonymousSettings({
      alias: anonAlias.trim() || 'Anonymous Phantom',
      accent: anonAccent,
      avatarSeed: anonSymbol,
      isAnonymousByDefault: anonDefault,
    })
    toast.success('Anonymous persona saved', 'Your masked state is updated.')
    onDone()
  }

  function randomizeAlias() {
    const random = RANDOM_ALIASES[Math.floor(Math.random() * RANDOM_ALIASES.length)] ?? 'Shadow Fox'
    setAnonAlias(random)
  }

  return (
    <>
      <div className={styles.tabSwitcher}>
        <button
          type="button"
          className={cx(styles.tabBtn, tab === 'public' && styles.tabBtnActive)}
          onClick={() => setTab('public')}
        >
          <UsersIcon size={14} />
          Public Profile
        </button>
        <button
          type="button"
          className={cx(styles.tabBtn, tab === 'anonymous' && styles.tabBtnActive)}
          onClick={() => setTab('anonymous')}
        >
          <LockIcon size={14} />
          Anonymous Persona
        </button>
      </div>

      {tab === 'public' ? (
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
              // Your own preview: online by construction, since you are here looking at it.
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

          <form className={styles.form} onSubmit={savePublic}>
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
      ) : (
        <>
          <div
            className={styles.preview}
            style={{ '--preview-accent': anonAccent } as React.CSSProperties}
          >
            <div className={styles.previewBanner} />
            <div
              style={{
                width: '3.5rem',
                height: '3.5rem',
                borderRadius: '50%',
                backgroundColor: anonAccent,
                display: 'grid',
                placeItems: 'center',
                fontSize: '1.75rem',
                margin: '-2rem 0 0 var(--space-4)',
                boxShadow: '0 0 0 4px var(--color-surface)',
              }}
            >
              {anonSymbol}
            </div>
            <div className={styles.previewText}>
              <div className={styles.previewName}>{anonAlias || 'Anonymous Persona'}</div>
              <div className={styles.previewHandle}>🎭 Masked Identity • Hidden Account</div>
            </div>
          </div>

          <div className={styles.toggleRow}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)' }}>
                Post Anonymously by Default
              </div>
              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
                Automatically enter rooms in anonymous persona
              </div>
            </div>
            {/* Was an `<input type="checkbox">` with a stylesheet making it
                look like a switch. It is a switch — the app already has one,
                and Base UI's reports `role="switch"` rather than announcing
                itself as a checkbox that happens to be drawn as a track. */}
            <Switch
              checked={anonDefault}
              onCheckedChange={setAnonDefault}
              aria-label="Post Anonymously by Default"
            />
          </div>

          <form className={styles.form} onSubmit={saveAnonymous}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span className={styles.accentsLabel} style={{ marginBottom: 0 }}>
                  Anonymous Alias
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={randomizeAlias}
                  style={{ fontSize: 'var(--text-2xs)' }}
                >
                  🎲 Randomize
                </Button>
              </div>
              <Input
                label="Anonymous Alias"
                value={anonAlias}
                onChange={(e) => setAnonAlias(e.target.value)}
                placeholder="e.g. Shadow Fox"
                maxLength={32}
                required
              />
            </div>

            <div>
              <label className={styles.accentsLabel}>Mask Symbol</label>
              <div className={styles.symbolGrid}>
                {MASK_SYMBOLS.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    className={cx(
                      styles.symbolBtn,
                      anonSymbol === symbol && styles.symbolBtnActive,
                    )}
                    onClick={() => setAnonSymbol(symbol)}
                    aria-label={`Select mask ${symbol}`}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            </div>

            <fieldset className={styles.accents}>
              <legend className={styles.accentsLabel}>Accent Color</legend>
              <div className={styles.swatches}>
                {ACCENTS.map((value, index) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.swatch}
                    style={{ background: value }}
                    aria-label={`Accent ${index + 1}`}
                    aria-pressed={anonAccent === value}
                    data-selected={anonAccent === value || undefined}
                    onClick={() => setAnonAccent(value)}
                  />
                ))}
              </div>
            </fieldset>

            <div className={styles.actions}>
              <BaseDialog.Close render={<Button variant="secondary">Cancel</Button>} />
              <Button type="submit">
                Save Anonymous Persona
              </Button>
            </div>
          </form>
        </>
      )}
    </>
  )
}
