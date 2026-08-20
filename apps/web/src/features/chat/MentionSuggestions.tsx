import { useEffect, useRef } from 'react'

import { Avatar } from '@/components/Avatar'
import { AtSignIcon, UsersIcon } from '@/components/Icons'
import { cx } from '@/lib/cx'

import type { MentionCandidate } from './mentions'
import styles from './MentionSuggestions.module.css'

/**
 * The list that opens above the composer while an `@` is being typed.
 *
 * Anchored to the field rather than to the caret. A caret-tracking popup needs
 * a mirrored copy of the textarea to measure against, and buys nothing here:
 * the field is one or two lines and sits at the bottom of the screen, so "just
 * above the box" is where the eye already is.
 *
 * Focus never leaves the textarea — rows commit on `mousedown`, which is what
 * keeps the caret, the selection, and the query alive through a click.
 */
export function MentionSuggestions({
  id,
  candidates,
  activeIndex,
  query,
  onPick,
  onHover,
}: {
  id: string
  candidates: MentionCandidate[]
  activeIndex: number
  query: string
  onPick: (candidate: MentionCandidate) => void
  onHover: (index: number) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  // Keyboard navigation has to be able to reach rows the list has scrolled
  // past; `nearest` keeps it from jumping when the row is already visible.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div className={styles.popup} role="presentation">
      <div className={styles.header}>
        <AtSignIcon size={12} />
        <span>{query ? `Members matching “${query}”` : 'Mention someone'}</span>
      </div>

      <div className={styles.list} role="listbox" id={id} ref={listRef} aria-label="Mention suggestions">
        {candidates.map((candidate, index) => (
          <div
            key={candidate.key}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            data-active={index === activeIndex}
            className={cx(styles.row, index === activeIndex && styles.rowActive)}
            // Not `onClick`: by the time click fires the textarea has already
            // lost focus and the browser has collapsed the caret.
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(candidate)
            }}
            onMouseEnter={() => onHover(index)}
          >
            {candidate.everyone ? (
              <span className={styles.broadcast}>
                <UsersIcon size={15} />
              </span>
            ) : (
              <Avatar
                name={candidate.name}
                src={candidate.avatarUrl}
                color={candidate.accent}
                size="sm"
                presence={candidate.online ? 'online' : undefined}
              />
            )}

            <span className={styles.text}>
              <span className={styles.name}>
                {candidate.everyone ? '@everyone' : candidate.name}
              </span>
              {candidate.detail && <span className={styles.detail}>{candidate.detail}</span>}
            </span>

            {!candidate.everyone && (
              <span className={styles.handle}>
                <Match text={`@${candidate.handle}`} query={query} />
              </span>
            )}
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        <span>to navigate</span>
        <kbd>Tab</kbd>
        <span>to insert</span>
        <kbd>Esc</kbd>
        <span>to dismiss</span>
      </div>
    </div>
  )
}

/** Bolds the run the query matched, so it is obvious *why* a row is offered. */
function Match({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>

  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at === -1) return <>{text}</>

  return (
    <>
      {text.slice(0, at)}
      <mark className={styles.mark}>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  )
}
