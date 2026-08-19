import { useCallback, useState, type FormEvent } from 'react'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { CheckIcon, UserPlusIcon, UsersIcon, XIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Menu, MenuItem } from '@/components/Menu'
import { MoreIcon, ShieldIcon, TrashIcon } from '@/components/Icons'
import { Skeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import {
  ApiError,
  blocks as blocksApi,
  friends as friendsApi,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'
import { formatRelative } from '@/lib/time'
import { useProfiles } from '@/lib/useProfiles'

import styles from './FriendsRoute.module.css'

/**
 * Friends and friend requests.
 *
 * The API deals in ids on both lists, so names come from the shared profile
 * cache — the same one the transcript and the member list fill.
 */
export function FriendsRoute() {
  const { getToken, user } = useAuth()
  const toast = useToast()

  const friends = useAsync(async () => friendsApi.list(await getToken()), [getToken])
  const requests = useAsync(async () => friendsApi.pending(await getToken()), [getToken])

  const [userId, setUserId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const lookup = useProfiles([
    ...(friends.data ?? []),
    ...(requests.data ?? []).map((request) => request.requester_id),
  ])

  const refresh = useCallback(() => {
    friends.reload()
    requests.reload()
  }, [friends, requests])

  async function sendRequest(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await friendsApi.request(await getToken(), userId.trim())
      setUserId('')
      toast.success('Request sent')
      refresh()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send the request')
    } finally {
      setBusy(false)
    }
  }

  async function respond(requesterId: Uuid, accept: boolean) {
    try {
      await friendsApi.respond(await getToken(), requesterId, accept)
      toast.success(accept ? 'Friend added' : 'Request declined')
      refresh()
    } catch (cause) {
      toast.error(
        'Could not respond',
        cause instanceof ApiError ? cause.message : undefined,
      )
    }
  }

  async function remove(otherId: Uuid) {
    try {
      await friendsApi.remove(await getToken(), otherId)
      toast.success('Friend removed')
      refresh()
    } catch (cause) {
      toast.error('Could not remove', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  async function block(otherId: Uuid) {
    try {
      await blocksApi.block(await getToken(), otherId)
      toast.success('Blocked', 'They can no longer reach you.')
      refresh()
    } catch (cause) {
      toast.error('Could not block', cause instanceof ApiError ? cause.message : undefined)
    }
  }

  const pendingCount = requests.data?.length ?? 0

  return (
    <div className={styles.scroll}>
      <div className={styles.page}>
        <header>
          <h1 className={styles.title}>Friends</h1>
          <p className={styles.lede}>
            People you can find across every community you share.
          </p>
        </header>

        {error && <Callout tone="danger">{error}</Callout>}

        {/* Requests lead when there are any: they are the only thing on this
            screen waiting on the reader. */}
        {pendingCount > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Requests
              <Badge tone="accent">{pendingCount}</Badge>
            </h2>

            <div className={styles.list}>
              {requests.data?.map((request) => {
                const profile = lookup(request.requester_id)
                return (
                  <div key={request.requester_id} className={styles.row}>
                    <Avatar
                      name={profile?.display_name ?? '?'}
                      src={profile?.avatar_url}
                      color={profile?.accent_color}
                      size="md"
                    />
                    <div className={styles.identity}>
                      <div className={styles.name}>
                        {profile?.display_name ?? 'Loading…'}
                      </div>
                      <div className={styles.meta}>
                        {profile && `@${profile.handle} · `}
                        asked {formatRelative(request.created_at)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void respond(request.requester_id, true)}
                    >
                      <CheckIcon size={15} />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      onClick={() => void respond(request.requester_id, false)}
                      aria-label="Decline request"
                    >
                      <XIcon size={16} />
                    </Button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            All friends
            {friends.data && <Badge>{friends.data.length}</Badge>}
          </h2>

          {friends.loading && (
            <div className={styles.list}>
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className={styles.row}>
                  <Skeleton circle width="2.375rem" height="2.375rem" />
                  <Skeleton width="40%" height="0.9rem" />
                </div>
              ))}
            </div>
          )}

          {friends.error && <Callout tone="danger">{friends.error}</Callout>}

          {!friends.loading && friends.data?.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyMark} aria-hidden>
                <UsersIcon size={22} />
              </span>
              <p>
                No friends yet. Add someone with their user id — you will find it on
                their profile.
              </p>
            </div>
          )}

          {friends.data && friends.data.length > 0 && (
            <div className={styles.list}>
              {friends.data.map((friendId) => {
                const profile = lookup(friendId)
                return (
                  <div key={friendId} className={styles.row}>
                    <Avatar
                      name={profile?.display_name ?? '?'}
                      src={profile?.avatar_url}
                      color={profile?.accent_color}
                      size="md"
                      presence="offline"
                    />
                    <div className={styles.identity}>
                      <div className={styles.name}>
                        {profile?.display_name ?? 'Loading…'}
                      </div>
                      {profile && <div className={styles.meta}>@{profile.handle}</div>}
                    </div>

                    <Menu
                      trigger={
                        <Button variant="ghost" size="sm" iconOnly aria-label="Friend actions">
                          <MoreIcon size={16} />
                        </Button>
                      }
                    >
                      <MenuItem
                        icon={<TrashIcon size={15} />}
                        onClick={() => void remove(friendId)}
                      >
                        Remove friend
                      </MenuItem>
                      <MenuItem
                        tone="danger"
                        icon={<ShieldIcon size={15} />}
                        onClick={() => void block(friendId)}
                      >
                        Block
                      </MenuItem>
                    </Menu>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <form className={styles.form} onSubmit={sendRequest}>
          <div className={styles.formHead}>
            <span className={styles.formMark} aria-hidden>
              <UserPlusIcon size={16} />
            </span>
            <div>
              <div className={styles.formTitle}>Add a friend</div>
              <p className={styles.formHint}>Paste their user id to send a request.</p>
            </div>
          </div>
          <div className={styles.formRow}>
            <Input
              className={styles.grow}
              label="User id"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="6f1c…"
              spellCheck={false}
              required
            />
            <Button type="submit" disabled={busy || !userId.trim()}>
              {busy && <Spinner />}
              Send
            </Button>
          </div>
          {user && (
            <p className={styles.formHint}>
              Yours is <code className={styles.code}>{user.id}</code>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
