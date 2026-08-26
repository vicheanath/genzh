import type { CSSProperties, ReactNode } from 'react'

import { Avatar, type AvatarProps } from '@/components/Avatar'
import type { CosmeticStyle, EquippedCosmetics, StoreItem } from '@/features/rewards/api'
import { cx } from '@/lib/cx'

import styles from './cosmetics.module.css'

/**
 * Rendering an item somebody bought.
 *
 * Everything an item looks like arrives as JSON that staff typed into the
 * console. That is untrusted text as far as this file is concerned, so it
 * reaches the page only as the *value* of a custom property on an inline
 * `style` — never as a class name, never as markup, and never as a URL the
 * browser will fetch without checking. An item with rubbish in its config
 * renders plainly; it does not restyle the app around it.
 */

/** Animation keys the stylesheet actually implements. Anything else is ignored. */
const ANIMATIONS: Record<string, string | undefined> = {
  pulse: styles.animPulse,
  spin: styles.animSpin,
  aurora: styles.animAurora,
  shimmer: styles.animShimmer,
}

/**
 * Whether an asset URL is one we are willing to point the browser at.
 *
 * Same-origin paths and plain https only. It rules out `javascript:` and
 * `data:` — the two that turn an image field into script — and keeps a broken
 * value rendering as the item's colours instead.
 */
function safeAsset(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
  return /^https:\/\//i.test(trimmed) ? trimmed : null
}

/**
 * Whether a colour or gradient is safe to paint with.
 *
 * A CSS value can smuggle a fetch through `url(...)`, so anything containing
 * one is refused, along with the characters that would end the declaration and
 * start another.
 */
