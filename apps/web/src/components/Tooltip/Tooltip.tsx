import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react'

import styles from './Tooltip.module.css'

export interface TooltipProps
  extends Omit<ComponentPropsWithoutRef<'button'>, 'content' | 'children'> {
  /** The element the tooltip describes. Rendered as the trigger itself. */
  children: ReactElement
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * A hover/focus label for a control.
 *
 * Anything else passed in is forwarded to the trigger, which is what lets a
 * tooltipped element also be *another* component's trigger:
 *
 *   <Popover trigger={<Tooltip content="Notifications"><button …/></Tooltip>} />
 *
 * Popover renders its trigger with Base UI's `render`, which hands the element
 * the props and ref that make it a trigger. Without the spread below those land
 * on this component and stop — the button gets no `onClick`, and the popover it
 * is supposed to open never opens.
 */
export function Tooltip({ children, content, side = 'top', ...triggerProps }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger {...triggerProps} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          className={styles.positioner}
          side={side}
          sideOffset={6}
        >
          <BaseTooltip.Popup className={styles.popup}>
            {content}
            <BaseTooltip.Arrow className={styles.arrow}>
              <svg width="10" height="5" viewBox="0 0 10 5" aria-hidden>
                <path d="M0 5 5 0l5 5z" fill="currentColor" />
              </svg>
            </BaseTooltip.Arrow>
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}

/**
 * Wrap the app once so tooltips share a delay group: after one tooltip has
 * opened, moving to a neighbouring trigger shows the next immediately instead
 * of waiting out the delay again.
 */
export const TooltipProvider = BaseTooltip.Provider
