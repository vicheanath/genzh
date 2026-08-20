import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  CompassIcon,
  CopyIcon,
  FlameIcon,
  GamepadIcon,
  HashIcon,
  LockIcon,
  MessageSquareIcon,
  MicIcon,
  PaletteIcon,
  PlusIcon,
  RadioIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
  VideoIcon,
  VoteIcon,
  ZapIcon,
} from '@/components/Icons'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { LoadingPanel, Spinner } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import { useToast } from '@/components/Toast'
import {
  ApiError,
  communities as communitiesApi,
  rooms as roomsApi,
  type RoomType,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAsync } from '@/lib/useAsync'
import { can } from '@/lib/permissions'

import type { ShellContext } from './AppShell'
import { CommunitySettingsModal } from './CommunitySettingsModal'
import { MemberList } from './MemberList'

import styles from './CommunityRoute.module.css'

type CommunityTab = 'channels' | 'members' | 'about'

const ROOM_TYPES = [
  { value: 'text', label: '💬 Text Channel' },
  { value: 'voice', label: '🎙️ Voice & Screen Channel' },
  { value: 'stage', label: '📻 Stage Channel (Discord-like)' },
  { value: 'video', label: '📹 Video Stage' },
  { value: 'debate', label: '🔥 Debate Arena' },
  { value: 'poll', label: '🗳️ Live Poll' },
  { value: 'game', label: '🎮 Party Mini-Games' },
  { value: 'confession', label: '🤫 Confessions Wall' },
  { value: 'quick_chat', label: '⚡ Speed Chat' },
  { value: 'activity', label: '🎨 Activity Lounge' },
] as const satisfies ReadonlyArray<{ value: RoomType; label: string }>

const ROOM_ICONS: Record<string, typeof HashIcon> = {
  text: HashIcon,
  voice: MicIcon,
  video: VideoIcon,
  stage: RadioIcon,
  activity: PaletteIcon,
  poll: VoteIcon,
  debate: FlameIcon,
  game: GamepadIcon,
  confession: LockIcon,
  quick_chat: ZapIcon,
}

