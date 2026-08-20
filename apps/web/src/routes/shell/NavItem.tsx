import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './shell.module.css'

/**
 * One row in the sidebar: a leading glyph, a label, and an active state.
 *
 * The active treatment — a tinted ground *and* a gradient spine down the left
 * edge — is the sidebar's signature, and it was previously written out at every
 * call site. Six copies of `cx(navItem, isActive && navItemActive)` meant six
 * places to keep in step, and one of them (the DM list) had already drifted.
 *
 * `leading` is a slot rather than an icon prop because the rows are not all
 * icons: a channel shows its type glyph, a direct message shows the other
 * person's avatar. Both need the same row.
 */
export function NavItem({
  to,
  end,
  leading,
  label,
  trailing,
}: {
  to: string
  end?: boolean
  leading: ReactNode
  label: ReactNode
  trailing?: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
    >
      {leading}
      <span className={styles.navLabel}>{label}</span>
      {trailing}
    </NavLink>
  )
}

/** A titled run of nav rows. Renders nothing when it would be empty. */
export function NavGroup({
  heading,
  children,
  hideWhenEmpty,
}: {
  heading: string
  children: ReactNode
  hideWhenEmpty?: boolean
}) {
  if (hideWhenEmpty && !hasContent(children)) return null

  return (
    <section className={styles.group}>
      <h2 className={styles.groupHeading}>{heading}</h2>
      {children}
    </section>
  )
}

/** False for the shapes React renders as nothing: null, false, an empty array. */
function hasContent(children: ReactNode): boolean {
  if (Array.isArray(children)) return children.some(hasContent)
  return children !== null && children !== undefined && children !== false
}
