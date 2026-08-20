import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useEffect, useState, type FormEvent } from 'react'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  CopyIcon,
  CrownIcon,
  HashIcon,
  LockIcon,
  MicIcon,
  PlusIcon,
  ShieldIcon,
  SparkleIcon,
  TrashIcon,
  UserMinusIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
} from '@/components/Icons'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Spinner } from '@/components/Spinner'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import {
  ApiError,
  communities as communitiesApi,
  rooms as roomsApi,
  type CommunityWithPermissions,
  type Permission,
  type RoomType,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { can } from '@/lib/permissions'
import { useAsync } from '@/lib/useAsync'
import { useProfiles } from '@/lib/useProfiles'

import styles from './CommunitySettingsModal.module.css'

export type CommunityTab = 'overview' | 'roles' | 'members' | 'rooms'

const ALL_PERMISSIONS: ReadonlyArray<{ id: Permission; label: string; description: string }> = [
  { id: 'view_room', label: 'View Rooms', description: 'Allows members to view channels by default.' },
  { id: 'send_message', label: 'Send Messages', description: 'Allows members to send text messages.' },
  { id: 'add_reaction', label: 'Add Reactions', description: 'Allows members to react to messages.' },
  { id: 'speak', label: 'Speak', description: 'Allows members to talk in voice channels.' },
  { id: 'use_video', label: 'Video', description: 'Allows members to share their camera.' },
  { id: 'screen_share', label: 'Screen Share', description: 'Allows members to stream screens.' },
  { id: 'stream', label: 'Stream Activity', description: 'Allows high-bitrate media streaming.' },
  { id: 'mute_members', label: 'Mute Members', description: 'Allows muting others in voice channels.' },
  { id: 'move_members', label: 'Move Members', description: 'Allows disconnecting or moving members.' },
  { id: 'manage_room', label: 'Manage Channels', description: 'Allows creating, editing, and deleting rooms.' },
  { id: 'manage_community', label: 'Manage Server', description: 'Allows editing server name, icon, and description.' },
  { id: 'manage_roles', label: 'Manage Roles', description: 'Allows creating and assigning server roles.' },
  { id: 'manage_members', label: 'Manage Members', description: 'Allows inviting or kicking members.' },
  { id: 'administrator', label: 'Administrator', description: 'Grants all permissions and bypasses checks.' },
]

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

interface CommunitySettingsModalProps {
  open: boolean
  community: CommunityWithPermissions
  onClose: () => void
  onCommunityUpdated?: () => void
  onCommunityDeleted?: () => void
}

export function CommunitySettingsModal({
  open,
  community,
  onClose,
  onCommunityUpdated,
  onCommunityDeleted,
}: CommunitySettingsModalProps) {
  const { getToken, user } = useAuth()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState<CommunityTab>('overview')

  // Overview form
  const [name, setName] = useState(community.name)
  const [description, setDescription] = useState(community.description ?? '')
  const [iconUrl, setIconUrl] = useState(community.icon_url ?? '')
  const [savingOverview, setSavingOverview] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  // Roles state
  const roles = useAsync(
    async () => communitiesApi.roles(await getToken(), community.id),
    [getToken, community.id],
  )
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleColor, setNewRoleColor] = useState('#5865f2')
  const [selectedPermissions, setSelectedPermissions] = useState<Set<Permission>>(
    new Set(['view_room', 'send_message', 'add_reaction', 'speak', 'use_video']),
  )
  const [creatingRole, setCreatingRole] = useState(false)

  // Members state
  const members = useAsync(
    async () => communitiesApi.members(await getToken(), community.id),
    [getToken, community.id],
  )
  const [memberSearch, setMemberSearch] = useState('')
  const lookup = useProfiles(members.data?.map((m) => m.user_id) ?? [])

  // Rooms state
  const rooms = useAsync(
    async () => roomsApi.list(await getToken(), community.id),
    [getToken, community.id],
  )
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomType, setNewRoomType] = useState<RoomType>('text')
  const [newRoomTopic, setNewRoomTopic] = useState('')
  const [creatingRoom, setCreatingRoom] = useState(false)

  // Permissions of current user in this community
  const isOwner = user?.id === community.owner_id
  const canManageCommunity = isOwner || can(community.your_permissions, 'manage_community')
  const canManageRoles = isOwner || can(community.your_permissions, 'manage_roles')
  const canManageMembers = isOwner || can(community.your_permissions, 'manage_members')
  const canManageRooms = isOwner || can(community.your_permissions, 'manage_room')

  useEffect(() => {
    if (open) {
      setName(community.name)
      setDescription(community.description ?? '')
      setIconUrl(community.icon_url ?? '')
      setOverviewError(null)
    }
  }, [open, community])

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

  if (!open) return null

  async function handleSaveOverview(event: FormEvent) {
    event.preventDefault()
    setOverviewError(null)
    setSavingOverview(true)
    try {
      await communitiesApi.update(await getToken(), community.id, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        icon_url: iconUrl.trim() || undefined,
      })
      toast.success('Server settings saved')
      onCommunityUpdated?.()
    } catch (cause) {
      setOverviewError(cause instanceof ApiError ? cause.message : 'Could not save server settings')
    } finally {
      setSavingOverview(false)
    }
  }

  async function handleDeleteCommunity() {
    if (!window.confirm(`Are you sure you want to delete ${community.name}? This action cannot be undone.`)) {
      return
    }
    try {
      await communitiesApi.delete(await getToken(), community.id)
      toast.success('Server deleted')
      onClose()
      onCommunityDeleted?.()
    } catch (cause) {
      toast.error('Could not delete server', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  async function handleCreateRole(event: FormEvent) {
    event.preventDefault()
    if (!newRoleName.trim()) return
    setCreatingRole(true)
    try {
      await communitiesApi.createRole(await getToken(), community.id, {
        name: newRoleName.trim(),
        color: newRoleColor,
        permissions: Array.from(selectedPermissions),
      })
      setNewRoleName('')
      roles.reload()
      toast.success('Role created')
    } catch (cause) {
      toast.error('Could not create role', cause instanceof ApiError ? cause.message : undefined)
    } finally {
      setCreatingRole(false)
    }
  }

  async function handleCreateRoom(event: FormEvent) {
    event.preventDefault()
    if (!newRoomName.trim()) return
    setCreatingRoom(true)
    try {
      await roomsApi.create(await getToken(), community.id, {
        name: newRoomName.trim(),
        room_type: newRoomType,
        topic: newRoomTopic.trim() || undefined,
      })
      setNewRoomName('')
      setNewRoomTopic('')
      rooms.reload()
      toast.success('Room created')
    } catch (cause) {
      toast.error('Could not create room', cause instanceof ApiError ? cause.message : undefined)
    } finally {
      setCreatingRoom(false)
    }
  }

  async function handleDeleteRoom(roomId: Uuid) {
    if (!window.confirm('Are you sure you want to delete this channel?')) return
    try {
      await roomsApi.delete(await getToken(), roomId)
      rooms.reload()
      toast.success('Channel deleted')
    } catch (cause) {
      toast.error('Could not delete channel', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  async function handleRemoveMember(memberId: Uuid) {
    if (!window.confirm('Are you sure you want to remove this member from the server?')) return
    try {
      await communitiesApi.leave(await getToken(), community.id, memberId)
      members.reload()
      toast.success('Member removed')
    } catch (cause) {
      toast.error('Could not remove member', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  async function handleAssignRole(userId: Uuid, roleId: Uuid) {
    try {
      await communitiesApi.assignRole(await getToken(), community.id, userId, roleId)
      toast.success('Role assigned')
    } catch (cause) {
      toast.error('Could not assign role', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  function copyServerId() {
    void navigator.clipboard
      ?.writeText(community.id)
      .then(() => toast.success('Server Invite ID copied!'))
      .catch(() => toast.error('Could not copy server ID'))
  }

  const filteredMembers = (members.data ?? []).filter((m) => {
    const prof = lookup(m.user_id)
    if (!memberSearch) return true
    const search = memberSearch.toLowerCase()
    return (
      prof?.display_name.toLowerCase().includes(search) ||
      prof?.handle.toLowerCase().includes(search) ||
      m.user_id.toLowerCase().includes(search)
    )
  })

  return (
    <BaseDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.modal}>
          {/* Sidebar */}
          <aside className={styles.sidebar}>
          <div className={styles.sidebarGroup}>
            <div className={styles.sidebarHeading}>{community.name}</div>
            <button
              type="button"
              className={cx(styles.navButton, activeTab === 'overview' && styles.navButtonActive)}
              onClick={() => setActiveTab('overview')}
            >
              <ShieldIcon size={16} />
              Overview
            </button>
            <button
              type="button"
              className={cx(styles.navButton, activeTab === 'roles' && styles.navButtonActive)}
              onClick={() => setActiveTab('roles')}
            >
              <LockIcon size={16} />
              Roles & Permissions
            </button>
            <button
              type="button"
              className={cx(styles.navButton, activeTab === 'members' && styles.navButtonActive)}
              onClick={() => setActiveTab('members')}
            >
              <UsersIcon size={16} />
              Members ({members.data?.length ?? 0})
            </button>
            <button
              type="button"
              className={cx(styles.navButton, activeTab === 'rooms' && styles.navButtonActive)}
              onClick={() => setActiveTab('rooms')}
            >
              <HashIcon size={16} />
              Channels ({rooms.data?.length ?? 0})
            </button>
          </div>

          {isOwner && (
            <div className={styles.sidebarGroup} style={{ marginTop: 'auto' }}>
              <button
                type="button"
                className={cx(styles.navButton, styles.dangerButton)}
                onClick={() => void handleDeleteCommunity()}
              >
                <TrashIcon size={16} />
                Delete Server
              </button>
            </div>
          )}
        </aside>

        {/* Content Area */}
        <div className={styles.contentWrapper}>
          <div className={styles.closeButtonContainer}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close Server Settings"
            >
              <XIcon size={18} />
            </button>
            <span className={styles.escKey}>ESC</span>
          </div>

          <div className={styles.scrollArea}>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div>
                <h2 className={styles.panelTitle}>Server Overview</h2>
                <p className={styles.panelDescription}>
                  Configure server identity, name, icon, and invite access.
                </p>

                {overviewError && <Callout tone="danger">{overviewError}</Callout>}

                <div className={styles.section}>
                  <div className={styles.previewIconWrap}>
                    <Avatar name={name || community.name} src={iconUrl || community.icon_url} size="xl" />
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{name || community.name}</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        Created {new Date(community.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>

                <form className={styles.formGrid} onSubmit={handleSaveOverview}>
                  <Input
                    label="Server Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter server name"
                    maxLength={64}
                    required
                    disabled={!canManageCommunity}
                  />

                  <div className={styles.textareaField}>
                    <label className={styles.fieldLabel}>Server Description</label>
                    <textarea
                      className={styles.textarea}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What is this server about?"
                      rows={3}
                      disabled={!canManageCommunity}
                    />
                  </div>

                  <Input
                    label="Server Icon URL"
                    value={iconUrl}
                    onChange={(e) => setIconUrl(e.target.value)}
                    placeholder="https://example.com/icon.png"
                    disabled={!canManageCommunity}
                  />

                  <div className={styles.section}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Server Invite ID</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                          {community.id}
                        </div>
                      </div>
                      <Button type="button" size="sm" variant="secondary" onClick={copyServerId}>
                        <CopyIcon size={14} />
                        Copy Invite
                      </Button>
                    </div>
                  </div>

                  {canManageCommunity && (
                    <div>
                      <Button type="submit" disabled={savingOverview}>
                        {savingOverview && <Spinner />}
                        Save Changes
                      </Button>
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* ROLES TAB */}
            {activeTab === 'roles' && (
              <div>
                <h2 className={styles.panelTitle}>Roles & Permissions</h2>
                <p className={styles.panelDescription}>
                  Manage server roles and fine-grained permissions for members.
                </p>

                {canManageRoles && (
                  <form className={styles.section} onSubmit={handleCreateRole}>
                    <h3 className={styles.sectionTitle}>Create New Role</h3>
                    <div className={styles.formRow}>
                      <Input
                        className={styles.grow}
                        label="Role Name"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="e.g. Moderator"
                        required
                      />
                      <Input
                        label="Color"
                        value={newRoleColor}
                        onChange={(e) => setNewRoleColor(e.target.value)}
                        style={{ width: '100px' }}
                      />
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <div className={styles.fieldLabel}>Permissions to Grant</div>
                      <div className={styles.permissionsGrid}>
                        {ALL_PERMISSIONS.map((perm) => (
                          <div key={perm.id} className={styles.permItem}>
                            <div>
                              <div className={styles.permLabel}>{perm.label}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                {perm.description}
                              </div>
                            </div>
                            <Switch
                              checked={selectedPermissions.has(perm.id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedPermissions)
                                if (checked) next.add(perm.id)
                                else next.delete(perm.id)
                                setSelectedPermissions(next)
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <Button type="submit" disabled={creatingRole || !newRoleName.trim()}>
                        {creatingRole && <Spinner />}
                        <PlusIcon size={14} />
                        Create Role
                      </Button>
                    </div>
                  </form>
                )}

                <div className={styles.rolesList}>
                  <div className={styles.fieldLabel}>Server Roles</div>
                  {roles.data?.map((role) => (
                    <div key={role.id} className={styles.roleCard}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span
                          className={styles.roleColorPill}
                          style={{ backgroundColor: role.color ?? '#5865f2' }}
                        />
                        <span style={{ fontWeight: 600 }}>{role.name}</span>
                        {role.is_default && (
                          <span style={{ marginLeft: '0.5rem' }}>
                            <Badge>Default</Badge>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MEMBERS TAB */}
            {activeTab === 'members' && (
              <div>
                <h2 className={styles.panelTitle}>Server Members</h2>
                <p className={styles.panelDescription}>
                  {members.data?.length ?? 0} members in this server.
                </p>

                <div style={{ marginBottom: '1rem' }}>
                  <Input
                    label="Search Members"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search members by name or handle..."
                  />
                </div>

                <div className={styles.membersList}>
                  {filteredMembers.map((m) => {
                    const prof = lookup(m.user_id)
                    const isMemOwner = m.user_id === community.owner_id
                    return (
                      <div key={m.user_id} className={styles.memberCard}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <Avatar
                            name={prof?.display_name ?? '?'}
                            src={prof?.avatar_url}
                            color={prof?.accent_color}
                            size="md"
                          />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontWeight: 600 }}>{prof?.display_name ?? 'Loading…'}</span>
                              {isMemOwner && <CrownIcon size={14} style={{ color: '#f59e0b' }} />}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                              @{prof?.handle ?? m.user_id.slice(0, 8)}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {canManageRoles && roles.data && roles.data.length > 0 && (
                            <Select
                              aria-label="Assign Role"
                              value=""
                              onValueChange={(val) => val && void handleAssignRole(m.user_id, val)}
                              options={[
                                { value: '', label: 'Assign Role...' },
                                ...roles.data.map((r) => ({ value: r.id, label: r.name })),
                              ]}
                            />
                          )}

                          {canManageMembers && !isMemOwner && (
                            <Button
                              size="sm"
                              variant="ghost"
                              iconOnly
                              onClick={() => void handleRemoveMember(m.user_id)}
                              aria-label="Remove member"
                            >
                              <UserMinusIcon size={16} />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* CHANNELS / ROOMS TAB */}
            {activeTab === 'rooms' && (
              <div>
                <h2 className={styles.panelTitle}>Channels</h2>
                <p className={styles.panelDescription}>
                  Manage text and voice communication channels for this server.
                </p>

                {canManageRooms && (
                  <form className={styles.section} onSubmit={handleCreateRoom}>
                    <h3 className={styles.sectionTitle}>Create New Channel</h3>
                    <div className={styles.formRow}>
                      <Input
                        className={styles.grow}
                        label="Channel Name"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="e.g. general"
                        required
                      />
                      <Select
                        aria-label="Room type"
                        value={newRoomType}
                        onValueChange={setNewRoomType}
                        options={ROOM_TYPES}
                      />
                      <Button type="submit" disabled={creatingRoom || !newRoomName.trim()}>
                        {creatingRoom && <Spinner />}
                        <PlusIcon size={14} />
                        Create
                      </Button>
                    </div>
                  </form>
                )}

                <div className={styles.roomsList}>
                  {rooms.data?.map((room) => {
                    const Icon = ROOM_ICONS[room.room_type] ?? HashIcon
                    return (
                      <div key={room.id} className={styles.roomCard}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <Icon size={18} />
                          <span style={{ fontWeight: 600 }}>{room.name}</span>
                          <Badge tone="mint">{room.room_type}</Badge>
                          {room.topic && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                              {room.topic}
                            </span>
                          )}
                        </div>

                        {canManageRooms && (
                          <Button
                            size="sm"
                            variant="ghost"
                            iconOnly
                            onClick={() => void handleDeleteRoom(room.id)}
                            aria-label="Delete channel"
                          >
                            <TrashIcon size={15} />
                          </Button>
                        )}
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
