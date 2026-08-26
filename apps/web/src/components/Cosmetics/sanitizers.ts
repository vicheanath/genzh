import type { CosmeticStyle } from '@/features/rewards/api'
import { ANIMATIONS } from './constants'

/**
 * Whether an asset URL is one we are willing to point the browser at.
 */
export function safeAsset(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
  return /^https:\/\//i.test(trimmed) ? trimmed : null
}

/**
 * Validates and cleans colors, gradients, and CSS values so that
 * untrusted database style JSON can never inject malicious CSS or scripts.
 */
export function safePaint(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null
  if (!str) return null
  const trimmed = str.trim()
  if (!trimmed || trimmed.length > 400) return null
  if (/url\s*\(|expression\s*\(|[;{}<>]/i.test(trimmed)) return null
  return trimmed
}

/** The paint for an item: its gradient, else its flat colour, else nothing. */
export function paintOf(style: CosmeticStyle | undefined): string | null {
  return safePaint(style?.gradient) ?? safePaint(style?.color)
}

/** Returns the CSS animation class corresponding to a style's animation property. */
export function animationClass(style: CosmeticStyle | undefined): string | undefined {
  const key = typeof style?.animation === 'string' ? style.animation : undefined
  return key ? ANIMATIONS[key] : undefined
}

/** The emoji or short glyph an item draws when it has no artwork. */
export function glyphOf(style: CosmeticStyle | undefined): string | null {
  if (!style?.icon) return null
  const str = typeof style.icon === 'string' ? style.icon : String(style.icon)
  const trimmed = str.trim()
  return trimmed && trimmed.length <= 6 ? trimmed : null
}
