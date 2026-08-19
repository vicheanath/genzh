import { Menu as BaseMenu } from '@base-ui/react/menu'
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Menu.module.css'

export interface MenuProps {
  /** Rendered as the trigger element itself, not wrapped in one. */
  trigger: ReactElement
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * A dropdown menu.
 *
 * Wraps the Portal → Positioner → Popup chain so call sites are just a trigger
 * and a list of items. Base UI supplies typeahead, roving focus, and closing on
 * outside press — the behaviours that make a `<div>` full of buttons not a menu.
 */
export function Menu({ trigger, children, align = 'end', side = 'bottom' }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          className={styles.positioner}
          sideOffset={6}
          align={align}
          side={side}
        >
          <BaseMenu.Popup className={styles.popup}>{children}</BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

export interface MenuItemProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseMenu.Item>, 'className'> {
  icon?: ReactNode
  tone?: 'default' | 'danger'
}

export function MenuItem({ icon, tone = 'default', children, ...props }: MenuItemProps) {
  return (
    <BaseMenu.Item {...props} className={cx(styles.item, tone === 'danger' && styles.danger)}>
      {icon && <span className={styles.itemIcon}>{icon}</span>}
      <span className={styles.itemLabel}>{children}</span>
    </BaseMenu.Item>
  )
}

export function MenuSeparator() {
  return <BaseMenu.Separator className={styles.separator} />
}
