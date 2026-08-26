import type { CSSProperties } from 'react'

import type { StoreItem } from '@/features/rewards/api'
import { cx } from '@/lib/cx'

import { EFFECT_ANIMATION_CLASSES, PARTICLE_SYMBOLS } from './constants'
import styles from './cosmetics.module.css'
import { glyphOf, safePaint } from './sanitizers'

export interface CosmeticAvatarEffectProps {
  item: StoreItem | null | undefined
  className?: string
}

/**
 * Avatar particle aura engine supporting 10+ dynamic physics animations
 * (sparkles, flames, dragon ki, sakura, void vortex, lightning, ghost wisps, snow, hearts, orbit).
 */
export function CosmeticAvatarEffect({ item, className }: CosmeticAvatarEffectProps) {
  if (!item) return null

  const effectType = typeof item.style_config?.effect === 'string' ? item.style_config.effect : 'sparkles'
  const count = Math.min(Math.max(Number(item.style_config?.particles) || 6, 2), 12)
  const color = safePaint(item.style_config?.color) ?? 'inherit'
  const glow = safePaint(item.style_config?.glow) ?? color
  const symbol = glyphOf(item.style_config) ?? PARTICLE_SYMBOLS[effectType] ?? '✦'
  const animClass = EFFECT_ANIMATION_CLASSES[effectType] ?? styles.particleSparkle

  // Deterministically position particles around the avatar with staggered delays & dynamic radii
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI
    const radiusPct = 48 + (i % 2 === 0 ? 4 : -4)
    const left = 50 + radiusPct * Math.cos(angle)
    const top = 50 + radiusPct * Math.sin(angle)
    const delay = (i * 0.32) % 2.8
    const sizeEm = 0.75 + ((i * 3) % 4) * 0.12

    return {
      id: i,
      style: {
        left: `${left}%`,
        top: `${top}%`,
        fontSize: `${sizeEm}rem`,
        animationDelay: `${delay}s`,
        color,
        '--particle-glow': glow,
      } as CSSProperties,
    }
  })

  return (
    <div className={cx(styles.effectLayer, className)} aria-hidden>
      {particles.map((p) => (
        <span key={p.id} className={cx(styles.particle, styles.particleGlow, animClass)} style={p.style}>
          {symbol}
        </span>
      ))}
    </div>
  )
}
