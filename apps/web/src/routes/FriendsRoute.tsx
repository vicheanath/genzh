import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  BanIcon,
  CheckIcon,
  CopyIcon,
  MessageSquareIcon,
  MoreIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from '@/components/Icons'
import { Menu, MenuItem } from '@/components/Menu'
import { Skeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { UserRow } from '@/components/UserRow'
import {
  ApiError,
  blocks as blocksApi,
  friends as friendsApi,
  rooms as roomsApi,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'
import { useAppStore } from '@/lib/store'
import { formatRelative } from '@/lib/time'
import { useAsync } from '@/lib/useAsync'
import { usePresence } from '@/lib/usePresence'
import { useProfiles } from '@/lib/useProfiles'

import { ProfileDialog } from './ProfileDialog'
import styles from './FriendsRoute.module.css'
import { useConfirm } from '@/components/AlertDialog'

export type FriendTab = 'online' | 'all' | 'pending' | 'blocked' | 'add'

interface AddFriendFormValues {
  userId: string
}

export function FriendsRoute() {
  const confirm = useConfirm()
  const { getToken, user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const tab = useAppStore((s) => s.friendsTab)
  const setTab = useAppStore((s) => s.setFriendsTab)

  const { isOnline } = usePresence()
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<Uuid | null>(null)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)

  const friends = useAsync(async () => friendsApi.list(await getToken()), [getToken])
  const requests = useAsync(async () => friendsApi.pending(await getToken()), [getToken])
  const sent = useAsync(async () => friendsApi.sent(await getToken()), [getToken])
  const blocked = useAsync(async () => blocksApi.list(await getToken()), [getToken])

  // Local overlay on the fetched list, so blocking and unblocking take effect
  // without a round trip. Null means "nothing changed here yet".
  const [blockOverride, setBlockOverride] = useState<Uuid[] | null>(null)
  const blockedUsers = blockOverride ?? blocked.data ?? []

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const addFriendForm = useForm<AddFriendFormValues>({
    defaultValues: { userId: '' },
  })

  const allIds = [
    ...(friends.data ?? []),
    ...(requests.data ?? []).map((r) => r.requester_id),
    ...(sent.data ?? []).map((r) => r.addressee_id),
    ...blockedUsers,
  ]
  const lookup = useProfiles(allIds)

  const refresh = useCallback(() => {
    friends.reload()
    requests.reload()
    sent.reload()
  }, [friends, requests, sent])

  async function openDM(friendId: Uuid) {
    const prof = lookup(friendId)
    try {
      const token = await getToken()
      const targetName = prof?.display_name ?? 'Friend'
      const dmRoom = await roomsApi.openDM(token, friendId)
      toast.success(`Opening conversation with ${targetName}!`)
      void navigate(`/rooms/${dmRoom.id}`)
    } catch {
      toast.error('Could not start direct chat')
    }
  }

  async function sendRequest(data: AddFriendFormValues) {
    const id = data.userId.trim()
    if (!id) return
    setError(null)
    setBusy(true)
    try {
      await friendsApi.request(await getToken(), id)
      addFriendForm.reset()
      toast.success('Friend request sent!')
      refresh()
      setTab('pending')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send request')
    } finally {
      setBusy(false)
    }
  }

  async function respond(requesterId: Uuid, accept: boolean) {
    try {
      await friendsApi.respond(await getToken(), requesterId, accept)
      toast.success(accept ? 'Friend request accepted!' : 'Friend request declined')
      refresh()
    } catch (cause) {
      toast.error('Could not respond to request', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  async function removeFriend(friendId: Uuid) {
    const ok = await confirm({
      title: 'Remove this friend?',
      description: 'You will both drop off each other\u2019s friend list. Either of you can send a new request later.',
      confirmLabel: 'Remove friend',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await friendsApi.remove(await getToken(), friendId)
      toast.success('Friend removed')
      refresh()
    } catch (cause) {
      toast.error('Could not remove friend', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  async function blockUser(otherId: Uuid) {
    try {
      await blocksApi.block(await getToken(), otherId)
      if (!blockedUsers.includes(otherId)) {
        setBlockOverride([...blockedUsers, otherId])
      }
      toast.success('User blocked', 'They can no longer message or interact with you.')
      refresh()
    } catch (cause) {
      toast.error('Could not block user', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  async function unblockUser(otherId: Uuid) {
    try {
      await blocksApi.unblock(await getToken(), otherId)
      setBlockOverride(blockedUsers.filter((id) => id !== otherId))
      toast.success('User unblocked')
      refresh()
    } catch (cause) {
      toast.error('Could not unblock user', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  function copyMyId() {
    if (!user) return
    void navigator.clipboard
      ?.writeText(user.id)
      .then(() => toast.success('Your User ID copied to clipboard!'))
      .catch(() => toast.error('Could not copy User ID'))
  }

  // Both directions: a request you sent is as pending as one you received, and
  // the sender previously had no way to see theirs at all.
  const pendingCount = (requests.data?.length ?? 0) + (sent.data?.length ?? 0)

  const filteredFriends = (friends.data ?? []).filter((friendId) => {
    // The Online tab used to render the same list as All with the dot forced
    // green. It now filters on real presence.
    if (tab === 'online' && !isOnline(friendId)) return false

    const prof = lookup(friendId)
    if (!search) return true
    const query = search.toLowerCase()
    return (
      prof?.display_name.toLowerCase().includes(query) ||
      prof?.handle.toLowerCase().includes(query) ||
      friendId.toLowerCase().includes(query)
    )
  })

  return (
    <div className={styles.scroll}>
      {/* Discord Top Tab Bar */}
      <div className={styles.topBar}>
        <div className={styles.titleArea}>
          <UsersIcon size={20} />
          <span>Friends</span>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={cx(styles.tab, tab === 'online' && styles.tabActive)}
            onClick={() => setTab('online')}
          >
            Online
          </button>
          <button
            type="button"
            className={cx(styles.tab, tab === 'all' && styles.tabActive)}
            onClick={() => setTab('all')}
          >
            All
            {friends.data && <Badge>{friends.data.length}</Badge>}
          </button>
          <button
            type="button"
            className={cx(styles.tab, tab === 'pending' && styles.tabActive)}
            onClick={() => setTab('pending')}
          >
            Pending
            {pendingCount > 0 && <Badge tone="accent">{pendingCount}</Badge>}
          </button>
          <button
            type="button"
            className={cx(styles.tab, tab === 'blocked' && styles.tabActive)}
            onClick={() => setTab('blocked')}
          >
            Blocked
            {blockedUsers.length > 0 && <Badge>{blockedUsers.length}</Badge>}
          </button>
          <button
            type="button"
            className={cx(styles.tab, styles.tabAddFriend, tab === 'add' && styles.tabActive)}
            onClick={() => setTab('add')}
          >
            <UserPlusIcon size={16} />
            Add Friend
          </button>
        </div>
      </div>

      <div className={styles.page}>
        {tab !== 'add' && (
          <div className={styles.searchWrap}>
            <SearchIcon size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search friends..."
            />
          </div>
        )}

        {/* ALL & ONLINE FRIENDS */}
        {(tab === 'all' || tab === 'online') && (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              {tab === 'online' ? 'Online Friends' : 'All Friends'} — {filteredFriends.length}
            </div>

            {friends.loading && (
              <div className={styles.list}>
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className={styles.skeletonRow}>
                    <Skeleton circle width="2.4rem" height="2.4rem" />
                    <Skeleton width="45%" height="1rem" />
                  </div>
                ))}
              </div>
            )}

            {!friends.loading && filteredFriends.length === 0 && (
              <div className={styles.empty}>
                <UsersIcon size={32} />
                <p>
                  {search
                    ? `No friends matched "${search}".`
                    : "You don't have any friends added yet."}
                </p>
                {!search && (
                  <Button size="sm" onClick={() => setTab('add')}>
                    <UserPlusIcon size={16} />
                    Add Friend
                  </Button>
                )}
              </div>
            )}

            {filteredFriends.length > 0 && (
              <div className={styles.list}>
                {filteredFriends.map((friendId) => {
                  const prof = lookup(friendId)
                  return (
                    <UserRow
                      key={friendId}
                      name={prof?.display_name ?? 'Loading…'}
                      avatarUrl={prof?.avatar_url}
                      accentColor={prof?.accent_color}
                      presence={isOnline(friendId) ? 'online' : 'offline'}
                      secondary={`@${prof?.handle ?? friendId.slice(0, 8)}`}
                      onSelect={() => {
                        setSelectedUserId(friendId)
                        setProfileDialogOpen(true)
                      }}
                      actions={
                        <>
                          <button
                            type="button"
                            className={styles.actionButton}
                            onClick={() => void openDM(friendId)}
                            aria-label="Direct message"
                            title="Send a direct message"
                          >
                            <MessageSquareIcon size={16} />
                          </button>

                          <Menu
                            trigger={
                              <button
                                type="button"
                                className={styles.actionButton}
                                aria-label="More options"
                              >
                                <MoreIcon size={16} />
                              </button>
                            }
                          >
                            <MenuItem
                              icon={<TrashIcon size={15} />}
                              onClick={() => void removeFriend(friendId)}
                            >
                              Remove friend
                            </MenuItem>
                            <MenuItem
                              tone="danger"
                              icon={<ShieldIcon size={15} />}
                              onClick={() => void blockUser(friendId)}
                            >
                              Block user
                            </MenuItem>
                          </Menu>
                        </>
                      }
                    />
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* PENDING REQUESTS */}
        {tab === 'pending' && (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Pending Friend Requests — {pendingCount}</div>

            {requests.loading && (
              <div className={styles.list}>
                {Array.from({ length: 2 }, (_, i) => (
                  <div key={i} className={styles.skeletonRow}>
                    <Skeleton circle width="2.4rem" height="2.4rem" />
                    <Skeleton width="40%" height="1rem" />
                  </div>
                ))}
              </div>
            )}

            {!requests.loading && pendingCount === 0 && (
              <div className={styles.empty}>
                <p>Nothing pending — no requests waiting, none awaiting a reply.</p>
              </div>
            )}

            {requests.data && requests.data.length > 0 && (
              <div className={styles.list}>
                {requests.data.map((req) => {
                  const prof = lookup(req.requester_id)
                  return (
                    <UserRow
                      key={req.requester_id}
                      name={prof?.display_name ?? 'Loading…'}
                      avatarUrl={prof?.avatar_url}
                      accentColor={prof?.accent_color}
                      presence={isOnline(req.requester_id) ? 'online' : 'offline'}
                      secondary={`Wants to be friends · ${formatRelative(req.created_at)}`}
                      actions={
                        <>
                          <Button size="sm" onClick={() => void respond(req.requester_id, true)}>
                            <CheckIcon size={15} />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void respond(req.requester_id, false)}
                            aria-label="Decline request"
                          >
                            <XIcon size={15} />
                            Decline
                          </Button>
                        </>
                      }
                    />
                  )
                })}
              </div>
            )}

            {sent.data && sent.data.length > 0 && (
              <>
                <div className={styles.sectionTitle}>Sent — {sent.data.length}</div>
                <div className={styles.list}>
                  {sent.data.map((req) => {
                    const prof = lookup(req.addressee_id)
                    return (
                      <UserRow
                        key={req.addressee_id}
                        name={prof?.display_name ?? 'Loading…'}
                        avatarUrl={prof?.avatar_url}
                        accentColor={prof?.accent_color}
                        presence={isOnline(req.addressee_id) ? 'online' : 'offline'}
                        secondary={`Awaiting their reply · sent ${formatRelative(req.created_at)}`}
                        actions={
                          // Withdrawing is the same operation as unfriending:
                          // it deletes the row either way.
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void removeFriend(req.addressee_id)}
                          >
                            <XIcon size={15} />
                            Cancel
                          </Button>
                        }
                      />
                    )
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {/* BLOCKED TAB */}
        {tab === 'blocked' && (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Blocked Users — {blockedUsers.length}</div>

            {blockedUsers.length === 0 && (
              <div className={styles.empty}>
                <BanIcon size={32} />
                <p>You haven't blocked any users.</p>
              </div>
            )}

            {blockedUsers.length > 0 && (
              <div className={styles.list}>
                {blockedUsers.map((blockedId) => {
                  const prof = lookup(blockedId)
                  return (
                    <UserRow
                      key={blockedId}
                      name={prof?.display_name ?? blockedId}
                      avatarUrl={prof?.avatar_url}
                      accentColor={prof?.accent_color}
                      secondary={`@${prof?.handle ?? blockedId.slice(0, 8)}`}
                      actions={
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void unblockUser(blockedId)}
                        >
                          Unblock
                        </Button>
                      }
                    />
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* ADD FRIEND TAB */}
        {tab === 'add' && (
          <div className={styles.addCard}>
            <div className={styles.addHeader}>
              <h2 className={styles.addTitle}>ADD FRIEND</h2>
              <p className={styles.addDescription}>
                You can add friends using their unique genzh User ID.
              </p>
            </div>

            {error && <Callout tone="danger">{error}</Callout>}

            <form onSubmit={addFriendForm.handleSubmit(sendRequest)}>
              <div className={styles.addInputWrap}>
                <input
                  type="text"
                  className={styles.addInput}
                  {...addFriendForm.register('userId', { required: true })}
                  placeholder="Paste user ID (e.g. 6f1c7d2e-...)"
                  spellCheck={false}
                  required
                />
                <Button
                  type="submit"
                  disabled={busy}
                  style={{ background: '#23a55a', color: '#ffffff' }}
                >
                  {busy && <Spinner />}
                  Send Friend Request
                </Button>
              </div>
            </form>

            {user && (
              <div className={styles.myIdCard}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Your User ID
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600 }}>
                    {user.id}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={copyMyId}>
                  <CopyIcon size={14} />
                  Copy My ID
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedUserId && (
        <ProfileDialog
          open={profileDialogOpen}
          onOpenChange={setProfileDialogOpen}
          targetUserId={selectedUserId}
        />
      )}
    </div>
  )
}
