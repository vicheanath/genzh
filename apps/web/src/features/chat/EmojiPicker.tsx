import type { ReactElement } from 'react'

import { Popover, PopoverClose } from '@/components/Popover'
import type { CustomEmoji } from '@/lib/api'

import { EMOJI } from './emoji'
import styles from './EmojiPicker.module.css'

export interface EmojiPickerProps {
  /** Rendered as the trigger element itself, not wrapped in one. */
  trigger: ReactElement
  /**
   * Receives a unicode emoji, or a `:shortcode:` for a custom one.
   *
   * One callback for both because both call sites want the same thing: the
   * composer inserts the string into the draft, and the reaction bar sends it
   * as a reaction key. The server accepts either in the same field, so nothing
   * downstream needs to know which kind was picked.
   */
  onPick: (emoji: string) => void
  /** This room's custom emoji. Empty for a room outside any community. */
  custom?: readonly CustomEmoji[]
  /** Heading inside the panel — "Emoji" when inserting, "Add a reaction" when reacting. */
  title?: string
  /** Used to build each button's label: "React with 🔥" / "Insert 🔥". */
  verb?: string
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * The emoji grid, once.
 *
 * There were two of these — one in the composer for inserting, one in the
 * transcript for reacting — and they were the same forty lines twice, down to
 * a duplicated copy of the grid stylesheet in two CSS modules. They had already
 * drifted on offset and alignment, and only one of them had labels on the
 * buttons.
 *
 * Each emoji is a `PopoverClose`, so picking one both fires the callback and
 * dismisses the panel without the call site managing an `open` state.
 *
 * A community's own glyphs go **above** the unicode set rather than below it.
 * They are the ones people came for — the unicode grid is the same everywhere
 * and can be scrolled to.
 */
export function EmojiPicker({
  trigger,
  onPick,
  custom = [],
  title = 'Emoji',
  verb = 'Insert',
  align = 'start',
  side = 'top',
}: EmojiPickerProps) {
  return (
    <Popover
      trigger={trigger}
      title={title}
      align={align}
      side={side}
      sideOffset={8}
      className={styles.picker}
    >
      {custom.length > 0 && (
        <>
          <p className={styles.sectionLabel}>This community</p>
          <div className={styles.grid}>
            {custom.map((emoji) => (
              <PopoverClose
                key={emoji.id}
                className={styles.button}
                onClick={() => onPick(`:${emoji.name}:`)}
                aria-label={`${verb} :${emoji.name}:`}
                title={`:${emoji.name}:`}
              >
                <img
                  className={styles.customImage}
                  src={emoji.image_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </PopoverClose>
            ))}
          </div>
          <p className={styles.sectionLabel}>Standard</p>
        </>
      )}

      <div className={styles.grid}>
        {EMOJI.map((emoji) => (
          <PopoverClose
            key={emoji}
            className={styles.button}
            onClick={() => onPick(emoji)}
            aria-label={`${verb} ${emoji}`}
          >
            {emoji}
          </PopoverClose>
        ))}
      </div>
    </Popover>
  )
}
