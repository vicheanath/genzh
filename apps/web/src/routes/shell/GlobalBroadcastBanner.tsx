import { useState } from 'react'
import { useActiveBroadcasts } from '@/features/api'
import styles from './GlobalBroadcastBanner.module.css'

export function GlobalBroadcastBanner() {
  const broadcasts = useActiveBroadcasts()
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>({})

  const activeList = (broadcasts.data ?? []).filter((b) => !dismissedIds[b.id])
  const item = activeList[0]
  if (!item) return null

  return (
    <aside
      className={`${styles.banner} ${styles[item.level] ?? styles.info}`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.content}>
        <strong className={styles.title}>{item.title}</strong>
        <span className={styles.message}> — {item.message}</span>
      </div>
      <button
        type="button"
        className={styles.dismissBtn}
        aria-label="Dismiss banner"
        onClick={() => setDismissedIds((prev) => ({ ...prev, [item.id]: true }))}
      >
        ✕
      </button>
    </aside>
  )
}
