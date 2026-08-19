import { Avatar as BaseAvatar } from '@base-ui/react/avatar'

import { PresenceDot, type Presence } from '@/components/PresenceDot'
import { cx } from '@/lib/cx'

import styles from './Avatar.module.css'

export interface AvatarProps {
  name: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Draws the speaking ring. */
  speaking?: boolean
  /** Draws a status dot in the corner. Omit for no dot at all. */
  presence?: Presence
  /** The user's chosen accent, used to tint the initials fallback. */
  color?: string | null
  className?: string
}

export function Avatar({
  name,
  src,
  size = 'md',
  speaking,
  presence,
  color,
  className,
}: AvatarProps) {
  return (
    <span className={cx(styles.wrapper, styles[size], className)}>
      <BaseAvatar.Root
        className={cx(styles.root, speaking && styles.speaking)}
        // A per-user hue turns a wall of identical circles into faces you can
        // pick out. The user's own accent wins; otherwise the name decides, so
        // the same person is the same colour on every screen and every device.
        style={{ '--avatar-hue': color ?? hueFor(name) } as React.CSSProperties}
      >
        {src && <BaseAvatar.Image src={src} alt="" className={styles.image} />}
        {/* Rendered while the image loads and whenever it fails, so a broken
            avatar URL degrades to initials instead of an empty circle. */}
        <BaseAvatar.Fallback className={styles.fallback}>
          {initials(name)}
        </BaseAvatar.Fallback>
      </BaseAvatar.Root>

      {presence && <PresenceDot presence={presence} />}
    </span>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase()
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

/**
 * A stable colour for a name.
 *
 * Deterministic rather than random: the hash means the same handle gets the
 * same hue in every session and in every other user's browser, which is the
 * whole point — an unstable colour is worse than no colour.
 */
function hueFor(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0
  }
  return `oklch(0.62 0.16 ${Math.abs(hash) % 360})`
}
