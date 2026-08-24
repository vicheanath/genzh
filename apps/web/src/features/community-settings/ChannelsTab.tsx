import { useState, type FormEvent } from 'react'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  HashIcon,
  LockIcon,
  MicIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
  VideoIcon,
} from '@/components/Icons'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import {
  ApiError,
  rooms as roomsApi,
  type CommunityWithPermissions,
  type RoomType,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'

import { PanelList, PanelSkeleton } from './PanelList'
import type { CommunityAbilities } from './tabs'
import styles from './communitySettings.module.css'
import { useConfirm } from '@/components/AlertDialog'

/** What settings can create. The playful room types are made from the room
 *  screen, where the thing being made is explained rather than listed. */
const ROOM_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'voice', label: 'Voice' },
  { value: 'video', label: 'Video' },
  { value: 'activity', label: 'Activity' },
] as const satisfies ReadonlyArray<{ value: RoomType; label: string }>

const ROOM_ICONS: Record<string, typeof HashIcon> = {
  text: HashIcon,
  voice: MicIcon,
  video: VideoIcon,
  activity: SparkleIcon,
  stage: VideoIcon,
  poll: SparkleIcon,
  debate: SparkleIcon,
  game: SparkleIcon,
  confession: LockIcon,
  quick_chat: HashIcon,
}

export function ChannelsTab({
  community,
  abilities,
}: {
  community: CommunityWithPermissions
  abilities: CommunityAbilities
}) {
  const confirm = useConfirm()
  const { getToken } = useAuth()
  const toast = useToast()

  const rooms = useAsync(
    async () => roomsApi.list(await getToken(), community.id),
    [getToken, community.id],
  )

  const [name, setName] = useState('')
  const [type, setType] = useState<RoomType>('text')
  const [topic, setTopic] = useState('')
  const [creating, setCreating] = useState(false)

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      await roomsApi.create(await getToken(), community.id, {
        name: name.trim(),
        room_type: type,
        topic: topic.trim() || undefined,
      })
      setName('')
      setTopic('')
      rooms.reload()
      toast.success('Channel created')
    } catch (cause) {
      toast.error('Could not create channel', cause instanceof ApiError ? cause.message : undefined)
    } finally {
      setCreating(false)
    }
  }

  async function remove(roomId: Uuid, roomName: string) {
    const ok = await confirm({
      title: `Delete #${roomName}?`,
      description: 'Its messages go with it. This cannot be undone.',
      confirmLabel: 'Delete channel',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await roomsApi.delete(await getToken(), roomId)
      rooms.reload()
      toast.success('Channel deleted')
    } catch (cause) {
      toast.error('Could not delete channel', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  return (
    <>
      <h2 className={styles.panelTitle}>Channels</h2>
      <p className={styles.panelDescription}>
        Every conversation in this server lives in one of these.
      </p>

      {abilities.rooms && (
        <form className={styles.card} onSubmit={create}>
          <h3 className={styles.cardTitle}>New channel</h3>

          <div className={styles.row}>
            <Input
              className={styles.grow}
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. general"
              maxLength={64}
              required
            />
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Type</span>
              <Select
                aria-label="Channel type"
                value={type}
                onValueChange={setType}
                options={ROOM_TYPES}
              />
            </div>
          </div>

          <Input
            label="Topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="What is this channel for? (optional)"
            maxLength={200}
          />

          <div className={styles.cardActions}>
            <Button type="submit" disabled={creating || !name.trim()}>
              {creating ? <Spinner /> : <PlusIcon size={14} />}
              Create channel
            </Button>
          </div>
        </form>
      )}

      <h3 className={styles.listHeading}>
        {rooms.data ? `${rooms.data.length} channel${rooms.data.length === 1 ? '' : 's'}` : 'Channels'}
      </h3>

      {rooms.error && <Callout tone="danger">{rooms.error}</Callout>}
      {rooms.loading && <PanelSkeleton rows={4} />}

      <PanelList
        empty={!rooms.loading && (rooms.data?.length ?? 0) === 0}
        emptyText="No channels yet. The first one is usually #general."
      >
        {rooms.data?.map((room) => {
          const Icon = ROOM_ICONS[room.room_type] ?? HashIcon
          return (
            <li key={room.id} className={styles.listItem}>
              <span className={styles.roomIcon}>
                <Icon size={16} />
              </span>

              <span className={styles.listText}>
                <span className={styles.listLabel}>
                  {room.name}
                  <Badge tone="mint">{room.room_type.replace('_', ' ')}</Badge>
                </span>
                {room.topic && <span className={styles.listHint}>{room.topic}</span>}
              </span>

              {abilities.rooms && (
                <span className={styles.listActions}>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    onClick={() => void remove(room.id, room.name)}
                    aria-label={`Delete ${room.name}`}
                  >
                    <TrashIcon size={15} />
                  </Button>
                </span>
              )}
            </li>
          )
        })}
      </PanelList>
    </>
  )
}
