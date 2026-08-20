import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  BanIcon,
  CheckIcon,
  CopyIcon,
  LockIcon,
  MicIcon,
  MonitorIcon,
  MoonIcon,
  ShieldIcon,
  SignOutIcon,
  SunIcon,
  UsersIcon,
  XIcon,
} from '@/components/Icons'
import { Input } from '@/components/Input'
import { Slider } from '@/components/Slider'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import {
  ApiError,
  auth as authApi,
  blocks as blocksApi,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAppStore } from '@/lib/store'
import { useProfiles } from '@/lib/useProfiles'
import { useTheme } from '@/lib/useTheme'

import styles from './UserSettingsModal.module.css'

export type SettingsTab = 'profile' | 'anonymous' | 'account' | 'appearance' | 'voice' | 'blocked'

const PRESET_COLORS = [
  '#5865f2', // Blurple
  '#57f287', // Green
  '#fee75c', // Yellow
  '#eb459e', // Fuchsia
  '#ed4245', // Red
  '#3ba55d', // Emerald
  '#a855f7', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#64748b', // Slate
]

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
  'Solar Falcon',
  'Zero Spectrum',
]

const MASK_SYMBOLS = ['🎭', '🕶️', '🦊', '👻', '🤖', '🦉', '🐺', '🐼', '⚡', '🔮', '👾', '🛸']

interface ProfileFormValues {
  displayName: string
  bio: string
  avatarUrl: string
  accentColor: string
  avatarEffect: string
}

interface BlockUserFormValues {
  userId: string
}

interface UserSettingsModalProps {
  open: boolean
  initialTab?: SettingsTab
  onClose: () => void
}

