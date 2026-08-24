import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import type { ComponentPropsWithoutRef } from 'react'

import { cx } from '@/lib/cx'

import styles from './Tabs.module.css'

/* Base UI types `className` as `string | ((state) => string)`. Every component
   in this directory narrows it to a plain string: the callback form cannot be
   composed with `cx` and nothing here needs state-derived class names. */
type RootProps = Omit<ComponentPropsWithoutRef<typeof BaseTabs.Root>, 'className'> & {
  className?: string
}
type ListProps = Omit<ComponentPropsWithoutRef<typeof BaseTabs.List>, 'className'> & {
  className?: string
}
type TabProps = Omit<ComponentPropsWithoutRef<typeof BaseTabs.Tab>, 'className'> & {
  className?: string
}
type PanelProps = Omit<ComponentPropsWithoutRef<typeof BaseTabs.Panel>, 'className'> & {
  className?: string
}

export interface TabsListProps extends ListProps {
  /**
   * `line`  — an underline beneath a horizontal strip. For tabs *within* a panel.
   * `pill`  — a filled lozenge sliding behind the active tab. For segmented
   *           controls and mobile strips, where an underline is too quiet.
   * `rail`  — a vertical column of destinations, marker on the leading edge.
   *           For the settings-style sidebar.
   */
  variant?: 'line' | 'pill' | 'rail'
}

/**
 * Tabs.
 *
 * Base UI supplies the parts this app kept re-implementing by hand: roving
 * focus with arrow keys, `aria-controls`/`aria-labelledby` between each tab and
 * its panel, and — via `Tabs.Indicator` — the active tab's measured position
 * published as CSS variables, which is what lets the marker *slide* between
 * tabs instead of cutting.
 *
 * The three list variants exist because this app genuinely has three shapes of
 * tab and they were three unrelated piles of CSS before.
 */
export function TabsRoot({ className, ...props }: RootProps) {
  return <BaseTabs.Root {...props} className={cx(styles.root, className)} />
}

export function TabsList({ variant = 'line', className, children, ...props }: TabsListProps) {
  return (
    <BaseTabs.List {...props} className={cx(styles.list, styles[variant], className)}>
      {children}
      {/* Rendered last so it paints under the labels without needing a z-index
          on every tab. */}
      <BaseTabs.Indicator className={styles.indicator} />
    </BaseTabs.List>
  )
}

export function Tab({ className, ...props }: TabProps) {
  return <BaseTabs.Tab {...props} className={cx(styles.tab, className)} />
}

export function TabPanel({ className, ...props }: PanelProps) {
  return <BaseTabs.Panel {...props} className={cx(styles.panel, className)} />
}

/** Namespaced access, matching how Base UI's own parts are used. */
export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Tab,
  Panel: TabPanel,
}