function safePaint(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 400) return null
  if (/url\s*\(|expression\s*\(|[;{}<>]/i.test(trimmed)) return null
  return trimmed
}

/** The paint for an item: its gradient, else its flat colour, else nothing. */
function paintOf(style: CosmeticStyle | undefined): string | null {
  return safePaint(style?.gradient) ?? safePaint(style?.color)
}

function animationClass(style: CosmeticStyle | undefined): string | undefined {
  const key = typeof style?.animation === 'string' ? style.animation : undefined
  return key ? ANIMATIONS[key] : undefined
}

/** The emoji or short glyph an item draws when it has no artwork. */
function glyphOf(style: CosmeticStyle | undefined): string | null {
  const icon = typeof style?.icon === 'string' ? style.icon.trim() : ''
  // A glyph, not a label: anything longer is a mis-filled field, and drawing
  // it would push the name it sits beside off the row.
  return icon && icon.length <= 4 ? icon : null
}

// ── the decorated avatar ───────────────────────────────────────────────────

export interface DecoratedAvatarProps extends AvatarProps {
  /** What this person is wearing. Undefined renders a plain avatar. */
  cosmetics?: EquippedCosmetics | null
  /** Draw the badge in the avatar's corner as well as beside the name. */
  showBadge?: boolean
}

/**
 * An avatar wearing whatever its owner equipped.
 *
 * Falls back to the plain [`Avatar`] when there is nothing to draw, so every
 * call site can use this unconditionally rather than branching on whether the
 * person happens to own a frame.
 */
export function DecoratedAvatar({
  cosmetics,
  showBadge = false,
  className,
  ...avatar
}: DecoratedAvatarProps) {
  const frame = cosmetics?.frame ?? null
  const badge = showBadge ? (cosmetics?.badge ?? null) : null

  if (!frame && !badge) return <Avatar {...avatar} className={className} />

  return (
    <span className={cx(styles.decorated, className)}>
      <Avatar {...avatar} />
      {frame && <CosmeticFrame item={frame} />}
      {badge && (
        <span className={styles.badgeCorner} aria-hidden>
          <BadgeArt item={badge} />
        </span>
      )}
    </span>
  )
}

/** The ring itself: artwork if the item has any, colours if it does not. */
function CosmeticFrame({ item }: { item: StoreItem }) {
  const asset = safeAsset(item.asset_url)
  const animation = animationClass(item.style_config)

  if (asset) {
    return (
      <span className={cx(styles.frame, animation)} aria-hidden>
        <img src={asset} alt="" className={styles.frameImage} />
      </span>
    )
  }

  const paint = paintOf(item.style_config)
  const glow = safePaint(item.style_config?.glow)
  if (!paint && !glow) return null

  return (
    <span className={cx(styles.frame, animation)} aria-hidden>
      <span
        className={styles.frameRing}
        style={
          {
            '--frame-paint': paint ?? 'var(--color-accent)',
            '--frame-glow': glow ?? 'transparent',
          } as CSSProperties
        }
      />
    </span>
  )
}

// ── the badge ──────────────────────────────────────────────────────────────

/** A badge on its own, for the row beside a display name. */
export function CosmeticBadge({
  item,
  className,
}: {
  item: StoreItem | null | undefined
  className?: string
}) {
  if (!item) return null
  return (
    <span className={cx(styles.badge, className)} title={item.name}>
      <BadgeArt item={item} />
    </span>
  )
}

function BadgeArt({ item }: { item: StoreItem }) {
  const asset = safeAsset(item.asset_url)
  const glow = safePaint(item.style_config?.glow)
  const animation = animationClass(item.style_config)
  const style = { '--badge-glow': glow ?? 'transparent' } as CSSProperties

  if (asset) {
    return (
      <img src={asset} alt="" className={cx(styles.badgeImage, animation)} style={style} />
    )
  }

  const glyph = glyphOf(item.style_config)
  return (
    <span className={animation} style={style} aria-hidden>
      {/* A dot is the honest fallback: the item exists and is worn, and
          nothing in it says what to draw. */}
      {glyph ?? '●'}
    </span>
  )
}

// ── the name ───────────────────────────────────────────────────────────────

export interface CosmeticNameProps {
  children: ReactNode
  /** The name-colour item, if one is worn. */
  item?: StoreItem | null
  className?: string
  /** The accent to fall back to when nothing is worn. */
  fallbackColor?: string | null
}

/**
 * A display name painted with whatever name colour its owner equipped.
 *
 * Renders plain text when nothing is worn, so a member list can wrap every name
 * in this without checking first.
 */
export function CosmeticName({
  children,
  item,
  className,
  fallbackColor,
}: CosmeticNameProps) {
  const paint = item ? paintOf(item.style_config) : null
  const shadow = item ? safePaint(item.style_config?.textShadow as string | undefined) : null

  if (!paint) {
    return (
      <span
        className={cx(styles.name, className)}
        style={fallbackColor ? ({ '--name-flat': fallbackColor } as CSSProperties) : undefined}
      >
        {children}
      </span>
    )
  }

  return (
    <span
      className={cx(styles.name, styles.nameGradient, className, animationClass(item?.style_config))}
      style={
        {
          '--name-paint': paint,
          // Under the painted text, for engines that drop background-clip.
          '--name-flat': safePaint(item?.style_config?.color) ?? 'var(--color-text)',
          '--name-shadow': shadow ?? 'none',
        } as CSSProperties
      }
    >
      {children}
    </span>
  )
}

// ── the banner ─────────────────────────────────────────────────────────────

/** The wide image across the top of a profile card. */
export function CosmeticBanner({
  item,
  className,
}: {
  item: StoreItem | null | undefined
  className?: string
}) {
  if (!item) return null
  const asset = safeAsset(item.asset_url)
  if (asset) {
    return <img src={asset} alt="" className={cx(styles.bannerImage, className)} />
  }

  const paint = paintOf(item.style_config) ?? safePaint(item.style_config?.background)
  if (!paint) return null
  return (
    <div
      className={cx(styles.banner, className, animationClass(item.style_config))}
      style={{ '--banner-paint': paint } as CSSProperties}
      aria-hidden
    />
  )
}

// ── the preview tile ───────────────────────────────────────────────────────

/**
 * One item shown on its own, on a neutral tile.
 *
 * Used by the store and by the console's editor, which is the point: staff see
 * exactly what a shopper will see, before anybody has bought it.
 */
export function ItemPreview({
  item,
  name = 'You',
  avatarUrl,
  className,
}: {
  item: StoreItem
  /** Whose name and face to preview against. */
  name?: string
  avatarUrl?: string | null
  className?: string
}) {
  if (item.item_type === 'banner') {
    return (
      <div className={cx(styles.preview, styles.previewBanner, className)}>
        <CosmeticBanner item={item} />
      </div>
    )
  }

  if (item.item_type === 'name_color') {
    return (
      <div className={cx(styles.preview, className)}>
        <CosmeticName item={item} className={styles.previewName}>
          {name}
        </CosmeticName>
      </div>
    )
  }

  const worn: EquippedCosmetics = {
    user_id: '',
    frame: item.item_type === 'frame' ? item : null,
    badge: item.item_type === 'badge' ? item : null,
    banner: null,
    name_color: null,
    updated_at: null,
  }

  return (
    <div className={cx(styles.preview, className)}>
      <DecoratedAvatar name={name} src={avatarUrl} size="xl" cosmetics={worn} showBadge />
    </div>
  )
}
