import { useEffect, useRef, useState, type ReactElement } from 'react'

import { Popover } from '@/components/Popover'
import { SearchIcon } from '@/components/Icons'
import { Spinner } from '@/components/Spinner'
import { useGifSearchInfinite } from '@/lib/api'

import styles from './GifPicker.module.css'

/**
 * How long to wait after the last keystroke before searching.
 *
 * Every search is a round-trip through our API to GIPHY, and a person typing
 * "excited" would otherwise fire seven of them to show the results of the
 * seventh. Long enough to skip the intermediate words, short enough that it
 * still feels like it is keeping up.
 */
const DEBOUNCE_MS = 350

export interface GifPickerProps {
  /** Rendered as the trigger element itself, not wrapped in one. */
  trigger: ReactElement
  /** Called with the GIF's URL, which is what gets posted as the message. */
  onPick: (url: string) => void
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * Search GIPHY and pick a GIF.
 *
 * Opens on trending, because an empty grid with a cursor in a box is a worse
 * invitation than a wall of GIFs. The query is debounced rather than tied to a
 * submit button: nobody presses enter in a GIF picker.
 *
 * The panel is only mounted while open — the grid holds a few dozen animating
 * images, and leaving them decoding behind a closed popover costs real memory
 * on a phone for something nobody is looking at.
 */
export function GifPicker({ trigger, onPick, align = 'start', side = 'top' }: GifPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      trigger={trigger}
      title="Pick a GIF"
      open={open}
      onOpenChange={setOpen}
      align={align}
      side={side}
      sideOffset={8}
      className={styles.picker}
    >
      {open && (
        <GifPanel
          onPick={(url) => {
            onPick(url)
            setOpen(false)
          }}
        />
      )}
    </Popover>
  )
}

/** The searching half, mounted only while the panel is open. */
function GifPanel({ onPick }: { onPick: (url: string) => void }) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term])

  // The panel exists to be typed into. Focusing on mount saves the click that
  // every single use would otherwise begin with.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useGifSearchInfinite(debounced)

  const results = data?.results ?? []

  return (
    <div className={styles.panel}>
      <div className={styles.searchRow}>
        <SearchIcon size={15} className={styles.searchIcon} />
        <input
          ref={inputRef}
          className={styles.search}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search GIPHY"
          aria-label="Search for a GIF"
          type="search"
        />
      </div>

      {isPending ? (
        <div className={styles.state}>
          <Spinner />
        </div>
      ) : isError ? (
        <p className={styles.state} role="status">
          {/* The one failure worth naming: a deployment with no GIPHY key.
              Everything else is "try again", which the retry does not say
              better than the picker staying open does. */}
          {isUnavailable(error) ? 'GIF search is not available here.' : 'Could not load GIFs.'}
        </p>
      ) : results.length === 0 ? (
        <p className={styles.state} role="status">
          No GIFs for “{debounced}”.
        </p>
      ) : (
        <>
          <div className={styles.grid}>
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                className={styles.result}
                onClick={() => onPick(gif.url)}
                // The description is GIPHY's title, which is the only thing
                // distinguishing one moving square from another to a screen
                // reader.
                aria-label={gif.description || 'GIF'}
                // Reserving the space stops the grid reflowing as each image
                // arrives, which otherwise moves the one being clicked.
                style={{ aspectRatio: gif.width && gif.height ? `${gif.width} / ${gif.height}` : '1' }}
              >
                <img
                  className={styles.image}
                  src={gif.preview_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>

          {hasNextPage && (
            <button
              type="button"
              className={styles.more}
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}

      {/* GIPHY's terms require this attribution wherever results are shown. */}
      <p className={styles.attribution}>Powered by GIPHY</p>
    </div>
  )
}

/** Whether this failure is "the server has no GIF search" rather than a fault. */
function isUnavailable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'FEATURE_UNAVAILABLE'
  )
}