export function UserSettingsModal({
  open,
  initialTab = 'profile',
  onClose,
}: UserSettingsModalProps) {
  const { user, getToken, applyProfile, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const toast = useToast()

  const storeTab = useAppStore((s) => s.userSettingsTab)
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || storeTab)

  const profileForm = useForm<ProfileFormValues>({
    defaultValues: {
      displayName: user?.profile.display_name ?? '',
      bio: user?.profile.bio ?? '',
      avatarUrl: user?.profile.avatar_url ?? '',
      accentColor: user?.profile.accent_color ?? '#5865f2',
      avatarEffect: user?.profile.avatar_effect ?? '',
    },
  })

  const blockForm = useForm<BlockUserFormValues>({
    defaultValues: { userId: '' },
  })

  const displayName = profileForm.watch('displayName')
  const bio = profileForm.watch('bio')
  const avatarUrl = profileForm.watch('avatarUrl')
  const accentColor = profileForm.watch('accentColor')

  // Anonymous Persona store bindings
  const anonymousAlias = useAppStore((s) => s.anonymousAlias)
  const anonymousAccent = useAppStore((s) => s.anonymousAccent)
  const anonymousAvatarSeed = useAppStore((s) => s.anonymousAvatarSeed)
  const isAnonymousByDefault = useAppStore((s) => s.isAnonymousByDefault)
  const setAnonymousSettings = useAppStore((s) => s.setAnonymousSettings)

  const [anonAlias, setAnonAlias] = useState(anonymousAlias)
  const [anonAccent, setAnonAccent] = useState(anonymousAccent)
  const [anonSymbol, setAnonSymbol] = useState(anonymousAvatarSeed)
  const [anonDefault, setAnonDefault] = useState(isAnonymousByDefault)

  // Blocked users management state
  const [blockedIds, setBlockedIds] = useState<Uuid[]>([])
  const [blockError, setBlockError] = useState<string | null>(null)
  const [blockBusy, setBlockBusy] = useState(false)

  // Voice test simulation
  const [micTesting, setMicTesting] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [inputVolume, setInputVolume] = useState(80)
  const [outputVolume, setOutputVolume] = useState(100)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Profiles cache for blocked user IDs
  const lookup = useProfiles(blockedIds)

  useEffect(() => {
    if (open && user) {
      profileForm.reset({
        displayName: user.profile.display_name ?? '',
        bio: user.profile.bio ?? '',
        avatarUrl: user.profile.avatar_url ?? '',
        accentColor: user.profile.accent_color ?? '#5865f2',
        avatarEffect: user.profile.avatar_effect ?? '',
      })
      setAnonAlias(anonymousAlias)
      setAnonAccent(anonymousAccent)
      setAnonSymbol(anonymousAvatarSeed)
      setAnonDefault(isAnonymousByDefault)
      setActiveTab(initialTab || storeTab)
      setError(null)
    }
  }, [open, user, initialTab, storeTab, anonymousAlias, anonymousAccent, anonymousAvatarSeed, isAnonymousByDefault])

  // ESC to close
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && open) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Mic test simulation animation
  useEffect(() => {
    if (!micTesting) {
      setMicLevel(0)
      return
    }
    const interval = setInterval(() => {
      setMicLevel(Math.floor(Math.random() * 65) + 15)
    }, 120)
    return () => clearInterval(interval)
  }, [micTesting])

  if (!open || !user) return null

  async function handleSaveProfile(data: ProfileFormValues) {
    setError(null)
    setSaving(true)
    try {
      const updated = await authApi.updateProfile(await getToken(), {
        display_name: data.displayName.trim() || undefined,
        bio: data.bio.trim() || undefined,
        avatar_url: data.avatarUrl.trim() || undefined,
        accent_color: data.accentColor.trim() || undefined,
        avatar_effect: data.avatarEffect.trim() || undefined,
      })
      applyProfile(updated)
      toast.success('Profile saved', 'Your changes are now visible to everyone.')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  function handleSaveAnonSettings(event: React.FormEvent) {
    event.preventDefault()
    setAnonymousSettings({
      alias: anonAlias.trim() || 'Anonymous Phantom',
      accent: anonAccent,
      avatarSeed: anonSymbol,
      isAnonymousByDefault: anonDefault,
    })
    toast.success('Anonymous persona saved', 'Your anonymous identity is ready for rooms.')
  }

  function handleRandomizeAnonAlias() {
    const random = RANDOM_ALIASES[Math.floor(Math.random() * RANDOM_ALIASES.length)] ?? 'Shadow Fox'
    setAnonAlias(random)
  }

  async function handleBlockUser(data: BlockUserFormValues) {
    const targetId = data.userId.trim()
    if (!targetId) return
    setBlockError(null)
    setBlockBusy(true)
    try {
      await blocksApi.block(await getToken(), targetId)
      if (!blockedIds.includes(targetId)) {
        setBlockedIds((prev) => [...prev, targetId])
      }
      blockForm.reset()
      toast.success('User blocked', 'They can no longer reach you.')
    } catch (cause) {
      setBlockError(cause instanceof ApiError ? cause.message : 'Could not block user')
    } finally {
      setBlockBusy(false)
    }
  }

  async function handleUnblockUser(userId: Uuid) {
    try {
      await blocksApi.unblock(await getToken(), userId)
      setBlockedIds((prev) => prev.filter((id) => id !== userId))
      toast.success('User unblocked')
    } catch (cause) {
      toast.error('Could not unblock', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  function copyUserId() {
    void navigator.clipboard
      ?.writeText(user!.id)
      .then(() => toast.success('User ID copied to clipboard'))
      .catch(() => toast.error('Could not copy user ID'))
  }

  return (
    <BaseDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.modal}>
          {/* Left Navigation Sidebar */}
          <aside className={styles.sidebar}>
            <div className={styles.sidebarGroup}>
              <div className={styles.sidebarHeading}>User Settings</div>
              <button
                type="button"
                className={cx(styles.navButton, activeTab === 'profile' && styles.navButtonActive)}
                onClick={() => setActiveTab('profile')}
              >
                <UsersIcon size={16} />
                Profiles
              </button>
              <button
                type="button"
                className={cx(styles.navButton, activeTab === 'anonymous' && styles.navButtonActive)}
                onClick={() => setActiveTab('anonymous')}
              >
                <LockIcon size={16} />
                Anonymous Persona
              </button>
              <button
                type="button"
                className={cx(styles.navButton, activeTab === 'account' && styles.navButtonActive)}
                onClick={() => setActiveTab('account')}
              >
                <ShieldIcon size={16} />
                My Account
              </button>
            </div>

            <div className={styles.sidebarGroup}>
              <div className={styles.sidebarHeading}>App Settings</div>
              <button
                type="button"
                className={cx(styles.navButton, activeTab === 'appearance' && styles.navButtonActive)}
                onClick={() => setActiveTab('appearance')}
              >
                <SunIcon size={16} />
                Appearance
              </button>
              <button
                type="button"
                className={cx(styles.navButton, activeTab === 'voice' && styles.navButtonActive)}
                onClick={() => setActiveTab('voice')}
              >
                <MicIcon size={16} />
                Voice & Video
              </button>
              <button
                type="button"
                className={cx(styles.navButton, activeTab === 'blocked' && styles.navButtonActive)}
                onClick={() => setActiveTab('blocked')}
              >
                <BanIcon size={16} />
                Blocked Users
              </button>
            </div>

            <div className={styles.sidebarGroup} style={{ marginTop: 'auto' }}>
              <button
                type="button"
                className={cx(styles.navButton, styles.dangerButton)}
                onClick={() => void logout()}
              >
                <SignOutIcon size={16} />
                Log Out
              </button>
            </div>
          </aside>

          {/* Content Area */}
          <div className={styles.contentWrapper}>
            <div className={styles.closeButtonContainer}>
              <button
                type="button"
                className={styles.closeButton}
                onClick={onClose}
                aria-label="Close Settings"
              >
                <XIcon size={18} />
              </button>
              <span className={styles.escKey}>ESC</span>
            </div>

            <div className={styles.scrollArea}>
              {/* PROFILE TAB */}
              {activeTab === 'profile' && (
                <div>
                  <h2 className={styles.panelTitle}>User Profile</h2>
                  <p className={styles.panelDescription}>
                    Customize how you appear across genzh communities and direct chats.
                  </p>

                  {error && <Callout tone="danger">{error}</Callout>}

                  {/* Live Preview Card */}
                  <div className={styles.profilePreviewCard}>
                    <div
                      className={styles.previewBanner}
                      style={{ '--banner-color': accentColor } as React.CSSProperties}
                    />
                    <div className={styles.previewBody}>
                      <div className={styles.previewAvatarWrap}>
                        <Avatar
                          name={displayName || user.profile.display_name}
                          src={avatarUrl || user.profile.avatar_url}
                          color={accentColor}
                          size="xl"
                          presence="online"
                        />
                      </div>
                      <div className={styles.previewName}>
                        {displayName || user.profile.display_name}
                      </div>
                      <div className={styles.previewHandle}>@{user.handle}</div>
                      {bio && <div className={styles.previewBio}>{bio}</div>}
                    </div>
                  </div>

                  <form className={styles.formGrid} onSubmit={profileForm.handleSubmit(handleSaveProfile)}>
                    <Input
                      label="Display Name"
                      {...profileForm.register('displayName', { required: true })}
                      placeholder="Enter display name"
                      maxLength={32}
                      required
                    />

                    <div className={styles.textareaField}>
                      <label className={styles.fieldLabel}>About Me</label>
                      <textarea
                        className={styles.textarea}
                        {...profileForm.register('bio')}
                        placeholder="Tell everyone a bit about yourself..."
                        rows={3}
                        maxLength={190}
                      />
                    </div>

                    <Input
                      label="Avatar Image URL"
                      {...profileForm.register('avatarUrl')}
                      placeholder="https://example.com/avatar.png"
                    />

                    <div>
                      <label className={styles.fieldLabel}>Profile Banner & Accent Color</label>
                      <div className={styles.colorSwatches}>
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={cx(
                              styles.colorSwatch,
                              accentColor === color && styles.colorSwatchActive,
                            )}
                            style={{ backgroundColor: color }}
                            onClick={() => profileForm.setValue('accentColor', color, { shouldDirty: true })}
                            aria-label={`Color ${color}`}
                          />
                        ))}
                        <Input
                          label="Custom Hex"
                          {...profileForm.register('accentColor')}
                          placeholder="#5865f2"
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '0.5rem' }}>
                      <Button type="submit" disabled={saving}>
                        {saving && <Spinner />}
                        Save Changes
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {/* ANONYMOUS PERSONA TAB */}
              {activeTab === 'anonymous' && (
                <div>
                  <h2 className={styles.panelTitle}>Anonymous Persona & State</h2>
                  <p className={styles.panelDescription}>
                    Customize your masked alias, icon, and default posting state for rooms. Your real account and identity stay 100% private.
                  </p>

                  {/* Toggle Default Mode */}
                  <div className={styles.toggleCard}>
                    <div className={styles.toggleInfo}>
                      <div className={styles.toggleTitle}>Post Anonymously by Default</div>
                      <div className={styles.toggleSubtitle}>
                        When entering rooms that permit anonymity, automatically start in anonymous persona.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className={styles.switchInput}
                      checked={anonDefault}
                      onChange={(e) => setAnonDefault(e.target.checked)}
                      aria-label="Post Anonymously by Default"
                    />
                  </div>

                  {/* Anonymous Live Preview Card */}
                  <div className={styles.profilePreviewCard}>
                    <div
                      className={styles.previewBanner}
                      style={{ '--banner-color': anonAccent } as React.CSSProperties}
                    />
                    <div className={styles.previewBody}>
                      <div className={styles.previewAvatarWrap}>
                        <div
                          style={{
                            width: '4rem',
                            height: '4rem',
                            borderRadius: '50%',
                            backgroundColor: anonAccent,
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: '2rem',
                            boxShadow: '0 0 0 4px var(--color-surface-raised)',
                          }}
                        >
                          {anonSymbol}
                        </div>
                      </div>
                      <div className={styles.previewName}>
                        {anonAlias || 'Anonymous Persona'}
                      </div>
                      <div className={styles.previewHandle}>🎭 Masked Persona • Hidden Profile</div>
                      <div className={styles.previewBio}>
                        Your public handle (@{user.handle}) and profile avatar are hidden from others when speaking under this persona.
                      </div>
                    </div>
                  </div>

                  <form className={styles.formGrid} onSubmit={handleSaveAnonSettings}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span className={styles.fieldLabel}>Anonymous Alias / Codename</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleRandomizeAnonAlias}
                          style={{ fontSize: 'var(--text-xs)' }}
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
                      <label className={styles.fieldLabel}>Mask Avatar / Symbol</label>
                      <div className={styles.anonSymbolChips}>
                        {MASK_SYMBOLS.map((symbol) => (
                          <button
                            key={symbol}
                            type="button"
                            className={cx(
                              styles.anonSymbolChip,
                              anonSymbol === symbol && styles.anonSymbolChipActive,
                            )}
                            onClick={() => setAnonSymbol(symbol)}
                            aria-label={`Select mask ${symbol}`}
                          >
                            {symbol}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className={styles.fieldLabel}>Persona Accent Color</label>
                      <div className={styles.colorSwatches}>
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={cx(
                              styles.colorSwatch,
                              anonAccent === color && styles.colorSwatchActive,
                            )}
                            style={{ backgroundColor: color }}
                            onClick={() => setAnonAccent(color)}
                            aria-label={`Color ${color}`}
                          />
                        ))}
                        <Input
                          label="Custom Hex"
                          value={anonAccent}
                          onChange={(e) => setAnonAccent(e.target.value)}
                          placeholder="#a855f7"
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '0.5rem' }}>
                      <Button type="submit">
                        Save Anonymous Persona
                      </Button>
                    </div>
                  </form>
                </div>
              )}

            {/* MY ACCOUNT TAB */}
            {activeTab === 'account' && (
              <div>
                <h2 className={styles.panelTitle}>My Account</h2>
                <p className={styles.panelDescription}>
                  View your account credentials and unique identification.
                </p>

                <div className={styles.section}>
                  <div className={styles.accountRow}>
                    <div>
                      <div className={styles.accountKey}>User ID</div>
                      <div className={cx(styles.accountVal, styles.codeVal)}>{user.id}</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={copyUserId}>
                      <CopyIcon size={14} />
                      Copy ID
                    </Button>
                  </div>

                  <div className={styles.accountRow}>
                    <div>
                      <div className={styles.accountKey}>Username / Handle</div>
                      <div className={styles.accountVal}>@{user.handle}</div>
                    </div>
                  </div>

                  <div className={styles.accountRow}>
                    <div>
                      <div className={styles.accountKey}>Email Address</div>
                      <div className={styles.accountVal}>{user.email}</div>
                    </div>
                  </div>
                </div>

                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Account Security</h3>
                  <p className={styles.accountKey}>
                    Logged in via secure bearer session tokens with automatic refresh.
                  </p>
                </div>
              </div>
            )}

            {/* APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div>
                <h2 className={styles.panelTitle}>Appearance</h2>
                <p className={styles.panelDescription}>
                  Choose how genzh looks and feels to your eyes.
                </p>

                <div className={styles.themeCards}>
                  <div
                    className={cx(styles.themeCard, theme === 'dark' && styles.themeCardActive)}
                    onClick={() => setTheme('dark')}
                  >
                    <MoonIcon size={32} />
                    <span style={{ fontWeight: 600 }}>Dark Theme</span>
                    {theme === 'dark' && <CheckIcon size={16} />}
                  </div>

                  <div
                    className={cx(styles.themeCard, theme === 'light' && styles.themeCardActive)}
                    onClick={() => setTheme('light')}
                  >
                    <SunIcon size={32} />
                    <span style={{ fontWeight: 600 }}>Light Theme</span>
                    {theme === 'light' && <CheckIcon size={16} />}
                  </div>

                  <div
                    className={cx(styles.themeCard, theme === 'system' && styles.themeCardActive)}
                    onClick={() => setTheme('system')}
                  >
                    <MonitorIcon size={32} />
                    <span style={{ fontWeight: 600 }}>System Sync</span>
                    {theme === 'system' && <CheckIcon size={16} />}
                  </div>
                </div>
              </div>
            )}

            {/* VOICE & VIDEO TAB */}
            {activeTab === 'voice' && (
              <div>
                <h2 className={styles.panelTitle}>Voice & Video Settings</h2>
                <p className={styles.panelDescription}>
                  Configure your audio input and output devices.
                </p>

                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Mic Test</h3>
                  <p className={styles.accountKey}>
                    Having mic issues? Test your sound before hopping into a channel.
                  </p>
                  <div style={{ marginTop: '0.75rem' }}>
                    <Button
                      size="sm"
                      variant={micTesting ? 'primary' : 'secondary'}
                      onClick={() => setMicTesting(!micTesting)}
                    >
                      <MicIcon size={14} />
                      {micTesting ? 'Stop Testing' : "Let's Check"}
                    </Button>
                  </div>
                  <div className={styles.voiceTestBar}>
                    <div
                      className={styles.voiceTestFill}
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                </div>

                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Volume Controls</h3>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className={styles.fieldLabel}>Input Volume</span>
                      <span className={styles.accountKey}>{inputVolume}%</span>
                    </div>
                    <Slider
                      value={[inputVolume]}
                      onValueChange={(val) => setInputVolume(Array.isArray(val) ? val[0] : val)}
                      max={100}
                      step={1}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className={styles.fieldLabel}>Output Volume</span>
                      <span className={styles.accountKey}>{outputVolume}%</span>
                    </div>
                    <Slider
                      value={[outputVolume]}
                      onValueChange={(val) => setOutputVolume(Array.isArray(val) ? val[0] : val)}
                      max={100}
                      step={1}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* BLOCKED TAB */}
            {activeTab === 'blocked' && (
              <div>
                <h2 className={styles.panelTitle}>Blocked Users</h2>
                <p className={styles.panelDescription}>
                  Blocked users cannot send you friend requests or direct interactions.
                </p>

                {blockError && <Callout tone="danger">{blockError}</Callout>}

                <form className={styles.formRow} onSubmit={blockForm.handleSubmit(handleBlockUser)}>
                  <Input
                    className={styles.grow}
                    label="User ID to Block"
                    {...blockForm.register('userId', { required: true })}
                    placeholder="Enter user UUID to block..."
                    required
                  />
                  <Button type="submit" variant="danger" disabled={blockBusy}>
                    {blockBusy && <Spinner />}
                    Block User
                  </Button>
                </form>

                <div className={styles.blockedList}>
                  {blockedIds.length === 0 && (
                    <p className={styles.accountKey} style={{ marginTop: '1rem' }}>
                      You haven't blocked anyone yet.
                    </p>
                  )}
                  {blockedIds.map((id) => {
                    const profile = lookup(id)
                    return (
                      <div key={id} className={styles.blockedRow}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <Avatar
                            name={profile?.display_name ?? '?'}
                            src={profile?.avatar_url}
                            color={profile?.accent_color}
                            size="sm"
                          />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                              {profile?.display_name ?? id}
                            </div>
                            <div className={styles.accountKey}>@{profile?.handle ?? id.slice(0, 8)}</div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleUnblockUser(id)}
                        >
                          Unblock
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  </BaseDialog.Root>
)
}
