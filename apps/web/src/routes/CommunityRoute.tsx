import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { CopyIcon, HashIcon, MicIcon, SettingsIcon, SparkleIcon, VideoIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { LoadingPanel, Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import {
  ApiError,
  communities as communitiesApi,
  rooms as roomsApi,
  type RoomType,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'
import { can } from '@/lib/permissions'
import { useIsMobile } from '@/lib/useMediaQuery'

import type { ShellContext } from './AppShell'
import { CommunitySettingsModal } from './CommunitySettingsModal'
import { MemberList } from './MemberList'

import styles from './CommunityRoute.module.css'

const ROOM_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'voice', label: 'Voice' },
  { value: 'video', label: 'Video' },
] as const satisfies ReadonlyArray<{ value: RoomType; label: string }>

const ROOM_ICONS: Record<RoomType, typeof HashIcon> = {
  text: HashIcon,
  voice: MicIcon,
  video: VideoIcon,
  activity: SparkleIcon,
}

export function CommunityRoute() {
  const { communityId = '' } = useParams<{ communityId: string }>()
  const { getToken } = useAuth()
  const { reloadRooms, reloadCommunities } = useOutletContext<ShellContext>()
  const navigate = useNavigate()
  const toast = useToast()
  const isMobile = useIsMobile()

  const [settingsOpen, setSettingsOpen] = useState(false)

  const community = useAsync(
    async () => communitiesApi.get(await getToken(), communityId),
    [getToken, communityId],
  )

  const rooms = useAsync(
    async () => roomsApi.list(await getToken(), communityId),
    [getToken, communityId],
  )

  const [name, setName] = useState('')
  const [roomType, setRoomType] = useState<RoomType>('text')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canManageRooms = can(community.data?.your_permissions ?? [], 'manage_room')
  const canManageCommunity =
    can(community.data?.your_permissions ?? [], 'manage_community') ||
    can(community.data?.your_permissions ?? [], 'administrator')

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
      rooms.reload()
      toast.success(`#${room.name} created`)
      void navigate(`/c/${communityId}/r/${room.id}`)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create the room')
    } finally {
      setBusy(false)
    }
  }

  function copyInvite() {
    if (!community.data) return
    void navigator.clipboard
      ?.writeText(community.data.id)
      .then(() => toast.success('Invite copied', 'Share it with anyone you want in here.'))
      .catch(() => toast.error('Could not copy', 'Select the id and copy it by hand.'))
  }

  if (community.loading) return <LoadingPanel />
  if (community.error) {
    return (
      <div className={styles.scroll}>
        <div className={styles.page}>
          <Callout tone="danger">{community.error}</Callout>
        </div>
      </div>
    )
  }
  if (!community.data) return null

  return (
    <div className={styles.scroll}>
      {/* The banner is generated from the community's own accent, so every
          community looks distinct without anyone uploading anything. */}
      <div className={styles.banner} style={{ '--seed': hueFor(community.data.name) } as React.CSSProperties} />

      <div className={styles.page}>
        <header className={styles.header}>
          <Avatar
            name={community.data.name}
            src={community.data.icon_url}
            size="xl"
            className={styles.icon}
          />
          <div className={styles.headerText}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h1 className={styles.title}>{community.data.name}</h1>
              {canManageCommunity && (
                <Button size="sm" variant="secondary" onClick={() => setSettingsOpen(true)}>
                  <SettingsIcon size={15} />
                  Server Settings
                </Button>
              )}
            </div>
            {community.data.description && (
              <p className={styles.description}>{community.data.description}</p>
            )}
            <div className={styles.badges}>
              {community.data.your_permissions.includes('administrator') ? (
                <Badge tone="mint">administrator</Badge>
              ) : (
                <Badge tone="accent">
                  {community.data.your_permissions.length}{' '}
                  {community.data.your_permissions.length === 1
                    ? 'permission'
                    : 'permissions'}
                </Badge>
              )}
            </div>
          </div>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Invite</h2>
          <div className={styles.invite}>
            <code className={styles.inviteId}>{community.data.id}</code>
            <Button size="sm" variant="secondary" onClick={copyInvite}>
              <CopyIcon size={15} />
              Copy
            </Button>
          </div>
          <p className={styles.hint}>
            Anyone with this id can join from their Home screen.
          </p>
        </section>

        {error && <Callout tone="danger">{error}</Callout>}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Rooms</h2>

          {rooms.loading && <p className={styles.hint}>Loading rooms…</p>}

          {rooms.data && rooms.data.length > 0 && (
            <div className={styles.rooms}>
              {rooms.data.map((room) => {
                const Icon = ROOM_ICONS[room.room_type] ?? HashIcon
                return (
                  <Link
                    key={room.id}
                    to={`/c/${communityId}/r/${room.id}`}
                    className={styles.roomCard}
                  >
                    <span className={styles.roomIcon}>
                      <Icon size={16} />
                    </span>
                    <div className={styles.roomBody}>
                      <div className={styles.roomName}>{room.name}</div>
                      {room.topic && <p className={styles.roomTopic}>{room.topic}</p>}
                    </div>
                    {room.room_type !== 'text' && <Badge tone="mint">{room.room_type}</Badge>}
                  </Link>
                )
              })}
            </div>
          )}

          {rooms.data?.length === 0 && (
            <p className={styles.hint}>
              No rooms yet.{' '}
              {canManageRooms ? 'Create the first one below.' : 'Ask an admin to add one.'}
            </p>
          )}
        </section>

        {canManageRooms && (
          <form className={styles.form} onSubmit={createRoom}>
            <div className={styles.formTitle}>Create a room</div>
            <div className={styles.row}>
              <Input
                className={styles.grow}
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="lounge"
                maxLength={64}
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

        {/* The member list is a rail beside a room on a desktop; on the
            community page it is content, and on a phone it is the only place
            it appears at all. */}
        {isMobile && (
          <section className={styles.membersSection}>
            <MemberList communityId={communityId} />
          </section>
        )}
      </div>

      <CommunitySettingsModal
        open={settingsOpen}
        community={community.data}
        onClose={() => setSettingsOpen(false)}
        onCommunityUpdated={() => {
          community.reload()
          reloadCommunities()
        }}
        onCommunityDeleted={() => {
          reloadCommunities()
          void navigate('/')
        }}
      />
    </div>
  )
}

/** A stable hue per community name, matching the Avatar's scheme. */
function hueFor(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0
  }
  return `${Math.abs(hash) % 360}`
}
