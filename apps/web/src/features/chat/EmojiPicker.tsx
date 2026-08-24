import type { ReactElement } from 'react'

import { Popover, PopoverClose } from '@/components/Popover'

import { EMOJI } from './emoji'
import styles from './EmojiPicker.module.css'

export interface EmojiPickerProps {
  /** Rendered as the trigger element itself, not wrapped in one. */
  trigger: ReactElement
  onPick: (emoji: string) => void
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
 */
export function EmojiPicker({
  trigger,
  onPick,
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
