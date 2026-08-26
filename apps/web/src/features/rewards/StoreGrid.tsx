import { useState } from 'react'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { ItemPreview } from '@/components/Cosmetics'
import { GemIcon } from '@/components/Icons'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useCurrentUser } from '@/features/api'
import { errorText } from '@/lib/errors'
import { cx } from '@/lib/cx'

import type { ItemRarity, ItemType, StoreListing } from './api'
import { useBalanceQuery, usePurchaseMutation, useStoreItemsQuery } from './api'
import { slotLabel } from './slots'
import styles from './rewards.module.css'

const SLOTS: Array<{ value: ItemType | 'all'; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'frame', label: 'Avatar frames' },
  { value: 'badge', label: 'Badges' },
  { value: 'name_color', label: 'Name colours' },
  { value: 'banner', label: 'Banners' },
]

const RARITY_CLASS: Record<ItemRarity, string | undefined> = {
  common: styles.cardCommon,
  rare: styles.cardRare,
  epic: styles.cardEpic,
  legendary: styles.cardLegendary,
}

const RARITY_TONE = {
  common: 'neutral',
  rare: 'mint',
  epic: 'accent',
  legendary: 'danger',
} as const

/** The catalog, filtered by slot, with a buy button on every tile. */
export function StoreGrid() {
  const [slot, setSlot] = useState<ItemType | 'all'>('all')
  const items = useStoreItemsQuery(slot)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div className={styles.filters}>
        {SLOTS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={slot === option.value ? 'primary' : 'secondary'}
            onClick={() => setSlot(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {items.isLoading && (
        <div className={styles.grid}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height="15rem" />
          ))}
        </div>
      )}

      {items.error && (
        <Callout tone="danger">{errorText(items.error, 'Could not load the store')}</Callout>
      )}

      {items.data?.length === 0 && (
        <p className={styles.empty}>
          {/* An empty catalog is a real state here, not a failure: nothing is
              seeded, so the store is empty until staff add something to it. */}
          Nothing in the store yet. New cosmetics land here as they are released.
        </p>
      )}

      {items.data && items.data.length > 0 && (
        <div className={styles.grid}>
          {items.data.map((item) => (
            <StoreCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function StoreCard({ item }: { item: StoreListing }) {
  const balance = useBalanceQuery()
  const purchase = usePurchaseMutation()
  const me = useCurrentUser()
  const toast = useToast()

  const points = balance.data?.balance ?? 0
  const affordable = points >= item.price_points
  const soldOut = !item.in_stock && !item.owned

  async function buy() {
    try {
      await purchase.mutateAsync(item.id)
      toast.success(`${item.name} is yours`, 'Equip it from your inventory.')
    } catch (cause) {
      toast.error('Could not buy that', errorText(cause))
    }
  }

  return (
    <article className={cx(styles.card, RARITY_CLASS[item.rarity])}>
      <ItemPreview
        item={item}
        name={me.data?.profile?.display_name ?? me.data?.handle ?? 'You'}
        avatarUrl={me.data?.profile?.avatar_url}
        className={styles.cardPreview}
      />

      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardName}>{item.name}</span>
          <Badge tone={RARITY_TONE[item.rarity]}>{item.rarity}</Badge>
        </div>
        <p className={styles.cardDescription}>{item.description || slotLabel(item.item_type)}</p>
        {item.is_limited && item.stock_limit !== null && (
          <span className={styles.rowMeta}>
            {Math.max(0, item.stock_limit - item.owned_count)} of {item.stock_limit} left
          </span>
        )}
      </div>

      <div className={styles.cardFooter}>
        <span className={cx(styles.price, item.price_points === 0 && styles.priceFree)}>
          {item.price_points === 0 ? (
            'Free'
          ) : (
            <>
              <GemIcon size={14} /> {item.price_points.toLocaleString()}
            </>
          )}
        </span>

        {item.owned ? (
          <Badge tone="success">{item.equipped ? 'Equipped' : 'Owned'}</Badge>
        ) : (
          <Button
            size="sm"
            onClick={() => void buy()}
            disabled={purchase.isPending || !affordable || soldOut}
          >
            {soldOut
              ? 'Sold out'
              : purchase.isPending
                ? 'Buying…'
                : affordable
                  ? 'Buy'
                  : `Need ${(item.price_points - points).toLocaleString()}`}
          </Button>
        )}
      </div>
    </article>
  )
}
