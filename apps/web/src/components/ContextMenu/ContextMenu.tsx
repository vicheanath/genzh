import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cx } from '@/lib/cx'

import menuStyles from '@/components/Menu/Menu.module.css'
import styles from './ContextMenu.module.css'

export interface ContextMenuProps {
  /** The region that opens the menu on right-click or long-press. */
  children: ReactNode
  items: ReactNode
  className?: string
}

/**
 * A right-click menu.
 *
 * Deliberately shares `Menu`'s stylesheet: a menu that looks different
 * depending on how it was summoned is two menus to learn. Only the parts that
 * genuinely differ live in this file's own module — the trigger wrapper, and
 * the fact that this one positions at the pointer rather than against an
 * anchor.
 *
 * Base UI handles long-press on touch, so this is not a desktop-only
 * affordance, and it suppresses the native menu only over the trigger.
 */
export function ContextMenu({ children, items, className }: ContextMenuProps) {
  return (
    <BaseContextMenu.Root>
      <BaseContextMenu.Trigger className={cx(styles.trigger, className)}>
        {children}
      </BaseContextMenu.Trigger>

      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner className={menuStyles.positioner}>
          <BaseContextMenu.Popup className={menuStyles.popup}>{items}</BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  )
}

export interface ContextMenuItemProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseContextMenu.Item>, 'className'> {
  icon?: ReactNode
  tone?: 'default' | 'danger'
}

export function ContextMenuItem({
  icon,
  tone = 'default',
  children,
  ...props
}: ContextMenuItemProps) {
  return (
    <BaseContextMenu.Item
      {...props}
      className={cx(menuStyles.item, tone === 'danger' && menuStyles.danger)}
    >
      {icon && <span className={menuStyles.itemIcon}>{icon}</span>}
      <span className={menuStyles.itemLabel}>{children}</span>
    </BaseContextMenu.Item>
  )
}

export function ContextMenuSeparator() {
  return <BaseContextMenu.Separator className={menuStyles.separator} />
}
