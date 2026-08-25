import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

import { Button } from '@/components/Button'
import { AtSignIcon, LockIcon, ReplyIcon, SendIcon, SmileIcon, UsersIcon, XIcon } from '@/components/Icons'
import { Tooltip } from '@/components/Tooltip'
import type { RoomWithPermissions, Uuid } from '@/lib/api'
import { cx } from '@/lib/cx'

import { contentProblem, MAX_LENGTH } from './limits'
import { MentionSuggestions } from './MentionSuggestions'
import {
  applyMention,
  findMentionQuery,
  rankCandidates,
  type MentionCandidate,
} from './mentions'
import { useMentionCandidates } from './useMentionCandidates'
import styles from './Composer.module.css'
import { EmojiPicker } from './EmojiPicker'

/** The counter is noise until the ceiling is actually in sight. */
const COUNTER_FROM = 200

/** Tall enough for a paragraph, short enough to leave the transcript readable. */
const MAX_HEIGHT = 180

export interface ReplyTarget {
  id: Uuid
  authorName: string
  content: string
}

export interface ComposerProps {
  room: RoomWithPermissions
  onSend: (content: string, replyToId?: Uuid) => Promise<void>
  onTyping?: () => void
  isAnonymous?: boolean
  onTogglePersona?: (isAnon: boolean) => void
  anonAlias?: string
  publicName: string
  replyingTo?: ReplyTarget | null
  onCancelReply?: () => void
}

/**
 * The message box.
 *
 * Lives in `features/chat` rather than inside the transcript view: composing is
 * its own concern — a draft, a caret, an autocomplete, a persona — and none of
 * it is about drawing messages. The view keeps scroll position and history.
 *
 * The layout is one card: the text on top, a quiet action bar beneath it. That
 * bar is where the persona chips moved to, which is the point of the shape —
 * "who am I posting as" belongs to the message being written, not to a banner
 * hovering above the field.
 */
