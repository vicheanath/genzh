import { Popover } from '@base-ui/react/popover'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  ArrowDownIcon,
  CopyIcon,
  LockIcon,
  MoreIcon,
  PencilIcon,
  SendIcon,
  SmileIcon,
  TrashIcon,
  UsersIcon,
} from '@/components/Icons'
import { Menu, MenuItem, MenuSeparator } from '@/components/Menu'
import { Skeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { Tooltip } from '@/components/Tooltip'
import {
  ApiError,
  messages as messagesApi,
  type Message,
  type PublicProfile,
  type ReactionSummary,
  type RoomWithPermissions,
  type Uuid,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
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
import { mergeMessages, useMessageHistory } from '@/features/chat/useMessageHistory'
import { chatSocket, type ChatServerEvent } from '@/lib/ws/ChatSocket'
import styles from './Chat.module.css'

/** Offered in the hover bar without opening the picker. */
const QUICK_REACTIONS = ['👍', '❤️', '😂']

/** The picker's full set. Small on purpose: a searchable thousand-emoji grid is
 *  a different feature, and these cover what a room actually reaches for. */
const EMOJI = [
  '👍', '👎', '❤️', '🔥', '😂', '🥲', '😮', '😢',
  '🎉', '👀', '🙏', '💯', '✅', '❌', '🤔', '🤝',
  '😎', '🫡', '🧠', '⚡', '🌙', '☕', '🍕', '🎧',
]

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
  const { getToken, user } = useAuth()
  const toast = useToast()

  const {
    items,
    setItems,
    loading,
    loadingOlder,
    hasMore,
    error,
    loadOlder,
    prependedAt,
  } = useMessageHistory(room.id)

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

  // ── WebSocket Real-Time Subscription & Initial Load ─────────────────────────

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const token = await getToken()
      if (cancelled) return
      chatSocket.setToken(token)
      chatSocket.subscribe(room.id)
    })()

    // Real-time WebSocket event listeners
    const unsubs = [
      chatSocket.on<ChatServerEvent>('message_created', (event) => {
        if (event.type === 'message_created' && event.room_id === room.id) {
          const fullMessage: Message = {
            ...event.message,
            reactions: event.reactions ?? [],
            anonymous_author: event.anonymous_author,
          }
          setItems((current) => mergeMessages(current, [fullMessage]))
        }
      }),
      chatSocket.on<ChatServerEvent>('message_updated', (event) => {
        if (event.type === 'message_updated' && event.room_id === room.id) {
          setItems((current) =>
            current.map((m) =>
              m.id === event.message.id
                ? {
                    ...event.message,
                    reactions: event.reactions ?? m.reactions,
                    anonymous_author: event.anonymous_author ?? m.anonymous_author,
                  }
                : m,
            ),
          )
        }
      }),
      chatSocket.on<ChatServerEvent>('message_deleted', (event) => {
        if (event.type === 'message_deleted' && event.room_id === room.id) {
          setItems((current) => current.filter((m) => m.id !== event.message_id))
        }
      }),
      chatSocket.on<ChatServerEvent>('reactions_updated', (event) => {
        if (event.type === 'reactions_updated' && event.room_id === room.id) {
          setItems((current) =>
            current.map((m) => {
              if (m.id !== event.message_id) return m
              const myExistingReactions = new Set(
                m.reactions.filter((r) => r.me).map((r) => r.reaction),
              )
              const updatedReactions = (event.reactions ?? []).map((r) => ({
                ...r,
                me: myExistingReactions.has(r.reaction),
              }))
              return { ...m, reactions: updatedReactions }
            }),
          )
        }
      }),
      chatSocket.on<ChatServerEvent>('typing', (event) => {
        if (event.type === 'typing' && event.room_id === room.id && event.user_id !== user?.id) {
          setTypingUsers((prev) => {
            const next = new Map(prev)
            if (event.is_typing) {
              next.set(event.user_id, event.display_name)
            } else {
              next.delete(event.user_id)
            }
            return next
          })
        }
      }),
    ]

    return () => {
      cancelled = true
      chatSocket.unsubscribe(room.id)
      for (const unsub of unsubs) unsub()
    }
  }, [getToken, room.id, user?.id, setItems])

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
  const notifyTyping = useCallback(() => {
    chatSocket.sendTyping(room.id, true)
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current)
    }
    typingTimerRef.current = window.setTimeout(() => {
      chatSocket.sendTyping(room.id, false)
      typingTimerRef.current = null
    }, 2500)
  }, [room.id])

  const send = useCallback(
    async (content: string) => {
      chatSocket.sendTyping(room.id, false)
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
        const posted = await messagesApi.post(await getToken(), room.id, content, isAnonymousPersona)
        setPending((current) => current.filter((item) => item.localId !== localId))
        setItems((current) => mergeMessages(current, [posted]))
      } catch (cause) {
        setPending((current) =>
          current.map((item) => (item.localId === localId ? { ...item, failed: true } : item)),
        )
        toast.error(
          'Message not sent',
          cause instanceof ApiError ? cause.message : undefined,
        )
      }
    },
    [getToken, room.id, isAnonymousPersona, toast, setItems],
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
      // Optimistic: a reaction that waits for a round trip feels broken, and the
      // server's tally overwrites this a moment later either way.
      setItems((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, reactions: applyLocally(message.reactions, emoji, !active) }
            : message,
        ),
      )

      try {
        const token = await getToken()
        const reactions = active
          ? await messagesApi.unreact(token, messageId, emoji)
          : await messagesApi.react(token, messageId, emoji)
        setItems((current) =>
          current.map((message) =>
            message.id === messageId ? { ...message, reactions } : message,
          ),
        )
      } catch (cause) {
        // Put the optimistic change back.
        setItems((current) =>
          current.map((message) =>
            message.id === messageId
              ? { ...message, reactions: applyLocally(message.reactions, emoji, active) }
              : message,
          ),
        )
        toast.error(
          'Could not react',
          cause instanceof ApiError ? cause.message : undefined,
        )
      }
    },
    [getToken, toast, setItems],
  )

  const editMessage = useCallback(
    async (messageId: Uuid, content: string) => {
      try {
        const updated = await messagesApi.edit(await getToken(), messageId, content)
        setItems((current) =>
          current.map((message) =>
            // The edit response has no reactions of its own, so the ones already
            // on screen are carried across rather than blanked.
            message.id === messageId
              ? { ...updated, reactions: message.reactions }
              : message,
          ),
        )
      } catch (cause) {
        toast.error(
          'Could not edit',
          cause instanceof ApiError ? cause.message : undefined,
        )
      }
    },
    [getToken, toast, setItems],
  )

  const deleteMessage = useCallback(
    async (messageId: Uuid) => {
      const removed = items.find((message) => message.id === messageId)
      setItems((current) => current.filter((message) => message.id !== messageId))
      try {
        await messagesApi.remove(await getToken(), messageId)
        toast.success('Message deleted')
      } catch (cause) {
        if (removed) setItems((current) => mergeMessages(current, [removed]))
        toast.error(
          'Could not delete',
          cause instanceof ApiError ? cause.message : undefined,
        )
      }
    },
    [getToken, items, toast, setItems],
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
          roomName={room.name}
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

// ── the composer ───────────────────────────────────────────────────────────

function Composer({
  roomName,
  onSend,
  onTyping,
  isAnonymous,
  onTogglePersona,
  anonAlias,
  publicName,
}: {
  roomName: string
  onSend: (content: string) => Promise<void>
  onTyping?: () => void
  isAnonymous?: boolean
  onTogglePersona?: (isAnon: boolean) => void
  anonAlias?: string
  publicName: string
}) {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow with the content up to a ceiling. Resetting to `auto` first is what
  // makes it shrink again when a line is deleted.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }, [draft])

  function submit() {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    void onSend(content)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line — the convention everywhere, and
    // the reason the control is a textarea rather than an input.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className={styles.personaBanner}>
        <span className={styles.personaLabel}>Appear as:</span>
        <button
          type="button"
          className={cx(styles.personaChip, isAnonymous && styles.personaChipActive)}
          onClick={() => onTogglePersona?.(true)}
          title="Post anonymously with masked identity"
        >
          <LockIcon size={12} />
          <span>{anonAlias ?? 'Anonymous'}</span>
        </button>
        <button
          type="button"
          className={cx(styles.personaChip, !isAnonymous && styles.personaChipActive)}
          onClick={() => onTogglePersona?.(false)}
          title="Post with your public account profile"
        >
          <UsersIcon size={12} />
          <span>{publicName}</span>
        </button>
      </div>

      <div className={styles.composerField}>
        <textarea
          ref={textareaRef}
          className={styles.composerInput}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            onTyping?.()
          }}
          onKeyDown={onKeyDown}
          placeholder={`Message #${roomName}`}
          aria-label={`Message ${roomName}`}
          rows={1}
          maxLength={4000}
        />
        <Button
          type="submit"
          size="sm"
          iconOnly
          round
          disabled={!draft.trim()}
          aria-label="Send message"
          className={styles.sendButton}
        >
          <SendIcon size={16} />
        </Button>
      </div>
      <p className={styles.composerHint}>
        <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
      </p>
    </form>
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

  return (
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
            <MenuItem
              icon={<CopyIcon size={15} />}
              onClick={() => {
                void navigator.clipboard?.writeText(message.content)
                toast.success('Copied to clipboard')
              }}
            >
              Copy text
            </MenuItem>

            {isOwn && (
              <MenuItem
                icon={<PencilIcon size={15} />}
                onClick={() => {
                  setDraft(message.content)
                  setEditing(true)
                }}
              >
                Edit
              </MenuItem>
            )}

            {canDelete && (
              <>
                <MenuSeparator />
                <MenuItem
                  tone="danger"
                  icon={<TrashIcon size={15} />}
                  onClick={() => onDelete(message.id)}
                >
                  Delete
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      )}
    </article>
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

function EmojiPicker({
  trigger,
  onPick,
}: {
  trigger: React.ReactElement
  onPick: (emoji: string) => void
}) {
  return (
    <Popover.Root>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" className={styles.pickerPositioner}>
          <Popover.Popup className={styles.picker}>
            <Popover.Title className={styles.pickerTitle}>Add a reaction</Popover.Title>
            <div className={styles.pickerGrid}>
              {EMOJI.map((emoji) => (
                <Popover.Close
                  key={emoji}
                  className={styles.pickerButton}
                  onClick={() => onPick(emoji)}
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </Popover.Close>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <div className={styles.divider}>
      <span className={styles.dividerLabel}>{formatDayDivider(iso)}</span>
    </div>
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
/**
 * A mention, matching the server's parser in `genzh_domain::mention`.
 *
 * The two have to agree: the server decides who gets notified, and a client
 * that highlighted a different set of words would show mentions nobody was
 * told about — or fail to show one that did notify someone. `(^|[^\w.])`
 * enforces the same "must begin a word" rule that keeps `a@b.com` from being a
 * mention, and the trailing `[^.]` stops a sentence-final dot being captured.
 */
const MENTION = /(^|[^\w.])@([a-z0-9_.]*[a-z0-9_])/gi

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
function applyLocally(
  reactions: ReactionSummary[],
  emoji: string,
  add: boolean,
): ReactionSummary[] {
  const existing = reactions.find((reaction) => reaction.reaction === emoji)

  if (!existing) {
    return add ? [...reactions, { reaction: emoji, count: 1, me: true }] : reactions
  }

  const count = existing.count + (add ? 1 : -1)
  if (count <= 0) return reactions.filter((reaction) => reaction.reaction !== emoji)

  return reactions.map((reaction) =>
    reaction.reaction === emoji ? { ...reaction, count, me: add } : reaction,
  )
}
