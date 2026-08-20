import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

import { Tooltip } from '@/components/Tooltip'
import { cx } from '@/lib/cx'

import styles from './shell.module.css'

/**
 * One destination on the community rail.
 *
 * The rail's whole visual grammar — the lift on hover, the gradient dot marking
 * where you are — lives here rather than being repeated per entry. Every item
 * used to spell out the same `cx(railItem, isActive && railItemActive)` plus a
 * pill span, five times over, which made the rail's look a thing you had to
 * change in five places.
 *
 * `to` makes it a link; `onClick` makes it a button. The rail holds both — the
 * communities are places, "add a server" is an action — and they must look
 * identical.
 */
interface RailItemProps {
  label: string
  children: ReactNode
  to?: string
  end?: boolean
  onClick?: () => void
  /** Extra class for the one entry that is not on the accent (add a server). */
  className?: string
  /** Set when the child paints its own surface, e.g. a community avatar. */
  bare?: boolean
}

export function RailItem({
  label,
  children,
  to,
  end,
  onClick,
  className,
  bare,
}: RailItemProps) {
  const body = (
    <>
      <span className={styles.railPill} aria-hidden />
      {bare ? children : <span className={styles.railGlyph}>{children}</span>}
    </>
  )

  return (
    <Tooltip content={label} side="right">
      {to ? (
        <NavLink
          to={to}
          end={end}
          aria-label={label}
          className={({ isActive }) =>
            cx(styles.railItem, isActive && styles.railItemActive, className)
          }
        >
          {body}
        </NavLink>
      ) : (
        <button
          type="button"
          aria-label={label}
          className={cx(styles.railItem, className)}
          onClick={onClick}
        >
          {body}
        </button>
      )}
    </Tooltip>
  )
}
