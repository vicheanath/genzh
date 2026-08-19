import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { ArrowLeftIcon, PlusIcon, UserPlusIcon, XIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { ApiError, communities as communitiesApi } from '@/lib/api'
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

export function AddCommunityDialog({ open, onClose, onCreated }: AddCommunityDialogProps) {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const createForm = useForm<CreateCommunityFields>({
    defaultValues: { name: '', description: '', iconUrl: '' },
  })

  const joinForm = useForm<JoinCommunityFields>({
    defaultValues: { inviteId: '' },
  })

  function reset() {
    setMode('menu')
    createForm.reset()
    joinForm.reset()
    setError(null)
    setBusy(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleCreate(data: CreateCommunityFields) {
    if (!data.name.trim()) return
    setError(null)
    setBusy(true)
    try {
      const community = await communitiesApi.create(await getToken(), {
        name: data.name.trim(),
        description: data.description?.trim() || undefined,
        icon_url: data.iconUrl?.trim() || undefined,
      })
      toast.success(`${community.name} created!`)
      onCreated?.()
      handleClose()
      void navigate(`/c/${community.id}`)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create community')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(data: JoinCommunityFields) {
    const id = data.inviteId.trim()
    if (!id) return
    setError(null)
    setBusy(true)
    try {
      await communitiesApi.join(await getToken(), id)
      toast.success('Joined community!')
      onCreated?.()
      handleClose()
      void navigate(`/c/${id}`)
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'CONFLICT') {
        onCreated?.()
        handleClose()
        void navigate(`/c/${id}`)
        return
      }
      setError(cause instanceof ApiError ? cause.message : 'Could not join community')
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
                <BaseDialog.Title className={styles.title}>Create Your Server</BaseDialog.Title>
                <BaseDialog.Description className={styles.description}>
                  Your server is where you and your friends hang out. Make yours and start talking.
                </BaseDialog.Description>
              </div>

              <div className={styles.choices}>
                <button
                  type="button"
                  className={styles.choiceCard}
                  onClick={() => setMode('create')}
                >
                  <div className={styles.choiceLabel}>
                    <PlusIcon size={20} />
                    Create My Own
                  </div>
                  <span>→</span>
                </button>

                <button
                  type="button"
                  className={styles.choiceCard}
                  onClick={() => setMode('join')}
                >
                  <div className={styles.choiceLabel}>
                    <UserPlusIcon size={20} />
                    Join a Server
                  </div>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <div>
              <div className={styles.header}>
                <BaseDialog.Title className={styles.title}>Customize Your Server</BaseDialog.Title>
                <BaseDialog.Description className={styles.description}>
                  Give your new server a personality with a name and an icon.
                </BaseDialog.Description>
              </div>

              {error && <Callout tone="danger">{error}</Callout>}

              <form className={styles.form} onSubmit={createForm.handleSubmit(handleCreate)}>
                <Input
                  label="Server Name"
                  {...createForm.register('name', { required: true })}
                  placeholder="My Awesome Server"
                  maxLength={64}
                  required
                />

                <Input
                  label="Server Description (Optional)"
                  {...createForm.register('description')}
                  placeholder="What is your server about?"
                />

                <Input
                  label="Server Icon URL (Optional)"
                  {...createForm.register('iconUrl')}
                  placeholder="https://example.com/icon.png"
                />

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
                    Create
                  </Button>
                </div>
              </form>
            </div>
          )}

          {mode === 'join' && (
            <div>
              <div className={styles.header}>
                <BaseDialog.Title className={styles.title}>Join a Server</BaseDialog.Title>
                <BaseDialog.Description className={styles.description}>
                  Enter an invite ID below to join an existing server.
                </BaseDialog.Description>
              </div>

              {error && <Callout tone="danger">{error}</Callout>}

              <form className={styles.form} onSubmit={joinForm.handleSubmit(handleJoin)}>
                <Input
                  label="Invite ID"
                  {...joinForm.register('inviteId', { required: true })}
                  placeholder="6f1c…"
                  required
                />

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
