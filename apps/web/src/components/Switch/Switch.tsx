import { Switch as BaseSwitch } from '@base-ui/react/switch'
import type { ComponentPropsWithoutRef } from 'react'

import { cx } from '@/lib/cx'

import styles from './Switch.module.css'

export interface SwitchProps
  extends Omit<ComponentPropsWithoutRef<typeof BaseSwitch.Root>, 'className'> {
  className?: string
}

/** An on/off toggle. Controlled via `checked` / `onCheckedChange`. */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root {...props} className={cx(styles.root, className)}>
      <BaseSwitch.Thumb className={styles.thumb} />
    </BaseSwitch.Root>
  )
}
