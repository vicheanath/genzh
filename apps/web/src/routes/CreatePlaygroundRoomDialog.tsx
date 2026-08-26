import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  CompassIcon,
  FlameIcon,
  GamepadIcon,
  HashIcon,
  HeartIcon,
  HelpCircleIcon,
  LockIcon,
  MicIcon,
  PaletteIcon,
  RadioIcon,
  ShuffleIcon,
  SparkleIcon,
  TagIcon,
  UsersIcon,
  VideoIcon,
  VoteIcon,
  XIcon,
  ZapIcon,
} from '@/components/Icons'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Spinner } from '@/components/Spinner'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import type { RoomFamily, RoomType } from '@/lib/api'
import { useCreateStandaloneRoomMutation } from '@/features/api'
import { errorText } from '@/lib/errors'
import { cx } from '@/lib/cx'

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

interface RoomTypeConfig {
  type: RoomType
  label: string
  icon: typeof HashIcon
}

interface PillarGroup {
  family: RoomFamily
  label: string
  icon: string
  types: RoomTypeConfig[]
}

const PILLAR_GROUPS: PillarGroup[] = [
  {
    family: 'conversation',
    label: 'Conversation',
    icon: '💬',
    types: [
      { type: 'text', label: 'Chat', icon: HashIcon },
      { type: 'voice', label: 'Voice & Screen', icon: MicIcon },
      { type: 'video', label: 'Video Grid', icon: VideoIcon },
      { type: 'stage', label: 'Stage', icon: RadioIcon },
    ],
  },
  {
    family: 'social_games',
    label: 'Social Games',
    icon: '🎮',
    types: [
      { type: 'truth_or_dare', label: 'Truth / Dare', icon: SparkleIcon },
      { type: 'would_you_rather', label: 'Would You Rather', icon: ShuffleIcon },
      { type: 'hot_takes', label: 'Hot Takes', icon: FlameIcon },
      { type: 'poll', label: 'Live Poll', icon: VoteIcon },
      { type: 'trivia', label: 'Trivia Quiz', icon: HelpCircleIcon },
      { type: 'debate', label: 'Debates', icon: FlameIcon },
      { type: 'guess_who', label: 'Guess Who', icon: UsersIcon },
      { type: 'game', label: 'Party Games', icon: GamepadIcon },
      { type: 'activity', label: 'Activity Lounge', icon: PaletteIcon },
    ],
  },
  {
    family: 'social_discovery',
    label: 'Social Discovery',
    icon: '🧭',
    types: [
      { type: 'random_chat', label: 'Random Chat', icon: ZapIcon },
      { type: 'anonymous_chat', label: 'Anonymous Chat', icon: LockIcon },
      { type: 'match_interest', label: 'Match by Interest', icon: TagIcon },
      { type: 'friend_finder', label: 'Friend Finder', icon: HeartIcon },
      { type: 'topic_room', label: 'Topic Room', icon: CompassIcon },
      { type: 'confession', label: 'Confessions', icon: LockIcon },
      { type: 'quick_chat', label: 'Speed Chat', icon: ZapIcon },
    ],
  },
]

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

  const currentPillar = PILLAR_GROUPS.find((g) => g.family === activeFamily) ?? PILLAR_GROUPS[0]

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

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--color-text-subtle)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                Pillar & Room Type
              </label>

              {/* 3 Pillars Tabs */}
              <div className={styles.pillarTabs}>
                {PILLAR_GROUPS.map((pillar) => (
                  <button
                    key={pillar.family}
                    type="button"
                    className={cx(
                      styles.pillarTab,
                      activeFamily === pillar.family && styles.pillarTabActive,
                    )}
                    onClick={() => {
                      setActiveFamily(pillar.family)
                      const firstType = pillar.types[0]?.type
                      if (firstType) {
                        setSelectedType(firstType)
                      }
                    }}
                  >
                    <span>{pillar.icon}</span>
                    <span>{pillar.label}</span>
                  </button>
                ))}
              </div>

              {/* Room Types Grid for Selected Pillar */}
              <div className={styles.typesGrid}>
                {currentPillar?.types.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    type="button"
                    className={cx(styles.typeCard, selectedType === type && styles.typeCardActive)}
                    onClick={() => setSelectedType(type)}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 'var(--space-1)' }}>
                  Category
                </label>
                <Select
                  value={category}
                  onValueChange={setCategory}
                  options={[
                    { value: 'random', label: '🎲 Random' },
                    { value: 'gaming', label: '🎮 Gaming' },
                    { value: 'debate', label: '🔥 Debates' },
                    { value: 'confession', label: '🤫 Confessions' },
                    { value: 'tech', label: '💻 Tech & Code' },
                    { value: 'music', label: '🎵 Music' },
                    { value: 'art', label: '🎨 Art' },
                    { value: 'memes', label: '😂 Memes' },
                  ]}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 'var(--space-1)' }}>
                  Duration
                </label>
                <Select
                  value={durationMinutes}
                  onValueChange={setDurationMinutes}
                  options={[
                    { value: '30', label: '30 Minutes' },
                    { value: '60', label: '1 Hour' },
                    { value: '180', label: '3 Hours' },
                    { value: '1440', label: '24 Hours' },
                  ]}
                />
              </div>
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