export function Composer({
  room,
  onSend,
  onTyping,
  isAnonymous,
  onTogglePersona,
  anonAlias,
  publicName,
  replyingTo,
  onCancelReply,
}: ComposerProps) {
  const [draft, setDraft] = useState('')
  // Tracked separately from the value: the mention being completed is decided
  // by where the caret is, and moving the caret with the arrow keys changes the
  // answer without changing the text.
  const [caret, setCaret] = useState(0)
  // Which `@` Escape closed, by its offset. A flag would have to be cleared by
  // an effect watching the query; an offset simply stops matching once the
  // caret moves to a different mention, so the next one opens on its own.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  // The highlight is stored with the query it belongs to, so a new query starts
  // at the top without an effect resetting it after the fact.
  const [selection, setSelection] = useState({ key: '', index: 0 })

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listId = useId()

  const candidates = useMentionCandidates(room)

  const query = findMentionQuery(draft, caret)
  const dismissed = query !== null && dismissedAt === query.start
  const suggestions = query && !dismissed ? rankCandidates(candidates, query.text) : []
  const open = suggestions.length > 0

  const queryKey = query ? `${query.start}:${query.text}` : ''
  const activeIndex = selection.key === queryKey ? selection.index : 0

  const highlight = (index: number) => setSelection({ key: queryKey, index })

  // Grow with the content up to a ceiling. Resetting to `auto` first is what
  // makes it shrink again when a line is deleted.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`
  }, [draft])

  /** Replace the draft and put the caret somewhere specific inside it. */
  function write(text: string, at: number) {
    setDraft(text)
    setCaret(at)
    // After React has painted the new value — setting the selection against the
    // old one would land in the wrong place, or be overwritten by the render.
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(at, at)
    })
  }

  function accept(candidate: MentionCandidate) {
    if (!query) return
    const next = applyMention(draft, query, candidate.handle)
    write(next.text, next.caret)
  }

  function insert(text: string) {
    const at = textareaRef.current?.selectionStart ?? draft.length
    const end = textareaRef.current?.selectionEnd ?? at
    write(draft.slice(0, at) + text + draft.slice(end), at + text.length)
  }

  /** The `@` button: types the character, which opens the picker on its own. */
  function startMention() {
    const at = textareaRef.current?.selectionStart ?? draft.length
    const before = draft[at - 1]
    // An `@` that does not begin a word is not a mention — the server would not
    // parse it, so the picker must not offer one either.
    insert(before === undefined || /\s/.test(before) ? '@' : ' @')
  }

  function submit() {
    const content = draft.trim()
    if (!content || contentProblem(content)) return
    const replyId = replyingTo?.id
    setDraft('')
    setCaret(0)
    // Otherwise the next message's first `@` — at the same offset as the one
    // Escape closed — would open dismissed.
    setDismissedAt(null)
    onCancelReply?.()
    void onSend(content, replyId)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      // While the list is up it owns the keys that mean "move" and "choose".
      // Enter is included: mid-mention it completes the name rather than
      // sending a half-typed handle.
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        // Wraps, so ↑ from the first row reaches the last without a long hold.
        highlight((activeIndex + step + suggestions.length) % suggestions.length)
        return
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        const candidate = suggestions[activeIndex]
        if (candidate) {
          event.preventDefault()
          accept(candidate)
          return
        }
      }

      if (event.key === 'Escape' && query) {
        event.preventDefault()
        setDismissedAt(query.start)
        return
      }
    }

    if (event.key === 'Escape' && replyingTo && !open) {
      event.preventDefault()
      onCancelReply?.()
      return
    }

    // Enter sends, Shift+Enter breaks the line — the convention everywhere, and
    // the reason the control is a textarea rather than an input.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const remaining = MAX_LENGTH - draft.length
  const empty = draft.trim().length === 0

  // A draft the server would refuse. Caught here so the message never leaves —
  // being told "at most ten people" while looking at the sentence beats
  // watching it disappear into an error toast.
  const problem = empty ? null : contentProblem(draft)

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className={styles.anchor}>
        {open && query && (
          <div className={styles.suggestions}>
            <MentionSuggestions
              id={listId}
              candidates={suggestions}
              activeIndex={activeIndex}
              query={query.text}
              onPick={accept}
              onHover={highlight}
            />
          </div>
        )}

        {replyingTo && (
          <div className={styles.replyBanner}>
            <div className={styles.replyInfo}>
              <ReplyIcon size={14} className={styles.replyIcon} />
              <span className={styles.replyText}>
                Replying to <strong>{replyingTo.authorName}</strong>
                <span className={styles.replySnippet}>: {replyingTo.content}</span>
              </span>
            </div>
            <button
              type="button"
              className={styles.replyCancel}
              onClick={onCancelReply}
              aria-label="Cancel reply"
              title="Cancel reply (Esc)"
            >
              <XIcon size={14} />
            </button>
          </div>
        )}

        <div
          className={cx(
            styles.field,
            isAnonymous && styles.fieldAnonymous,
            problem && styles.fieldProblem,
            replyingTo && styles.fieldWithReply,
          )}
        >
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setCaret(event.target.selectionStart ?? event.target.value.length)
              onTyping?.()
            }}
            // Fires for clicks and arrow keys alike, which is what keeps the
            // picker in step with a caret moved back into an earlier mention.
            onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            placeholder={`Message #${room.name}`}
            aria-label={`Message ${room.name}`}
            rows={1}
            maxLength={MAX_LENGTH}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
            aria-autocomplete="list"
          />

          <div className={styles.bar}>
            <div className={styles.tools}>
              <EmojiButton onPick={insert} />

              <Tooltip content="Mention someone">
                <button
                  type="button"
                  className={styles.tool}
                  onClick={startMention}
                  aria-label="Mention someone"
                >
                  <AtSignIcon size={16} />
                </button>
              </Tooltip>

              {onTogglePersona && (
                <div
                  className={styles.persona}
                  role="group"
                  aria-label="Post as"
                >
                  <button
                    type="button"
                    className={cx(styles.chip, isAnonymous && styles.chipActive)}
                    onClick={() => onTogglePersona(true)}
                    aria-pressed={isAnonymous}
                    title="Post anonymously with a masked identity"
                  >
                    <LockIcon size={12} />
                    <span>{anonAlias ?? 'Anonymous'}</span>
                  </button>
                  <button
                    type="button"
                    className={cx(styles.chip, !isAnonymous && styles.chipActive)}
                    onClick={() => onTogglePersona(false)}
                    aria-pressed={!isAnonymous}
                    title="Post with your public account profile"
                  >
                    <UsersIcon size={12} />
                    <span>{publicName}</span>
                  </button>
                </div>
              )}
            </div>

            <div className={styles.submit}>
              {/* Only once the ceiling is close enough to matter. */}
              {remaining <= COUNTER_FROM && (
                <span
                  className={cx(styles.counter, remaining <= 0 && styles.counterFull)}
                  aria-live="polite"
                >
                  {remaining}
                </span>
              )}

              <Button
                type="submit"
                size="sm"
                iconOnly
                round
                disabled={empty || problem !== null}
                aria-label="Send message"
              >
                <SendIcon size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {problem ? (
        <p className={styles.problem} role="status">
          {problem}
        </p>
      ) : (
        <p className={styles.hint}>
          <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line ·{' '}
          <kbd>@</kbd> to mention
        </p>
      )}
    </form>
  )
}

/** Emoji into the draft, at the caret rather than at the end. */
function EmojiButton({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <EmojiPicker
      onPick={onPick}
      trigger={
        <button type="button" className={styles.tool} aria-label="Add an emoji">
          <SmileIcon size={16} />
        </button>
      }
    />
  )
}
