import type { CSSProperties } from 'react'

import { Avatar, type AvatarProps } from '@/components/Avatar'
import type { EquippedCosmetics } from '@/features/rewards/api'
import { cx } from '@/lib/cx'

import { BadgeArt } from './CosmeticBadge'
import { CosmeticAvatarEffect } from './CosmeticAvatarEffect'
import { CosmeticFrame } from './CosmeticFrame'
import styles from './cosmetics.module.css'

export interface DecoratedAvatarProps extends AvatarProps {
  /** What this person is wearing. Undefined renders a plain avatar. */
  cosmetics?: EquippedCosmetics | null
  /** Draw the badge in the avatar's corner as well as beside the name. */
  showBadge?: boolean
  style?: CSSProperties
}

/**
 * High-fidelity composite avatar wearing equipped frames,
 * particle auras, and corner badges.
 */
export function DecoratedAvatar({
  cosmetics,
  showBadge = false,
  className,
  style,
  ...avatar
}: DecoratedAvatarProps) {
  const frame = cosmetics?.frame ?? null
  const effect = cosmetics?.avatar_effect ?? null
  const badge = showBadge ? (cosmetics?.badge ?? null) : null

  if (!frame && !badge && !effect) {
    return <Avatar {...avatar} className={className} />
  }

  return (
    <span className={cx(styles.decorated, className)} style={style}>
      <Avatar {...avatar} />
      {effect && <CosmeticAvatarEffect item={effect} />}
      {frame && <CosmeticFrame item={frame} />}
      {badge && (
        <span className={styles.badgeCorner} aria-hidden>
          <BadgeArt item={badge} />
        </span>
      )}
    </span>
  )
}
