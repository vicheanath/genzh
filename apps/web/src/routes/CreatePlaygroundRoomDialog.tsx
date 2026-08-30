import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { LockIcon, SparkleIcon, XIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Spinner } from '@/components/Spinner'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import type { RoomFamily, RoomType } from '@/lib/api'
import { useCreateStandaloneRoomMutation } from '@/features/api'
import { errorText } from '@/lib/errors'
import { cx } from '@/lib/cx'
import { ROOM_CATEGORIES, ROOM_FAMILIES, roomTypesIn } from '@/lib/roomTypes'

import styles from './CreatePlaygroundRoomDialog.module.css'

interface CreateRoomFields {
  name: string
  topic?: string
  category: string
  durationMinutes: string
}

interface CreatePlaygroundRoomDialogProps {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

export function CreatePlaygroundRoomDialog({
  open,
  onClose,
  onCreated,
}: CreatePlaygroundRoomDialogProps) {
  const createRoom = useCreateStandaloneRoomMutation()
  const navigate = useNavigate()
  const toast = useToast()

  const [activeFamily, setActiveFamily] = useState<RoomFamily>('conversation')
  const [selectedType, setSelectedType] = useState<RoomType>('text')
  const [category, setCategory] = useState('random')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { register, handleSubmit, reset } = useForm<CreateRoomFields>({
    defaultValues: {
      name: '',
      topic: '',
    },
  })

  function handleClose() {
    reset()
    setError(null)
    setBusy(false)
    onClose()
  }

  async function handleCreate(data: CreateRoomFields) {
    if (!data.name.trim()) return
    setError(null)
    setBusy(true)

    try {
      const room = await createRoom.mutateAsync({
        name: data.name.trim(),
        topic: data.topic?.trim() || undefined,
        category,
        room_type: selectedType,
        is_anonymous: isAnonymous,
        duration_minutes: durationMinutes ? parseInt(durationMinutes, 10) : undefined,
      })

      toast.success(
        'Room created',
        isAnonymous ? 'Your anonymous identity is active.' : undefined,
      )
      onCreated?.()
      handleClose()
      navigate(`/rooms/${room.id}`)
    } catch (cause) {
      setError(errorText(cause, 'Could not create room'))
    } finally {
      setBusy(false)
    }
  }

  const currentPillar =
    ROOM_FAMILIES.find((entry) => entry.family === activeFamily) ?? ROOM_FAMILIES[0]!

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

          <div className={styles.header}>
            <div className={styles.tag}>
              <SparkleIcon size={14} />
              Spontaneous Social Space
            </div>
            <BaseDialog.Title className={styles.title}>Start a Moment</BaseDialog.Title>
            <BaseDialog.Description className={styles.description}>
              Create an instant room to talk, debate, poll, or hang out with anyone anonymously.
            </BaseDialog.Description>
          </div>

          {error && <Callout tone="danger">{error}</Callout>}

          <form className={styles.form} onSubmit={handleSubmit(handleCreate)}>
            <Input
              label="What's happening?"
              {...register('name', { required: true })}
              placeholder="e.g. Unpopular opinions, Midnight talks, Show setup…"
              maxLength={64}
              required
              autoFocus
            />

            <div className={styles.field}>
              <span className={styles.fieldLabel}>What kind of room</span>

              <div className={styles.pillarTabs} role="tablist" aria-label="Kind of room">
                {ROOM_FAMILIES.map((pillar) => (
                  <button
                    key={pillar.family}
                    type="button"
                    role="tab"
                    aria-selected={activeFamily === pillar.family}
                    className={cx(
                      styles.pillarTab,
                      activeFamily === pillar.family && styles.pillarTabActive,
                    )}
                    onClick={() => {
                      setActiveFamily(pillar.family)
                      const firstType = roomTypesIn(pillar.family)[0]?.type
                      if (firstType) setSelectedType(firstType)
                    }}
                  >
                    <span aria-hidden>{pillar.emoji}</span>
                    <span>{pillar.label}</span>
                  </button>
                ))}
              </div>

              {/* Says what the pillar is *for*. Three one-word tabs over a grid
                  of twenty type names left the difference between them to be
                  inferred from the names alone. */}
              <p className={styles.pillarBlurb}>{currentPillar.blurb}</p>

              <div className={styles.typesGrid}>
                {roomTypesIn(activeFamily).map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={selectedType === type}
                    className={cx(styles.typeCard, selectedType === type && styles.typeCardActive)}
                    onClick={() => setSelectedType(type)}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Topic</span>
                <Select
                  value={category}
                  onValueChange={setCategory}
                  options={ROOM_CATEGORIES.map((entry) => ({
                    value: entry.key,
                    label: `${entry.emoji} ${entry.label}`,
                  }))}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Ends after</span>
                <Select
                  value={durationMinutes}
                  onValueChange={setDurationMinutes}
                  options={[
                    { value: '30', label: '30 minutes' },
                    { value: '60', label: '1 hour' },
                    { value: '180', label: '3 hours' },
                    { value: '1440', label: '24 hours' },
                  ]}
                />
              </label>
            </div>

            <div className={styles.toggleRow}>
              <div className={styles.toggleInfo}>
                <span className={styles.toggleTitle}>
                  <LockIcon size={15} />
                  Anonymous Identity
                </span>
                <span className={styles.toggleDesc}>
                  Mask real user profiles with randomized aliases (e.g. NeonFox#4821).
                </span>
              </div>
              <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
            </div>

            <div className={styles.footer}>
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                Launch Room
              </Button>
            </div>
          </form>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