export function CommunityRoute() {
  const { communityId = '' } = useParams<{ communityId: string }>()
  const { getToken } = useAuth()
  const { reloadRooms, reloadCommunities } = useOutletContext<ShellContext>()
  const navigate = useNavigate()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState<CommunityTab>('channels')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showCreateRoom, setShowCreateRoom] = useState(false)

  const community = useAsync(
    async () => communitiesApi.get(await getToken(), communityId),
    [getToken, communityId],
  )

  const rooms = useAsync(
    async () => roomsApi.list(await getToken(), communityId),
    [getToken, communityId],
  )

  const members = useAsync(
    async () => communitiesApi.members(await getToken(), communityId),
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

  const textRooms = rooms.data?.filter((r) => r.room_type === 'text') ?? []
  const liveRooms = rooms.data?.filter((r) => r.room_type !== 'text') ?? []

  async function createRoom(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const room = await roomsApi.create(await getToken(), communityId, {
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        room_type: roomType,
      })
      setName('')
      setShowCreateRoom(false)
      reloadRooms()
      rooms.reload()
      toast.success(`#${room.name} created!`)
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
      .then(() => toast.success('Invite code copied!', 'Share this ID with friends so they can join.'))
      .catch(() => toast.error('Could not copy invite code'))
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

  const defaultRoom = textRooms[0] ?? rooms.data?.[0]

  return (
    <div className={styles.scroll}>
      {/* Dynamic Hero Banner */}
      <div
        className={styles.banner}
        style={{ '--seed': hueFor(community.data.name) } as React.CSSProperties}
      >
        <div className={styles.bannerOverlay} />
      </div>

      <div className={styles.page}>
        {/* Profile Card Header */}
        <header className={styles.headerCard}>
          <div className={styles.headerTop}>
            <div className={styles.avatarGroup}>
              <Avatar
                name={community.data.name}
                src={community.data.icon_url}
                size="xl"
                className={styles.icon}
              />
              <div className={styles.headerIdentity}>
                <h1 className={styles.title}>{community.data.name}</h1>
                {community.data.description && (
                  <p className={styles.description}>{community.data.description}</p>
                )}
              </div>
            </div>

            <div className={styles.headerActions}>
              {defaultRoom && (
                <Button
                  size="sm"
                  onClick={() => void navigate(`/c/${communityId}/r/${defaultRoom.id}`)}
                >
                  <MessageSquareIcon size={15} />
                  Open #{defaultRoom.name}
                </Button>
              )}

              <Button size="sm" variant="secondary" onClick={copyInvite}>
                <CopyIcon size={15} />
                Share Invite
              </Button>

              {canManageCommunity && (
                <Tooltip content="Server Settings">
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    onClick={() => setSettingsOpen(true)}
                    aria-label="Server Settings"
                  >
                    <SettingsIcon size={16} />
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Stats Bar */}
          <div className={styles.statsBar}>
            <div className={styles.statItem}>
              <div className={styles.statIcon}>
                <UsersIcon size={17} />
              </div>
              <div className={styles.statData}>
                <span className={styles.statValue}>{members.data?.length ?? 1}</span>
                <span className={styles.statLabel}>Members</span>
              </div>
            </div>

            <div className={styles.statItem}>
              <div className={styles.statIcon}>
                <HashIcon size={17} />
              </div>
              <div className={styles.statData}>
                <span className={styles.statValue}>{textRooms.length}</span>
                <span className={styles.statLabel}>Text Channels</span>
              </div>
            </div>

            <div className={styles.statItem}>
              <div className={styles.statIcon}>
                <MicIcon size={17} />
              </div>
              <div className={styles.statData}>
                <span className={styles.statValue}>{liveRooms.length}</span>
                <span className={styles.statLabel}>Voice & Live</span>
              </div>
            </div>

            <div className={styles.statItem}>
              <div className={styles.statIcon}>
                <ShieldIcon size={17} />
              </div>
              <div className={styles.statData}>
                <span className={styles.statValue}>
                  {community.data.your_permissions.includes('administrator') ? 'Admin' : 'Member'}
                </span>
                <span className={styles.statLabel}>Your Role</span>
              </div>
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <nav className={styles.tabBar} aria-label="Community sections">
          <button
            type="button"
            className={cx(styles.tabButton, activeTab === 'channels' && styles.tabButtonActive)}
            onClick={() => setActiveTab('channels')}
          >
            <HashIcon size={15} />
            <span>Channels ({rooms.data?.length ?? 0})</span>
          </button>
          <button
            type="button"
            className={cx(styles.tabButton, activeTab === 'members' && styles.tabButtonActive)}
            onClick={() => setActiveTab('members')}
          >
            <UsersIcon size={15} />
            <span>Members ({members.data?.length ?? 0})</span>
          </button>
          <button
            type="button"
            className={cx(styles.tabButton, activeTab === 'about' && styles.tabButtonActive)}
            onClick={() => setActiveTab('about')}
          >
            <CompassIcon size={15} />
            <span>About & Invite</span>
          </button>
        </nav>

        {error && <Callout tone="danger">{error}</Callout>}

        {/* CHANNELS TAB */}
        {activeTab === 'channels' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {canManageRooms && (
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>Channel Management</span>
                <Button
                  size="sm"
                  variant={showCreateRoom ? 'secondary' : 'primary'}
                  onClick={() => setShowCreateRoom((v) => !v)}
                >
                  <PlusIcon size={15} />
                  {showCreateRoom ? 'Cancel' : 'Create Channel'}
                </Button>
              </div>
            )}

            {/* Create Room Form */}
            {canManageRooms && showCreateRoom && (
              <form className={styles.formCard} onSubmit={createRoom}>
                <div className={styles.formHeader}>
                  <PlusIcon size={16} />
                  <span>Create a New Channel</span>
                </div>
                <div className={styles.formGrid}>
                  <Input
                    label="Channel Name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. general, announcements, gaming"
                    maxLength={64}
                    required
                  />
                  <Select
                    aria-label="Channel type"
                    value={roomType}
                    onValueChange={setRoomType}
                    options={ROOM_TYPES}
                  />
                  <Button type="submit" disabled={busy || !name.trim()}>
                    {busy && <Spinner />}
                    Create Channel
                  </Button>
                </div>
              </form>
            )}

            {/* Text Channels */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Text Channels</h2>
              {textRooms.length > 0 ? (
                <div className={styles.roomsGrid}>
                  {textRooms.map((room) => (
                    <Link
                      key={room.id}
                      to={`/c/${communityId}/r/${room.id}`}
                      className={styles.roomCard}
                    >
                      <span className={styles.roomIcon}>
                        <HashIcon size={16} />
                      </span>
                      <div className={styles.roomBody}>
                        <div className={styles.roomName}>{room.name}</div>
                        {room.topic && <p className={styles.roomTopic}>{room.topic}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={styles.hint}>No text channels in this server yet.</p>
              )}
            </section>

            {/* Voice & Media Rooms */}
            {liveRooms.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Voice & Live Stages</h2>
                <div className={styles.roomsGrid}>
                  {liveRooms.map((room) => {
                    const Icon = ROOM_ICONS[room.room_type] ?? MicIcon
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
                        <Badge tone="mint" dot>
                          {room.room_type}
                        </Badge>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* MEMBERS TAB */}
        {activeTab === 'members' && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Community Members</span>
            </div>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              <MemberList communityId={communityId} />
            </div>
          </section>
        )}

        {/* ABOUT & INVITE TAB */}
        {activeTab === 'about' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <section className={styles.inviteCard}>
              <h2 className={styles.sectionTitle}>Server Invite Code</h2>
              <p className={styles.description}>
                Share this unique invite ID with friends or teammates. They can enter it in the Explore / Join Community page.
              </p>
              <div className={styles.inviteInputRow}>
                <code className={styles.inviteCode}>{community.data.id}</code>
                <Button size="sm" onClick={copyInvite}>
                  <CopyIcon size={15} />
                  Copy Code
                </Button>
              </div>
            </section>

            <section className={styles.inviteCard}>
              <h2 className={styles.sectionTitle}>Server Details</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <div><strong>Server Name:</strong> {community.data.name}</div>
                <div><strong>Description:</strong> {community.data.description || 'No description provided.'}</div>
                <div><strong>Total Channels:</strong> {rooms.data?.length ?? 0}</div>
                <div><strong>Created:</strong> {new Date(community.data.created_at).toLocaleDateString()}</div>
              </div>
            </section>
          </div>
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
