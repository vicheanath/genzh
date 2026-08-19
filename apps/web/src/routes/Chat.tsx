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
  MoreIcon,
  PencilIcon,
  SendIcon,
  SmileIcon,
  TrashIcon,
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

import styles from './Chat.module.css'

/** How often chat history is re-fetched.
 *
 *  Messages have no realtime transport yet — the signalling socket carries
 *  media events only — so this polls. It is the one place in the app that does,
 *  and the interval is deliberately visible rather than buried. */
const MESSAGE_POLL_MS = 5000

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

export function Chat({ room }: { room: RoomWithPermissions }) {
  const { getToken, user } = useAuth()
  const toast = useToast()

  const [items, setItems] = useState<Message[]>([])
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [olderCursor, setOlderCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const [atBottom, setAtBottom] = useState(true)
  const [unseen, setUnseen] = useState(0)

  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  const canSend = can(room.your_permissions, 'send_message')
  const canReact = can(room.your_permissions, 'add_reaction')
  const canModerate = can(room.your_permissions, 'manage_room')

  const lookup = useProfiles([...new Set(items.map((message) => message.author_id))])

  // ── loading ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const page = await messagesApi.history(await getToken(), room.id)
        if (cancelled) return
        // The API returns newest-first; the UI reads oldest-first.
        const fresh = [...page.messages].reverse()
        setItems((current) => merge(current, fresh))
        setOlderCursor((current) => current ?? page.next_before)
        setError(null)
      } catch (cause) {
        // A transient failure must not blank the transcript, so the error is
        // only surfaced when there is nothing on screen to keep.
        if (cancelled) return
        setItems((current) => {
          if (current.length === 0) {
            setError(cause instanceof ApiError ? cause.message : 'Could not load messages')
          }
          return current
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void poll()
    const timer = setInterval(() => void poll(), MESSAGE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [getToken, room.id])

  /** Fetch the page before the oldest message currently held. */
  const loadOlder = useCallback(async () => {
    if (!olderCursor || loadingOlder) return
    setLoadingOlder(true)

    const list = listRef.current
    const anchor = list ? list.scrollHeight - list.scrollTop : 0

    try {
      const page = await messagesApi.history(await getToken(), room.id, olderCursor)
      setItems((current) => merge([...page.messages].reverse(), current))
      setOlderCursor(page.next_before)

      // Prepending grows the scroll container upward, which would otherwise
      // yank the reader to a different message. Restoring the distance from the
      // *bottom* keeps whatever they were reading exactly where it was.
      if (list) {
        requestAnimationFrame(() => {
          list.scrollTop = list.scrollHeight - anchor
        })
      }
    } catch {
      toast.error('Could not load older messages')
    } finally {
      setLoadingOlder(false)
    }
  }, [getToken, olderCursor, loadingOlder, room.id, toast])

  // ── scrolling ────────────────────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    const list = listRef.current
    if (!list) return

    // 80px of slack: a reader a line or two off the bottom still counts as
    // "following along", and should keep being pushed down.
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80
    atBottomRef.current = nearBottom
    setAtBottom(nearBottom)
    if (nearBottom) setUnseen(0)

    if (list.scrollTop < 120) void loadOlder()
  }, [loadOlder])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const list = listRef.current
    if (!list) return
    list.scrollTo({ top: list.scrollHeight, behavior })
    atBottomRef.current = true
    setAtBottom(true)
    setUnseen(0)
  }, [])

  // Stick to the bottom as messages arrive — but only for a reader who is
  // already there. Yanking someone out of history to show a new message is the
  // single most irritating thing a chat client can do.
  useLayoutEffect(() => {
    if (atBottomRef.current) {
      const list = listRef.current
      if (list) list.scrollTop = list.scrollHeight
    } else {
      setUnseen((count) => count + 1)
    }
  }, [items.length, pending.length])

  // ── sending ──────────────────────────────────────────────────────────────

  const send = useCallback(
    async (content: string) => {
      const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`
      setPending((current) => [
        ...current,
        { localId, content, createdAt: new Date().toISOString(), failed: false },
      ])

      try {
        const posted = await messagesApi.post(await getToken(), room.id, content)
        setPending((current) => current.filter((item) => item.localId !== localId))
        setItems((current) => merge(current, [posted]))
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
    [getToken, room.id, toast],
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
    [getToken, toast],
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
    [getToken, toast],
  )

  const deleteMessage = useCallback(
    async (messageId: Uuid) => {
      const removed = items.find((message) => message.id === messageId)
      setItems((current) => current.filter((message) => message.id !== messageId))
      try {
        await messagesApi.remove(await getToken(), messageId)
        toast.success('Message deleted')
      } catch (cause) {
        if (removed) setItems((current) => merge(current, [removed]))
        toast.error(
          'Could not delete',
          cause instanceof ApiError ? cause.message : undefined,
        )
      }
    },
    [getToken, items, toast],
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

        {!loading && !olderCursor && items.length > 0 && (
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

      {canSend ? (
        <Composer roomName={room.name} onSend={send} />
      ) : (
        <p className={styles.readOnly}>You do not have permission to post in this room.</p>
      )}
    </>
  )
}

// ── the composer ───────────────────────────────────────────────────────────

function Composer({
  roomName,
  onSend,
}: {
  roomName: string
  onSend: (content: string) => Promise<void>
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
      <div className={styles.composerField}>
        <textarea
          ref={textareaRef}
          className={styles.composerInput}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
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
}: MessageRowProps) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)

  const name = author?.display_name ?? 'Unknown'

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
        <Avatar
          name={name}
          src={author?.avatar_url}
          color={author?.accent_color}
          size="md"
          className={styles.messageAvatar}
        />
      )}

      <div className={styles.messageBody}>
        {!grouped && (
          <div className={styles.messageHeader}>
            <span className={styles.author}>{name}</span>
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
function Linkified({ text }: { text: string }) {
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
          part
        ),
      )}
    </>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Combine two message lists, newest state winning, ordered by time.
 *
 * Polling re-fetches messages the client already has, and a naive replace would
 * throw away an optimistic reaction a few milliseconds before the server
 * confirms it. Keying by id makes the merge idempotent.
 */
function merge(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map(existing.map((message) => [message.id, message]))
  for (const message of incoming) {
    // An API older than inline reaction tallies omits the field entirely.
    // Defaulting here means a stale server degrades to "no reactions" instead
    // of throwing on `.length` and blanking the whole transcript.
    byId.set(message.id, message.reactions ? message : { ...message, reactions: [] })
  }

  return [...byId.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
}

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
