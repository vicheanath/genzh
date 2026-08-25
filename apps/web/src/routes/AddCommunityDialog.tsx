import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  ArrowLeftIcon,
  CompassIcon,
  HashIcon,
  PlusIcon,
  UserPlusIcon,
  XIcon,
} from '@/components/Icons'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import {
  useCommunityTemplates,
  useCreateCommunityMutation,
  useJoinCommunityMutation,
  useRedeemInviteMutation,
  type CommunityTemplate,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { useAuth } from '@/lib/auth'

import styles from './AddCommunityDialog.module.css'

interface CreateCommunityFields {
  name: string
  description?: string
  iconUrl?: string
}

interface JoinCommunityFields {
  inviteId: string
}

interface AddCommunityDialogProps {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

const RANDOM_NAMES = [
  'Pixel Lounge',
  'Night Owls',
  'The Cyber Den',
  'Coffee & Code',
  'Arcade Hub',
  'Midnight Club',
  'Neon Syndicate',
  'Vibe Tribe',
  'Synthwave Station',
  'Cosmic Café',
  'The Oasis',
  'Binary Haven',
]

/** The template that builds nothing — what "Create My Own" picks. */
const BLANK_TEMPLATE = 'blank'

export function AddCommunityDialog({ open, onClose, onCreated }: AddCommunityDialogProps) {
  const { user } = useAuth()
  const templates = useCommunityTemplates()
  const createCommunity = useCreateCommunityMutation()
  const joinCommunity = useJoinCommunityMutation()
  const navigate = useNavigate()
  const toast = useToast()

  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')
  const [templateKey, setTemplateKey] = useState<string>(BLANK_TEMPLATE)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // "Create My Own" is the blank template, so it is not offered twice.
  const pickable = (templates.data ?? []).filter((entry) => entry.key !== BLANK_TEMPLATE)
  const chosen = templates.data?.find((entry) => entry.key === templateKey) ?? null

  const createForm = useForm<CreateCommunityFields>({
    defaultValues: {
      name: user ? `${user.profile.display_name}'s Server` : 'My Server',
      description: '',
      iconUrl: '',
    },
  })

  const joinForm = useForm<JoinCommunityFields>({
    defaultValues: { inviteId: '' },
  })

  const watchedName = createForm.watch('name')
  const watchedIcon = createForm.watch('iconUrl')

  function reset() {
    setMode('menu')
    createForm.reset({
      name: user ? `${user.profile.display_name}'s Server` : 'My Server',
      description: '',
      iconUrl: '',
    })
    joinForm.reset()
    setTemplateKey(BLANK_TEMPLATE)
    setError(null)
    setBusy(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleCreateOwn() {
    setTemplateKey(BLANK_TEMPLATE)
    setMode('create')
  }

  function handleSelectTemplate(template: CommunityTemplate) {
    // The suggestions are a starting point the creator can overwrite; the key
    // is what actually decides which channels and roles get built.
    if (template.suggested_name) createForm.setValue('name', template.suggested_name)
    createForm.setValue('description', template.suggested_description)
    setTemplateKey(template.key)
    setMode('create')
  }

  function handleRandomName() {
    const random = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] ?? 'Pixel Lounge'
    createForm.setValue('name', random)
  }

  async function handleCreate(data: CreateCommunityFields) {
    if (!data.name.trim()) return
    setError(null)
    setBusy(true)
    try {
      const community = await createCommunity.mutateAsync({
        name: data.name.trim(),
        description: data.description?.trim() || undefined,
        icon_url: data.iconUrl?.trim() || undefined,
        template: templateKey,
      })
      toast.success(`${community.name} created!`)
      onCreated?.()
      handleClose()
      void navigate(`/c/${community.id}`)
    } catch (cause) {
      setError(errorText(cause, 'Could not create community'))
    } finally {
      setBusy(false)
    }
  }

  const redeemInvite = useRedeemInviteMutation()

  async function handleJoin(data: JoinCommunityFields) {
    const raw = data.inviteId.trim()
    if (!raw) return
    const code = raw.replace(/^.*\/invite\//i, '').replace(/^.*\/invites\//i, '').trim()
    if (!code) return

    setError(null)
    setBusy(true)
    try {
      // If code is a standard UUID (36 chars with dashes), use joinCommunity directly
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
        await joinCommunity.mutateAsync(code)
        toast.success('Joined community!')
        onCreated?.()
        handleClose()
        void navigate(`/c/${code}`)
      } else {
        const community = await redeemInvite.mutateAsync(code)
        toast.success(`Joined ${community.name}!`)
        onCreated?.()
        handleClose()
        void navigate(`/c/${community.id}`)
      }
    } catch (cause) {
      setError(errorText(cause, 'Could not join community'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <BaseDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.popup}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Close"
          >
            <XIcon size={16} />
          </button>

          {mode === 'menu' && (
            <div>
              <div className={styles.header}>
                <div className={styles.headerBadge}>
                  <PlusIcon size={16} />
                  <span>New Server</span>
                </div>
                <BaseDialog.Title className={styles.title}>Create Your Server</BaseDialog.Title>
                <BaseDialog.Description className={styles.description}>
                  Your server is where you and your friends make memories. Create one from scratch or pick a starter template.
                </BaseDialog.Description>
              </div>

              <div className={styles.choices}>
                <button
                  type="button"
                  className={styles.choiceCardPrimary}
                  onClick={() => {
                    createForm.setValue(
                      'name',
                      user?.profile?.display_name
                        ? `${user.profile.display_name}'s Server`
                        : 'My Server',
                    )
                    handleCreateOwn()
                  }}
                >
                  <div className={styles.choiceIconWrap}>
                    <PlusIcon size={20} />
                  </div>
                  <div className={styles.choiceContent}>
                    <div className={styles.choiceTitle}>Create My Own</div>
                    <div className={styles.choiceSub}>An empty server — you make the channels</div>
                  </div>
                  <span className={styles.choiceArrow}>→</span>
                </button>

                {pickable.length > 0 && (
                  <div className={styles.templatesSection}>
                    <div className={styles.templatesHeading}>START FROM A TEMPLATE</div>
                    <div className={styles.templatesGrid}>
                      {pickable.map((tmpl) => (
                        <button
                          key={tmpl.key}
                          type="button"
                          className={styles.templateCard}
                          onClick={() => handleSelectTemplate(tmpl)}
                        >
                          <span className={styles.templateIcon}>{tmpl.icon}</span>
                          <div className={styles.templateInfo}>
                            <span className={styles.templateTitle}>{tmpl.name}</span>
                            <span className={styles.templateDesc}>{tmpl.description}</span>
                          </div>
                          <span className={styles.templateArrow}>→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.joinPrompt}>
                  <div className={styles.joinPromptText}>Already have an invite?</div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMode('join')}
                    style={{ width: '100%' }}
                  >
                    <UserPlusIcon size={16} />
                    Join a Server via Invite Code
                  </Button>
                </div>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <div>
              <div className={styles.header}>
                <BaseDialog.Title className={styles.title}>Customize Your Server</BaseDialog.Title>
                <BaseDialog.Description className={styles.description}>
                  Give your new server a unique personality with a name, description, and icon.
                </BaseDialog.Description>
              </div>

              {/* Live Preview Card */}
              <div className={styles.previewCard}>
                <Avatar
                  name={watchedName || 'Server'}
                  src={watchedIcon || null}
                  size="xl"
                  className={styles.previewAvatar}
                />
                <div className={styles.previewInfo}>
                  <div className={styles.previewName}>{watchedName || 'Server Name'}</div>
                  <div className={styles.previewCategory}>
                    <HashIcon size={13} />
                    <span>Active Community</span>
                  </div>
                </div>
              </div>

              {error && <Callout tone="danger">{error}</Callout>}

              <form className={styles.form} onSubmit={createForm.handleSubmit(handleCreate)}>
                <Input
                  label={
                    <div className={styles.inputHeader}>
                      <span>Server Name</span>
                      <button
                        type="button"
                        className={styles.randomBtn}
                        onClick={handleRandomName}
                        title="Generate a random server name"
                      >
                        🎲 Randomize
                      </button>
                    </div>
                  }
                  {...createForm.register('name', { required: true })}
                  placeholder="e.g. The Night Owls"
                  maxLength={64}
                  required
                />

                <Input
                  label="Server Description (Optional)"
                  {...createForm.register('description')}
                  placeholder="What is this server about?"
                  maxLength={190}
                />

                <Input
                  label="Server Icon URL (Optional)"
                  {...createForm.register('iconUrl')}
                  placeholder="https://images.unsplash.com/…"
                />

                {/* What the template actually builds. The picker used to
                    describe a shape the server never made, so this is read
                    from the same catalogue the server provisions from. */}
                {chosen && (chosen.rooms.length > 0 || chosen.extra_roles.length > 0) && (
                  <div className={styles.templatePreview}>
                    <div className={styles.templatePreviewHeading}>
                      <span aria-hidden="true">{chosen.icon}</span>
                      {chosen.name} starts with
                    </div>
                    <ul className={styles.templatePreviewList}>
                      {chosen.rooms.map((room) => (
                        <li key={room.name} className={styles.templatePreviewItem}>
                          <HashIcon size={13} />
                          <span>{room.name}</span>
                          <span className={styles.templatePreviewKind}>{room.room_type}</span>
                        </li>
                      ))}
                    </ul>
                    {chosen.extra_roles.length > 0 && (
                      <div className={styles.templatePreviewRoles}>
                        Adds the{' '}
                        {chosen.extra_roles.map((role) => role.name).join(', ')} role
                        {chosen.extra_roles.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}

                <div className={styles.footer}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setError(null)
                      setMode('menu')
                    }}
                  >
                    <ArrowLeftIcon size={16} />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={busy || !watchedName?.trim()}
                    style={{ background: '#23a55a', color: '#ffffff' }}
                  >
                    {busy && <Spinner />}
                    Create Server
                  </Button>
                </div>
              </form>
            </div>
          )}

          {mode === 'join' && (
            <div>
              <div className={styles.header}>
                <div className={styles.headerBadge}>
                  <CompassIcon size={16} />
                  <span>Join Server</span>
                </div>
                <BaseDialog.Title className={styles.title}>Join a Server</BaseDialog.Title>
                <BaseDialog.Description className={styles.description}>
                  Enter an invite code or server ID to instantly join an existing community.
                </BaseDialog.Description>
              </div>

              {error && <Callout tone="danger">{error}</Callout>}

              <form className={styles.form} onSubmit={joinForm.handleSubmit(handleJoin)}>
                <Input
                  label="Invite Code / Server ID"
                  {...joinForm.register('inviteId', { required: true })}
                  placeholder="e.g. 6f1c7d2e-4b9a-4c8d-8e7f-1a2b3c4d5e6f"
                  spellCheck={false}
                  required
                />

                <p className={styles.joinHelpText}>
                  Invites look like <code className={styles.codeSample}>6f1c7d2e-…</code>. Ask a server owner or friend to copy their server invite link.
                </p>

                <div className={styles.footer}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setError(null)
                      setMode('menu')
                    }}
                  >
                    <ArrowLeftIcon size={16} />
                    Back
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy && <Spinner />}
                    Join Server
                  </Button>
                </div>
              </form>
            </div>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
