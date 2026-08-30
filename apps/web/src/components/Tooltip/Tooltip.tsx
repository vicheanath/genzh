import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { cloneElement } from 'react'
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react'

import styles from './Tooltip.module.css'

export interface TooltipProps
  extends Omit<ComponentPropsWithoutRef<'button'>, 'content' | 'children'> {
  /** The element the tooltip describes. Rendered as the trigger itself. */
  children: ReactElement
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}

function hasOwnAccessibleName(element: ReactElement): boolean {
  const props = element.props as Record<string, unknown>
  return Boolean(props['aria-label'] || props['aria-labelledby'])
}

function isDisabled(element: ReactElement): boolean {
  const props = element.props as Record<string, unknown>
  return Boolean(props.disabled) || props['aria-disabled'] === true || props['aria-disabled'] === 'true'
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
 *
 * Two things happen to the child before Base UI ever sees it:
 *
 * 1. A plain-string `content` becomes the trigger's `aria-label`, unless the
 *    child already sets one. The tooltip text and the accessible name are the
 *    same information almost everywhere this is used — writing it twice
 *    invites the two copies to drift, which had already happened at more than
 *    one call site. An explicit `aria-label` on the child still wins, for the
 *    genuine cases where the visible tooltip and the accessible name should
 *    differ (a badge count in one, a stable label in the other).
 * 2. A `disabled` child is wrapped in an inert span. A native `disabled`
 *    element does not reliably dispatch the hover/focus events a tooltip
 *    needs — several browsers suppress them outright — so without the
 *    wrapper, a tooltip explaining *why* a control is disabled would silently
 *    never appear, in exactly the situation where it matters most. Only a
 *    disabled child is wrapped; every other trigger, including one composed
 *    with Popover above, is untouched.
 */
export function Tooltip({ children, content, side = 'top', ...triggerProps }: TooltipProps) {
  const labeled =
    typeof content === 'string' && !hasOwnAccessibleName(children)
      ? cloneElement(children, { 'aria-label': content } as Record<string, unknown>)
      : children

  const trigger = isDisabled(children) ? (
    <span className={styles.disabledWrapper}>{labeled}</span>
  ) : (
    labeled
  )

  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger {...triggerProps} render={trigger} />
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
