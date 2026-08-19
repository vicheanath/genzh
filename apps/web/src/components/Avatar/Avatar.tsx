import { Avatar as BaseAvatar } from '@base-ui/react/avatar'

import { cx } from '@/lib/cx'

import styles from './Avatar.module.css'

export interface AvatarProps {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
  /** Draws the speaking ring. */
  speaking?: boolean
  className?: string
}

export function Avatar({ name, src, size = 'md', speaking, className }: AvatarProps) {
  return (
    <BaseAvatar.Root
      className={cx(styles.root, styles[size], speaking && styles.speaking, className)}
    >
      {src && <BaseAvatar.Image src={src} alt="" className={styles.image} />}
      {/* Rendered while the image loads and whenever it fails, so a broken
          avatar URL degrades to initials instead of an empty circle. */}
      <BaseAvatar.Fallback>{initials(name)}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase()
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}
