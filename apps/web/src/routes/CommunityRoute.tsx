import { useState, type FormEvent } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { LoadingPanel, Spinner } from '@/components/Spinner'
import {
  ApiError,
  communities as communitiesApi,
  rooms as roomsApi,
  type RoomType,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'

import type { ShellContext } from './AppShell'
import styles from './CommunityRoute.module.css'

const ROOM_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'voice', label: 'Voice' },
  { value: 'video', label: 'Video' },
] as const satisfies ReadonlyArray<{ value: RoomType; label: string }>

export function CommunityRoute() {
  const { communityId = '' } = useParams<{ communityId: string }>()
  const { getToken } = useAuth()
  const { reloadRooms } = useOutletContext<ShellContext>()
  const navigate = useNavigate()

  const community = useAsync(
    async () => communitiesApi.get(await getToken(), communityId),
    [getToken, communityId],
  )

  const [name, setName] = useState('')
  const [roomType, setRoomType] = useState<RoomType>('voice')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canManageRooms =
    community.data?.your_permissions.includes('manage_room') ?? false

  async function createRoom(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const room = await roomsApi.create(await getToken(), communityId, {
        name,
        room_type: roomType,
      })
      setName('')
      reloadRooms()
      void navigate(`/c/${communityId}/r/${room.id}`)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create the room')
    } finally {
      setBusy(false)
    }
  }

  if (community.loading) return <LoadingPanel />
  if (community.error) return <div className={styles.page}><Callout tone="danger">{community.error}</Callout></div>
  if (!community.data) return null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Avatar name={community.data.name} src={community.data.icon_url} size="lg" />
        <div>
          <h1 className={styles.title}>{community.data.name}</h1>
          <p className={styles.meta}>
            {community.data.your_permissions.length} permissions here
          </p>
        </div>
      </div>

      <div>
        <p className={styles.meta} style={{ marginBottom: 'var(--space-2)' }}>
          Invite someone by sharing this community id:
        </p>
        <div className={styles.invite}>
          <span>{community.data.id}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void navigator.clipboard?.writeText(community.data!.id)}
          >
            Copy
          </Button>
        </div>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      {canManageRooms && (
        <form className={styles.form} onSubmit={createRoom}>
          <div className={styles.formTitle}>Create a room</div>
          <div className={styles.row}>
            <Input
              className={styles.grow}
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="lounge"
              required
            />
            <Select
              aria-label="Room type"
              value={roomType}
              onValueChange={setRoomType}
              options={ROOM_TYPES}
            />
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Spinner />}
              Create
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
