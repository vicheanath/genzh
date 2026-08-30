import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { Children, cloneElement, isValidElement } from 'react'
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react'

import styles from './Tooltip.module.css'

export interface TooltipProps
  extends Omit<ComponentPropsWithoutRef<'button'>, 'content' | 'children'> {
  /** The element the tooltip describes. Rendered as the trigger itself. */
  children: ReactElement
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/** Does `node` render any non-whitespace text, at any depth? */
function hasVisibleText(node: ReactNode): boolean {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).trim().length > 0
  }
  if (Array.isArray(node)) {
    return node.some(hasVisibleText)
  }
  if (isValidElement(node)) {
    return hasVisibleText((node.props as { children?: ReactNode }).children)
  }
  return false
}

/**
 * Does the trigger already have an accessible name of its own — either an
 * explicit `aria-label`/`aria-labelledby`, or visible text content?
 *
 * The text-content check matters: a button that already reads "Try on" gets
 * its accessible name from that text for free. Auto-filling `aria-label`
 * from a *different* string (the tooltip's fuller explanation) would
 * override it — a screen reader would announce the explanation instead of
 * the visible label, which is worse than announcing nothing extra at all.
 * Auto-fill exists for the icon-only case, where there is no visible text to
 * lose.
 */
function hasOwnAccessibleName(element: ReactElement): boolean {
  const props = element.props as Record<string, unknown>
  if (props['aria-label'] || props['aria-labelledby']) return true
  return hasVisibleText(Children.toArray(props.children as ReactNode))
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
 * 1. A plain-string `content` becomes the trigger's `aria-label`, but only
 *    when the child has no accessible name of its own already — no explicit
 *    `aria-label`/`aria-labelledby`, and no visible text content either. That
 *    second condition matters as much as the first: a button that already
 *    reads "Try on" gets its accessible name from that text for free, and
 *    auto-filling a *different* string over it would make a screen reader
 *    announce the tooltip's fuller explanation instead of the visible label
 *    — worse than announcing nothing extra. This is squarely an icon-only-
 *    trigger feature. Where it does apply, it also closes real drift: two
 *    call sites had already let their separately-written aria-label and
 *    tooltip text disagree.
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
