import { cx } from '@/lib/cx'

import styles from './Spinner.module.css'

export function Spinner({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <span
      className={cx(styles.spinner, size === 'lg' && styles.lg)}
      role="status"
      aria-label="Loading"
    />
  )
}

/** A spinner centred in the available space, for whole-panel loading states. */
export function LoadingPanel() {
  return (
    <div className={styles.centered}>
      <Spinner size="lg" />
    </div>
  )
}
