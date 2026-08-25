import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useState } from 'react'
import { SearchIcon, XIcon } from '@/components/Icons'
import { Spinner } from '@/components/Spinner'
import { useSearchMessagesQuery } from '@/features/api'
import type { Uuid } from '@/lib/api'
import { formatClock, formatDayDivider } from '@/lib/time'
import { useProfiles } from '@/lib/useProfiles'
import styles from './SearchMessagesDialog.module.css'

export interface SearchMessagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId?: Uuid
  roomName?: string
  onJumpToMessage?: (messageId: Uuid) => void
}

export function SearchMessagesDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  onJumpToMessage,
}: SearchMessagesDialogProps) {
  const [query, setQuery] = useState('')
  const searchQuery = useSearchMessagesQuery(open ? query : '', roomId)

  const results = searchQuery.data ?? []
  const userIds = [...new Set(results.map((m) => m.author_id))]
  const lookup = useProfiles(userIds)

  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.popup}>
          <div className={styles.header}>
            <div className={styles.searchBar}>
              <SearchIcon size={18} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder={roomName ? `Search messages in #${roomName}...` : 'Search messages...'}
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <XIcon size={15} />
                </button>
              )}
            </div>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <XIcon size={16} />
            </button>
          </div>

          <div className={styles.content}>
            {!query.trim() ? (
              <div className={styles.empty}>
                <SearchIcon size={32} className={styles.emptyIcon} />
                <p className={styles.emptyTitle}>Search conversation</p>
                <p className={styles.emptyText}>
                  Type a keyword, phrase, or topic to search through messages {roomName ? `in #${roomName}` : ''}.
                </p>
              </div>
            ) : searchQuery.isLoading ? (
              <div className={styles.loading}>
                <Spinner />
                <span>Searching messages...</span>
              </div>
            ) : results.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>No results found</p>
                <p className={styles.emptyText}>
                  No messages matched "{query}". Try different keywords.
                </p>
              </div>
            ) : (
              <div className={styles.results}>
                <div className={styles.resultsHeader}>
                  <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
                </div>
                <div className={styles.list}>
                  {results.map((msg) => {
                    const author = lookup(msg.author_id)
                    const name = msg.anonymous_author
                      ? msg.anonymous_author.alias_name
                      : (author?.display_name ?? 'Unknown')

                    return (
                      <div
                        key={msg.id}
                        className={styles.item}
                        onClick={() => {
                          onJumpToMessage?.(msg.id)
                          onOpenChange(false)
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className={styles.itemHeader}>
                          <span className={styles.author}>{name}</span>
                          <span className={styles.time}>
                            {formatDayDivider(msg.created_at)} at {formatClock(msg.created_at)}
                          </span>
                        </div>
                        <p className={styles.messageText}>
                          <HighlightedText text={msg.content} highlight={query} />
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

function HighlightedText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) return <>{text}</>
  const regex = new RegExp(`(${escapeRegExp(highlight)})`, 'gi')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark key={index} className={styles.highlight}>
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
