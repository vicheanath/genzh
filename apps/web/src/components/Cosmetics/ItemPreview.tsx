import type { EquippedCosmetics, StoreItem } from '@/features/rewards/api'
import { cx } from '@/lib/cx'

import { CosmeticBanner } from './CosmeticBanner'
import { CosmeticChatBubble } from './CosmeticChatBubble'
import { CosmeticName } from './CosmeticName'
import { CosmeticTitle } from './CosmeticTitle'
import { DecoratedAvatar } from './DecoratedAvatar'
import styles from './cosmetics.module.css'

export interface ItemPreviewProps {
  item: StoreItem
  name?: string
  avatarUrl?: string | null
  className?: string
}

/**
 * Preview tile for store cards, inventory details, and admin inspector.
 */
export function ItemPreview({
  item,
  name = 'You',
  avatarUrl,
  className,
}: ItemPreviewProps) {
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

  if (item.item_type === 'name_font') {
    return (
      <div className={cx(styles.preview, className)}>
        <CosmeticName fontItem={item} className={styles.previewName}>
          {name}
        </CosmeticName>
      </div>
    )
  }

  if (item.item_type === 'title') {
    return (
      <div className={cx(styles.preview, styles.previewTitle, className)}>
        <CosmeticTitle item={item} />
      </div>
    )
  }

  if (item.item_type === 'chat_bubble') {
    return (
      <div className={cx(styles.preview, className)}>
        <div className={styles.previewBubble}>
          <CosmeticChatBubble item={item}>
            <div style={{ fontSize: 'var(--text-xs)', opacity: 0.9 }}>
              Hey! This is how your chat messages will look in rooms.
            </div>
          </CosmeticChatBubble>
        </div>
      </div>
    )
  }

  const worn: EquippedCosmetics = {
    user_id: '',
    frame: item.item_type === 'frame' ? item : null,
    badge: item.item_type === 'badge' ? item : null,
    banner: null,
    name_color: null,
    name_font: null,
    title: null,
    avatar_effect: item.item_type === 'avatar_effect' ? item : null,
    chat_bubble: null,
    updated_at: null,
  }

  return (
    <div className={cx(styles.preview, className)}>
      <DecoratedAvatar name={name} src={avatarUrl} size="xl" cosmetics={worn} showBadge />
    </div>
  )
}
