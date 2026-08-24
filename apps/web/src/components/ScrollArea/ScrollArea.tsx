import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area'
import type { ComponentPropsWithoutRef, Ref } from 'react'

import { cx } from '@/lib/cx'

import styles from './ScrollArea.module.css'

export interface ScrollAreaProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseScrollArea.Root>, 'className'> {
  /** Forwarded to the scrolling element — what you call `scrollTo` on. */
  viewportRef?: Ref<HTMLDivElement>
  /** Fades the content where it runs under the top and bottom edges. */
  fade?: boolean
  className?: string
  viewportClassName?: string
}

/**
 * A scroll container with the app's own scrollbar.
 *
 * `overflow: auto` plus `::-webkit-scrollbar` — which is what the rest of the
 * app does — gets you a bar that Firefox styles differently, that Safari on
 * macOS hides until it feels like it, and that cannot overlay content. Base UI
 * renders its own, so the bar is the same everywhere and can sit *over* the
 * content instead of stealing a 10px column from the layout.
 *
 * `viewportRef` is here because the transcript needs to drive its own scroll
 * position — the scrolling element is the viewport, not the root.
 */
export function ScrollArea({
  viewportRef,
  fade,
  className,
  viewportClassName,
  children,
  ...props
}: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root {...props} className={cx(styles.root, fade && styles.fade, className)}>
      <BaseScrollArea.Viewport
        ref={viewportRef}
        className={cx(styles.viewport, viewportClassName)}
      >
        <BaseScrollArea.Content className={styles.content}>{children}</BaseScrollArea.Content>
      </BaseScrollArea.Viewport>

      <BaseScrollArea.Scrollbar className={styles.scrollbar} orientation="vertical">
        <BaseScrollArea.Thumb className={styles.thumb} />
      </BaseScrollArea.Scrollbar>

      <BaseScrollArea.Scrollbar className={styles.scrollbar} orientation="horizontal">
        <BaseScrollArea.Thumb className={styles.thumb} />
      </BaseScrollArea.Scrollbar>

      <BaseScrollArea.Corner />
    </BaseScrollArea.Root>
  )
}
