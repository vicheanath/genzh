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
import type { CommunityWithPermissions, RoomType, Uuid } from '@/lib/api'
import {
  useCommunityRoomsQuery,
  useCreateCommunityRoomMutation,
  useDeleteRoomMutation,
} from '@/features/api'
import { errorText } from '@/lib/errors'

import { PanelList, PanelSkeleton } from './PanelList'
import type { CommunityAbilities } from './tabs'
import styles from './communitySettings.module.css'
import { useConfirm } from '@/components/AlertDialog'

/** What settings can create. The playful room types are made from the room
 *  screen, where the thing being made is explained rather than listed. */
const ROOM_TYPES = [
  // 💬 Conversation
  { value: 'text', label: '💬 Text Chat' },
  { value: 'voice', label: '🔊 Voice Lounge' },
  { value: 'video', label: '📹 Video Grid' },
  { value: 'stage', label: '🎙️ Stage Broadcast' },
  // 🎮 Social Games
  { value: 'truth_or_dare', label: '✨ Truth / Dare' },
  { value: 'would_you_rather', label: '🔀 Would You Rather' },
  { value: 'hot_takes', label: '🔥 Hot Takes' },
  { value: 'poll', label: '🗳️ Live Poll' },
  { value: 'trivia', label: '❓ Trivia Quiz' },
  { value: 'debate', label: '⚔️ Debate Arena' },
  { value: 'guess_who', label: '👥 Guess Who' },
  { value: 'game', label: '🎮 Party Games' },
  { value: 'activity', label: '🎨 Activity Lounge' },
  // 🧭 Social Discovery
  { value: 'random_chat', label: '⚡ Random Chat' },
  { value: 'anonymous_chat', label: '🔒 Anonymous Chat' },
  { value: 'match_interest', label: '🏷️ Match by Interest' },
  { value: 'friend_finder', label: '💖 Friend Finder' },
  { value: 'topic_room', label: '🧭 Topic Room' },
] as const satisfies ReadonlyArray<{ value: RoomType; label: string }>

const ROOM_ICONS: Record<string, typeof HashIcon> = {
  text: HashIcon,
  voice: MicIcon,
  video: VideoIcon,
  stage: VideoIcon,
  truth_or_dare: SparkleIcon,
  would_you_rather: SparkleIcon,
  hot_takes: SparkleIcon,
  poll: SparkleIcon,
  trivia: SparkleIcon,
  debate: SparkleIcon,
  guess_who: SparkleIcon,
  game: SparkleIcon,
  activity: SparkleIcon,
  random_chat: SparkleIcon,
  anonymous_chat: LockIcon,
  match_interest: SparkleIcon,
  friend_finder: SparkleIcon,
  topic_room: SparkleIcon,
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
  const toast = useToast()

  const rooms = useCommunityRoomsQuery(community.id)
  const createRoom = useCreateCommunityRoomMutation(community.id)
  const deleteRoom = useDeleteRoomMutation()

  const [name, setName] = useState('')
  const [type, setType] = useState<RoomType>('text')
  const [topic, setTopic] = useState('')
  const creating = createRoom.isPending

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    try {
      await createRoom.mutateAsync({
        name: name.trim(),
        room_type: type,
        topic: topic.trim() || undefined,
      })
      setName('')
      setTopic('')
      toast.success('Channel created')
    } catch (cause) {
      toast.error('Could not create channel', errorText(cause))
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
      await deleteRoom.mutateAsync(roomId)
      toast.success('Channel deleted')
    } catch (cause) {
      toast.error('Could not delete channel', errorText(cause))
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

      {rooms.error && <Callout tone="danger">{errorText(rooms.error, 'Could not load channels')}</Callout>}
      {rooms.isLoading && <PanelSkeleton rows={4} />}

      <PanelList
        empty={!rooms.isLoading && (rooms.data?.length ?? 0) === 0}
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
