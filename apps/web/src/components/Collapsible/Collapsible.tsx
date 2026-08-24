import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { ChevronDownIcon } from '@/components/Icons'
import { cx } from '@/lib/cx'

import styles from './Collapsible.module.css'

export interface CollapsibleProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseCollapsible.Root>, 'className' | 'title'> {
  title: ReactNode
  /** Sits at the trailing edge of the trigger — a count, an add button. */
  adornment?: ReactNode
  /** Small caps heading, for a channel-list section. */
  section?: boolean
  className?: string
}

/**
 * A disclosure.
 *
 * The panel animates on `--collapsible-panel-height`, which Base UI measures
 * and republishes; that is what makes the open/close a height transition
 * rather than a jump. Doing it by hand means either a hardcoded max-height
 * that clips long content or a ResizeObserver, and this app has several lists
 * whose length is not knowable ahead of time.
 */
export function Collapsible({
  title,
  adornment,
  section,
  className,
  children,
  ...props
}: CollapsibleProps) {
  return (
    <BaseCollapsible.Root {...props} className={cx(styles.root, className)}>
      <div className={cx(styles.header, section && styles.sectionHeader)}>
        <BaseCollapsible.Trigger className={cx(styles.trigger, section && styles.sectionTrigger)}>
          <ChevronDownIcon size={section ? 12 : 16} className={styles.chevron} />
          <span className={styles.title}>{title}</span>
        </BaseCollapsible.Trigger>
        {adornment && <span className={styles.adornment}>{adornment}</span>}
      </div>

      <BaseCollapsible.Panel className={styles.panel}>
        <div className={styles.panelInner}>{children}</div>
      </BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  )
}
