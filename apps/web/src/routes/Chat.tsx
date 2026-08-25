import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  ArrowDownIcon,
  CopyIcon,
  MoreIcon,
  PencilIcon,
  SmileIcon,
  TrashIcon,
} from '@/components/Icons'
import { Menu, MenuItem, MenuSeparator } from '@/components/Menu'
import { Skeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { Tooltip } from '@/components/Tooltip'
import { Separator } from '@/components/Separator'
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ContextMenu'
import {
  ApiError,
  type Message,
  type PublicProfile,
  type ReactionSummary,
  type RoomWithPermissions,
  type Uuid,
} from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

import {
  applyLocalReaction,
  applyMessageCreated,
  applyMessageDeleted,
  applyMessageUpdated,
  useDeleteMessageMutation,
  useEditMessageMutation,
  useReactionMutation,
  useRoomMessagesInfinite,
  useSendMessageMutation,
} from '@/features/api'
import { useRoomSubscription, useRoomTyping, useSocketEvent } from '@/features/realtime'
import { useAuth } from '@/lib/auth'
import { errorText } from '@/lib/errors'
import { cx } from '@/lib/cx'
import { can } from '@/lib/permissions'
import {
  formatClock,
  formatDayDivider,
  formatFull,
  isNewDay,
  withinGroupingWindow,
} from '@/lib/time'
import { useProfiles } from '@/lib/useProfiles'

import { ProfileDialog } from './ProfileDialog'
import { useAppStore } from '@/lib/store'
import { Composer } from '@/features/chat/Composer'
import { MENTION } from '@/features/chat/mentions'
import { QUICK_REACTIONS } from '@/features/chat/emoji'
import { EmojiPicker } from '@/features/chat/EmojiPicker'
import styles from './Chat.module.css'

/**
 * Shortest gap between two "typing" frames for one room.
 *
 * Matches `TYPING_INTERVAL` in `apps/api/src/routes/ws.rs`, which drops
 * anything faster: sending frames the server is going to throw away is just
 * traffic.
 */
const TYPING_INTERVAL_MS = 1000

/** A message the user has sent that the server has not confirmed yet. */
interface PendingMessage {
  localId: string
  content: string
  createdAt: string
  failed: boolean
}

export function Chat({
  room,
  isAnonymousPersona = false,
  onTogglePersona,
}: {
  room: RoomWithPermissions
  isAnonymousPersona?: boolean
  onTogglePersona?: (isAnon: boolean) => void
}) {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const transcript = useRoomMessagesInfinite(room.id)
  const items = transcript.data?.items ?? []
  const loading = transcript.isLoading
  const loadingOlder = transcript.isFetchingNextPage
  const hasMore = transcript.hasNextPage
  const error = transcript.error ? errorText(transcript.error, 'Could not load messages') : null
  const loadOlder = transcript.fetchNextPage
  // One prepend per page beyond the first. A count rather than a flag: two
  // pages in a row must both re-anchor the scroll, and a boolean would coalesce.
  const prependedAt = Math.max(0, (transcript.data?.pages.length ?? 1) - 1)

  const sendMessage = useSendMessageMutation(room.id)
  const editMessageMutation = useEditMessageMutation()
  const deleteMessageMutation = useDeleteMessageMutation()
  const reactionMutation = useReactionMutation()
  const sendTyping = useRoomTyping(room.id)

  const [pending, setPending] = useState<PendingMessage[]>([])
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())

  const [atBottom, setAtBottom] = useState(true)
  const [unseen, setUnseen] = useState(0)

  const [profileUserId, setProfileUserId] = useState<Uuid | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  // Tracks which prepend the unseen counter has already accounted for.
  const prependedAtRef = useRef(0)

  const canSend = can(room.your_permissions, 'send_message')
  const canReact = can(room.your_permissions, 'add_reaction')
  const canModerate = can(room.your_permissions, 'manage_room')

  const lookup = useProfiles([...new Set(items.map((message) => message.author_id))])

  // ── realtime ─────────────────────────────────────────────────────────────

  // The transcript itself is kept current by the cache bridge, which writes
  // every message frame into the same query this screen reads. All that is
  // left here is the subscription, and the two frames that are about the view
  // rather than about the room's state.
  useRoomSubscription(room.id)

  useSocketEvent('typing', (event) => {
    if (event.room_id !== room.id || event.user_id === user?.id) return
    setTypingUsers((current) => {
      const next = new Map(current)
      if (event.is_typing) {
        next.set(event.user_id, event.display_name)
      } else {
        next.delete(event.user_id)
      }
      return next
    })
  })

  // A command the server refused — a message posted straight down the socket by
  // one of the room experiences, usually, since those never touch the REST
  // endpoint and so have no other way to fail visibly. Without this the message
  // simply never appears and nobody is told why.
  useSocketEvent('error', (event) => {
    toast.error('Not sent', event.message)
  })

  // ── scroll tracking ──────────────────────────────────────────────────────

  // Height of the list just before older rows were prepended. Captured on the
  // way in so the layout effect below can restore the reader's position.
  const heightBeforePrepend = useRef(0)

  const requestOlder = useCallback(() => {
    const list = listRef.current
    heightBeforePrepend.current = list?.scrollHeight ?? 0
    void loadOlder()
  }, [loadOlder])

  const handleScroll = useCallback(() => {
    const list = listRef.current
    if (!list) return

    const distanceToBottom = list.scrollHeight - list.scrollTop - list.clientHeight
    const isNowAtBottom = distanceToBottom < 32
    atBottomRef.current = isNowAtBottom
    setAtBottom(isNowAtBottom)

    if (isNowAtBottom) {
      setUnseen(0)
    }

    // A margin rather than the exact top: fetching just before the reader
    // arrives is what makes the history feel continuous instead of stalling.
    if (list.scrollTop < 200 && hasMore) {
      requestOlder()
    }
  }, [requestOlder, hasMore])

  const scrollToBottom = useCallback((smooth = true) => {
    const list = listRef.current
    if (!list) return
    list.scrollTo({
      top: list.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    })
    setAtBottom(true)
    setUnseen(0)
  }, [])

  // Hold the reader's place when older rows appear above them.
  //
  // A layout effect, not a `requestAnimationFrame`: this has to run between
  // React committing the new rows and the browser painting. In a rAF the frame
  // is already on screen, so the transcript visibly lurches before snapping
  // back — which is what made scrolling up feel broken.
  useLayoutEffect(() => {
    if (prependedAt === 0) return
    const list = listRef.current
    if (!list) return
    list.scrollTop += list.scrollHeight - heightBeforePrepend.current
  }, [prependedAt])

  /** Set once the opening placement has run, for this room. */
  const placed = useRef(false)
  const lastCount = useRef(0)

  // Open at the bottom, without travelling there.
  //
  // The first page renders and is placed in the same commit, before the browser
  // paints, so the newest message is simply where the room starts — there is no
  // frame showing the top and no scroll for the reader to watch. Everything
  // above is reached by scrolling up, which is what fetches it.
  useLayoutEffect(() => {
    if (placed.current || loading || items.length === 0) return
    const list = listRef.current
    if (!list) return

    list.scrollTop = list.scrollHeight
    placed.current = true
    lastCount.current = items.length + pending.length
  }, [loading, items.length, pending.length])

  // Stick to the bottom as messages arrive — but only for a reader who is
  // already there. Yanking someone out of history to show a new message is the
  // single most irritating thing a chat client can do.
  useLayoutEffect(() => {
    // The opening placement above owns the first paint; counting it here as
    // growth would double-handle it.
    if (!placed.current) return

    const count = items.length + pending.length
    const grew = count > lastCount.current
    lastCount.current = count
    if (!grew) return

    if (atBottomRef.current) {
      const list = listRef.current
      if (list) list.scrollTop = list.scrollHeight
      return
    }

    // Older pages are not new activity. Counting them made scrolling back
    // through history inflate the "new messages" badge with messages the
    // reader had deliberately gone looking for.
    if (prependedAtRef.current === prependedAt) {
      setUnseen((current) => current + 1)
    }
    prependedAtRef.current = prependedAt
  }, [items.length, pending.length, prependedAt])

  const typingTimerRef = useRef<number | null>(null)
  const typingSentAtRef = useRef(0)

  /**
   * Tell the room somebody is typing — at most once a second.
   *
   * This fires on every keystroke, and every call used to be a frame on the
   * wire that the server fanned out to everyone in the room: a sentence typed
   * at speed was forty broadcasts saying the same thing. The indicator only
   * has two states and lives for 2.5s, so one frame a second says all of it.
   * The server enforces the same interval — this is politeness, not the
   * defence.
   */
  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (now - typingSentAtRef.current >= TYPING_INTERVAL_MS) {
      typingSentAtRef.current = now
      sendTyping(true)
    }

    // The stop is always rescheduled, so it lands 2.5s after the *last*
    // keystroke rather than 2.5s after the last frame that was sent.
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current)
    }
    typingTimerRef.current = window.setTimeout(() => {
      typingSentAtRef.current = 0
      sendTyping(false)
      typingTimerRef.current = null
    }, 2500)
  }, [sendTyping])

  const send = useCallback(
    async (content: string) => {
      sendTyping(false)
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current)
        typingTimerRef.current = null
      }

      const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`
      setPending((current) => [
        ...current,
        { localId, content, createdAt: new Date().toISOString(), failed: false },
      ])

      try {
        const posted = await sendMessage.mutateAsync({
          content,
          is_anonymous: isAnonymousPersona,
        })
        setPending((current) => current.filter((item) => item.localId !== localId))
        // The socket echoes this back too, and the write is idempotent — but
        // placing it now means the sender's own message does not wait on a
        // round trip through the server's broadcast to appear.
        applyMessageCreated(queryClient, room.id, posted)
      } catch (cause) {
        setPending((current) =>
          current.map((item) => (item.localId === localId ? { ...item, failed: true } : item)),
        )
        // A throttled send is not a failure the user should read as breakage —
        // it is the room asking them to slow down, and the one thing that
        // makes it actionable is how long for.
        const throttled = cause instanceof ApiError && cause.isThrottled
        toast.error(
          throttled ? 'Slow down' : 'Message not sent',
          throttled && cause.retryAfterSeconds
            ? `${cause.message} — try again in ${cause.retryAfterSeconds}s`
            : errorText(cause, 'Message not sent'),
        )
      }
    },
    [sendMessage, sendTyping, queryClient, room.id, isAnonymousPersona, toast],
  )

  const retry = useCallback(
    (localId: string) => {
      const entry = pending.find((item) => item.localId === localId)
      if (!entry) return
      setPending((current) => current.filter((item) => item.localId !== localId))
      void send(entry.content)
    },
    [pending, send],
  )

  const discard = useCallback((localId: string) => {
    setPending((current) => current.filter((item) => item.localId !== localId))
  }, [])

  // ── message actions ──────────────────────────────────────────────────────

  const toggleReaction = useCallback(
    async (messageId: Uuid, emoji: string, active: boolean) => {
      applyLocalReaction(queryClient, room.id, messageId, emoji, !active)

      try {
        await reactionMutation.mutateAsync({
          messageId,
          reaction: emoji,
          action: active ? 'remove' : 'add',
        })
      } catch (cause) {
        // Put the optimistic change back.
        applyLocalReaction(queryClient, room.id, messageId, emoji, active)
        toast.error('Could not react', errorText(cause))
      }
    },
    [reactionMutation, queryClient, room.id, toast],
  )

  const editMessage = useCallback(
    async (messageId: Uuid, content: string) => {
      try {
        const updated = await editMessageMutation.mutateAsync({
          messageId,
          payload: { content },
        })
        // The edit response has no reactions of its own; the cache write keeps
        // the ones already on screen rather than blanking them.
        applyMessageUpdated(queryClient, room.id, updated)
      } catch (cause) {
        toast.error('Could not edit', errorText(cause))
      }
    },
    [editMessageMutation, queryClient, room.id, toast],
  )

  const deleteMessage = useCallback(
    async (messageId: Uuid) => {
      const removed = applyMessageDeleted(queryClient, room.id, messageId)
      try {
        await deleteMessageMutation.mutateAsync(messageId)
        toast.success('Message deleted')
      } catch (cause) {
        // Put it back where it was.
        if (removed) applyMessageCreated(queryClient, room.id, removed)
        toast.error('Could not delete', errorText(cause))
      }
    },
    [deleteMessageMutation, queryClient, room.id, toast],
  )

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div className={styles.list} ref={listRef} onScroll={handleScroll}>
        {loadingOlder && (
          <div className={styles.loadingOlder}>
            <Spinner />
            Loading older messages
          </div>
        )}

        {!loading && !hasMore && items.length > 0 && (
          <RoomIntro name={room.name} topic={room.topic} />
        )}

        {loading && <MessageSkeletons />}

        {!loading && items.length === 0 && pending.length === 0 && !error && (
          <RoomIntro name={room.name} topic={room.topic} empty />
        )}

        {error && items.length === 0 && (
          <div className={styles.listError}>
            <Callout tone="danger">{error}</Callout>
          </div>
        )}

        {items.map((message, index) => {
          const previous = items[index - 1]
          const startsNewDay = !previous || isNewDay(previous.created_at, message.created_at)
          const grouped =
            !startsNewDay &&
            previous?.author_id === message.author_id &&
            withinGroupingWindow(previous.created_at, message.created_at)

          return (
            <div key={message.id}>
              {startsNewDay && <DayDivider iso={message.created_at} />}
              <MessageRow
                message={message}
                author={lookup(message.author_id)}
                grouped={grouped}
                isOwn={message.author_id === user?.id}
                canReact={canReact}
                canDelete={message.author_id === user?.id || canModerate}
                onToggleReaction={toggleReaction}
                onEdit={editMessage}
                onDelete={deleteMessage}
                onOpenProfile={(id) => {
                  setProfileUserId(id)
                  setProfileOpen(true)
                }}
              />
            </div>
          )
        })}

        {pending.map((entry) => (
          <PendingRow
            key={entry.localId}
            entry={entry}
            name={user?.profile.display_name ?? 'You'}
            avatar={user?.profile.avatar_url}
            accent={user?.profile.accent_color}
            onRetry={() => retry(entry.localId)}
            onDiscard={() => discard(entry.localId)}
          />
        ))}
      </div>

      {/* Only offered when it is actually needed — a permanent button would be
          one more thing on screen doing nothing 95% of the time. */}
      {!atBottom && (
        <button className={styles.jump} onClick={() => scrollToBottom()} type="button">
          <ArrowDownIcon size={15} />
          {unseen > 0 ? `${unseen} new message${unseen === 1 ? '' : 's'}` : 'Jump to latest'}
        </button>
      )}

      {/* Real-time Typing Indicator */}
      {typingUsers.size > 0 && (
        <div className={styles.typingIndicator}>
          <span className={styles.typingDots}>
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
          </span>
          <span>
            <strong>{Array.from(typingUsers.values()).slice(0, 3).join(', ')}</strong>
            {typingUsers.size > 3 ? ` and ${typingUsers.size - 3} others` : ''}{' '}
            {typingUsers.size === 1 ? 'is typing...' : 'are typing...'}
          </span>
        </div>
      )}

      {canSend ? (
        <Composer
          room={room}
          onSend={send}
          onTyping={notifyTyping}
          isAnonymous={isAnonymousPersona}
          onTogglePersona={onTogglePersona}
          anonAlias={room.anonymous_identity?.alias_name || useAppStore.getState().anonymousAlias || 'Anonymous'}
          publicName={user?.profile.display_name ?? 'You'}
        />
      ) : (
        <p className={styles.readOnly}>You do not have permission to post in this room.</p>
      )}

      {profileUserId && (
        <ProfileDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          targetUserId={profileUserId}
        />
      )}
    </>
  )
}

// ── one message ────────────────────────────────────────────────────────────

interface MessageRowProps {
  message: Message
  author: PublicProfile | null
  grouped: boolean
  isOwn: boolean
  canReact: boolean
  canDelete: boolean
  onToggleReaction: (id: Uuid, emoji: string, active: boolean) => void
  onEdit: (id: Uuid, content: string) => void
  onDelete: (id: Uuid) => void
  onOpenProfile?: (id: Uuid) => void
}

function MessageRow({
  message,
  author,
  grouped,
  isOwn,
  canReact,
  canDelete,
  onToggleReaction,
  onEdit,
  onDelete,
  onOpenProfile,
}: MessageRowProps) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const isAnonymous = Boolean(message.anonymous_author)
  const name = message.anonymous_author
    ? message.anonymous_author.alias_name
    : (author?.display_name ?? 'Unknown')
  const avatarColor = message.anonymous_author
    ? message.anonymous_author.accent_color
    : author?.accent_color
  const avatarUrl = message.anonymous_author ? undefined : author?.avatar_url

  function commitEdit() {
    const content = draft.trim()
    setEditing(false)
    if (content && content !== message.content) onEdit(message.id, content)
  }

  function copyText() {
    void navigator.clipboard?.writeText(message.content)
    toast.success('Copied to clipboard')
  }

  function beginEdit() {
    setDraft(message.content)
    setEditing(true)
  }

  return (
    /* The same actions on right-click as in the hover menu. The hover bar is
       pointer-only — it appears on `:hover` — so without this there is no way
       to reach delete or edit from a touchscreen except the overflow button,
       and long-press is what people already try. */
    <ContextMenu
      items={messageActions({
        Item: ContextMenuItem,
        Separator: ContextMenuSeparator,
        isOwn,
        canDelete,
        onCopy: copyText,
        onEdit: beginEdit,
        onDelete: () => onDelete(message.id),
      })}
    >
      <article className={cx(styles.message, grouped && styles.grouped)}>
        {grouped ? (
          // The timestamp takes the avatar's place in a grouped row, appearing on
          // hover. It keeps the text column aligned without repeating the header.
          <time className={styles.gutterTime} dateTime={message.created_at}>
            {formatClock(message.created_at)}
          </time>
        ) : (
          <div
            style={{ cursor: isAnonymous ? 'default' : 'pointer' }}
            onClick={() => {
              if (!isAnonymous) onOpenProfile?.(message.author_id)
            }}
          >
            <Avatar
              name={name}
              src={avatarUrl}
              color={avatarColor}
              size="md"
              className={styles.messageAvatar}
            />
          </div>
        )}

        <div className={styles.messageBody}>
          {!grouped && (
            <div className={styles.messageHeader}>
              <span
                className={styles.author}
                style={{ cursor: isAnonymous ? 'default' : 'pointer', color: avatarColor ?? undefined }}
                onClick={() => {
                  if (!isAnonymous) onOpenProfile?.(message.author_id)
                }}
              >
                {name}
              </span>
              {isOwn && <span className={styles.youTag}>you</span>}
              <time
                className={styles.time}
                dateTime={message.created_at}
                title={formatFull(message.created_at)}
              >
                {formatClock(message.created_at)}
              </time>
            </div>
          )}

          {editing ? (
            <div className={styles.editBox}>
              <textarea
                className={styles.editInput}
                value={draft}
                autoFocus
                rows={2}
                maxLength={4000}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    commitEdit()
                  }
                  if (event.key === 'Escape') {
                    setDraft(message.content)
                    setEditing(false)
                  }
                }}
              />
              <div className={styles.editActions}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(message.content)
                    setEditing(false)
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={commitEdit}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className={styles.content}>
              <Linkified text={message.content} />
              {message.edited_at && (
                <span className={styles.edited} title={formatFull(message.edited_at)}>
                  {' '}
                  (edited)
                </span>
              )}
            </p>
          )}

          {message.reactions.length > 0 && (
            <div className={styles.reactions}>
              {message.reactions.map((reaction) => (
                <ReactionChip
                  key={reaction.reaction}
                  reaction={reaction}
                  disabled={!canReact && !reaction.me}
                  onClick={() =>
                    onToggleReaction(message.id, reaction.reaction, reaction.me)
                  }
                />
              ))}
              {canReact && (
                <EmojiPicker
                  title="Add a reaction"
                  verb="React with"
                  align="end"
                  onPick={(emoji) => onToggleReaction(message.id, emoji, false)}
                  trigger={
                    <button type="button" className={styles.addReaction} aria-label="Add a reaction">
                      <SmileIcon size={14} />
                    </button>
                  }
                />
              )}
            </div>
          )}
        </div>

        {!editing && (
          <div className={styles.actions}>
            {canReact &&
              QUICK_REACTIONS.map((emoji) => (
                <Tooltip key={emoji} content={`React ${emoji}`}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() =>
                      onToggleReaction(
                        message.id,
                        emoji,
                        message.reactions.some((r) => r.reaction === emoji && r.me),
                      )
                    }
                    aria-label={`React with ${emoji}`}
                  >
                    <span className={styles.actionEmoji}>{emoji}</span>
                  </button>
                </Tooltip>
              ))}

            {canReact && (
              <EmojiPicker
                title="Add a reaction"
                verb="React with"
                align="end"
                onPick={(emoji) => onToggleReaction(message.id, emoji, false)}
                trigger={
                  <button type="button" className={styles.actionButton} aria-label="Add a reaction">
                    <SmileIcon size={15} />
                  </button>
                }
              />
            )}

            <Menu
              align="end"
              trigger={
                <button type="button" className={styles.actionButton} aria-label="More actions">
                  <MoreIcon size={15} />
                </button>
              }
            >
              {messageActions({
                Item: MenuItem,
                Separator: MenuSeparator,
                isOwn,
                canDelete,
                onCopy: copyText,
                onEdit: beginEdit,
                onDelete: () => onDelete(message.id),
              })}
            </Menu>
          </div>
        )}
      </article>
    </ContextMenu>
  )
}

/**
 * The actions a message offers, built once for both menus that show them.
 *
 * Parameterised by the item components rather than duplicated: `MenuItem` and
 * `ContextMenuItem` take the same props, and writing the list twice is how the
 * hover menu and the right-click menu end up offering different things.
 */
function messageActions({
  Item,
  Separator,
  isOwn,
  canDelete,
  onCopy,
  onEdit,
  onDelete,
}: {
  Item: typeof MenuItem | typeof ContextMenuItem
  Separator: typeof MenuSeparator | typeof ContextMenuSeparator
  isOwn: boolean
  canDelete: boolean
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <>
      <Item icon={<CopyIcon size={15} />} onClick={onCopy}>
        Copy text
      </Item>

      {isOwn && (
        <Item icon={<PencilIcon size={15} />} onClick={onEdit}>
          Edit
        </Item>
      )}

      {canDelete && (
        <>
          <Separator />
          <Item tone="danger" icon={<TrashIcon size={15} />} onClick={onDelete}>
            Delete
          </Item>
        </>
      )}
    </>
  )
}

function PendingRow({
  entry,
  name,
  avatar,
  accent,
  onRetry,
  onDiscard,
}: {
  entry: PendingMessage
  name: string
  avatar?: string | null
  accent?: string | null
  onRetry: () => void
  onDiscard: () => void
}) {
  return (
    <article className={cx(styles.message, styles.pending, entry.failed && styles.failed)}>
      <Avatar name={name} src={avatar} color={accent} size="md" className={styles.messageAvatar} />
      <div className={styles.messageBody}>
        <div className={styles.messageHeader}>
          <span className={styles.author}>{name}</span>
          <span className={styles.time}>
            {entry.failed ? 'Not sent' : 'Sending…'}
          </span>
        </div>
        <p className={styles.content}>{entry.content}</p>
        {entry.failed && (
          <div className={styles.retryRow}>
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}

// ── small pieces ───────────────────────────────────────────────────────────

function ReactionChip({
  reaction,
  disabled,
  onClick,
}: {
  reaction: ReactionSummary
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cx(styles.chip, reaction.me && styles.chipMine)}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={reaction.me}
      aria-label={`${reaction.reaction}, ${reaction.count} ${
        reaction.count === 1 ? 'reaction' : 'reactions'
      }`}
    >
      <span className={styles.chipEmoji}>{reaction.reaction}</span>
      <span className={styles.chipCount}>{reaction.count}</span>
    </button>
  )
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <Separator className={styles.divider} labelVariant="chip" label={formatDayDivider(iso)} />
  )
}

function RoomIntro({
  name,
  topic,
  empty,
}: {
  name: string
  topic: string | null
  empty?: boolean
}) {
  return (
    <div className={styles.intro}>
      <div className={styles.introMark}>#</div>
      <h2 className={styles.introTitle}>Welcome to {name}</h2>
      <p className={styles.introText}>
        {topic ?? (empty ? 'Nothing here yet — say the first thing.' : 'This is the very beginning of the room.')}
      </p>
    </div>
  )
}

function MessageSkeletons() {
  return (
    <div className={styles.skeletons} role="status" aria-label="Loading messages">
      {[82, 54, 68].map((width, index) => (
        <div key={index} className={styles.skeletonRow}>
          <Skeleton circle width="2.375rem" height="2.375rem" />
          <div className={styles.skeletonLines}>
            <Skeleton width="7rem" height="0.75rem" />
            <Skeleton width={`${width}%`} height="0.85rem" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Render bare URLs in message text as links.
 *
 * Deliberately not full Markdown: links are the one thing people paste and
 * expect to work, and everything past that is a sanitising problem. Text is
 * rendered as text, so nothing here can inject markup.
 */
/** Message body with links and @mentions marked up. */
function Linkified({ text }: { text: string }) {
  const { user } = useAuth()
  const parts = text.split(/(https?:\/\/[^\s<]+)/g)

  return (
    <>
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            // noreferrer implies noopener, and both matter: without them the
            // opened page gets a handle on this one through window.opener.
            rel="noopener noreferrer"
            className={styles.link}
          >
            {part}
          </a>
        ) : (
          <Mentioned key={index} text={part} handle={user?.handle} />
        ),
      )}
    </>
  )
}

/**
 * Marks up `@handle` runs inside one plain-text span.
 *
 * A mention of *you* is styled differently from a mention of someone else —
 * that distinction is the whole reason to highlight mentions at all.
 */
function Mentioned({ text, handle }: { text: string; handle?: string }) {
  const nodes: React.ReactNode[] = []
  let cursor = 0

  for (const match of text.matchAll(MENTION)) {
    const [whole, prefix = '', mentioned] = match
    if (!mentioned) continue
    const start = match.index ?? 0

    nodes.push(text.slice(cursor, start + prefix.length))

    const isEveryone = mentioned.toLowerCase() === 'everyone'
    const isMe = handle !== undefined && mentioned.toLowerCase() === handle.toLowerCase()

    nodes.push(
      <span
        key={`${start}-${mentioned}`}
        className={cx(styles.mention, (isMe || isEveryone) && styles.mentionSelf)}
      >
        @{mentioned}
      </span>,
    )
    cursor = start + whole.length
  }

  if (cursor === 0) return <>{text}</>
  nodes.push(text.slice(cursor))
  return <>{nodes}</>
}

// ── helpers ────────────────────────────────────────────────────────────────


/** Apply a reaction toggle to a tally locally, for the optimistic update. */

