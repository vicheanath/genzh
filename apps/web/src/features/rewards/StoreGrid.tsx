import { useMemo, useState } from 'react'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  CosmeticBadge,
  CosmeticChatBubble,
  CosmeticName,
  CosmeticTitle,
  DecoratedAvatar,
  ItemPreview,
} from '@/components/Cosmetics'
import { GemIcon, SparklesIcon, XIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Skeleton } from '@/components/Skeleton'
import { Toggle, ToggleGroup } from '@/components/ToggleGroup'
import { Tooltip } from '@/components/Tooltip'
import { useToast } from '@/components/Toast'
import { useCurrentUser } from '@/features/api'
import { errorText } from '@/lib/errors'
import { cx } from '@/lib/cx'

import type { EquippedCosmetics, ItemRarity, ItemType, StoreListing } from './api'
import { useBalanceQuery, useEquippedQuery, usePurchaseMutation, useStoreItemsQuery } from './api'
import { slotLabel } from './slots'
import styles from './rewards.module.css'

const SLOTS: Array<{ value: ItemType | 'all'; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'frame', label: 'Frames' },
  { value: 'avatar_effect', label: 'Avatar Effects' },
  { value: 'name_color', label: 'Name Colours' },
  { value: 'name_font', label: 'Typefaces' },
  { value: 'title', label: 'Titles' },
  { value: 'badge', label: 'Badges' },
  { value: 'chat_bubble', label: 'Chat Bubbles' },
  { value: 'banner', label: 'Banners' },
]

const RARITIES: Array<{ value: ItemRarity | 'all'; label: string }> = [
  { value: 'all', label: 'All Rarities' },
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'legendary', label: 'Legendary' },
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

/** The catalog, filtered by slot and rarity, with live try-on and purchase on every tile. */
export function StoreGrid() {
  const [slot, setSlot] = useState<ItemType | 'all'>('all')
  const [rarity, setRarity] = useState<ItemRarity | 'all'>('all')
  const [search, setSearch] = useState('')
  const [tryOnItem, setTryOnItem] = useState<StoreListing | null>(null)

  const items = useStoreItemsQuery('all')

  const slotCounts = useMemo(() => {
    const map: Record<string, number> = { all: items.data?.length ?? 0 }
    if (items.data) {
      for (const item of items.data) {
        map[item.item_type] = (map[item.item_type] ?? 0) + 1
      }
    }
    return map
  }, [items.data])

  const filteredItems = useMemo(() => {
    if (!items.data) return []
    let list = items.data
    if (slot !== 'all') {
      list = list.filter((i) => i.item_type === slot)
    }
    if (rarity !== 'all') {
      list = list.filter((i) => i.rarity === rarity)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
      )
    }
    return list
  }, [items.data, slot, rarity, search])

  return (
    <div className={styles.stack}>
      {/* Search & Slot Filters */}
      <div className={styles.filterRow}>
        <div className={styles.searchField}>
          <Input
            label="Search items"
            placeholder="Search cosmetics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ToggleGroup
          variant="loose"
          size="sm"
          aria-label="Filter by item type"
          className={styles.filters}
          value={[slot]}
          onValueChange={(next) => setSlot((next[0] as ItemType | 'all' | undefined) ?? 'all')}
        >
          {SLOTS.map((option) => {
            const count = slotCounts[option.value] ?? 0
            return (
              <Toggle key={option.value} value={option.value}>
                {option.label} {count > 0 && <span className={styles.countBadge}>({count})</span>}
              </Toggle>
            )
          })}
        </ToggleGroup>
      </div>

      {/* Rarity Pills */}
      <ToggleGroup
        variant="loose"
        size="sm"
        aria-label="Filter by rarity"
        value={[rarity]}
        onValueChange={(next) => setRarity((next[0] as ItemRarity | 'all' | undefined) ?? 'all')}
      >
        {RARITIES.map((r) => (
          <Toggle key={r.value} value={r.value}>
            {r.label}
          </Toggle>
        ))}
      </ToggleGroup>

      {/* Try-on banner preview when active */}
      {tryOnItem && <TryOnPreview item={tryOnItem} onClose={() => setTryOnItem(null)} />}

      {items.isLoading && (
        <div className={styles.grid}>
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} height="15rem" />
          ))}
        </div>
      )}

      {items.error && (
        <Callout tone="danger">{errorText(items.error, 'Could not load the store')}</Callout>
      )}

      {!items.isLoading && filteredItems.length === 0 && (
        <p className={styles.empty}>
          {search || rarity !== 'all'
            ? 'No cosmetics matched your filter. Try adjusting your search.'
            : 'Nothing in the store yet. New cosmetics land here as they are released.'}
        </p>
      )}

      {filteredItems.length > 0 && (
        <div className={styles.grid}>
          {filteredItems.map((item) => (
            <StoreCard
              key={item.id}
              item={item}
              isTryingOn={tryOnItem?.id === item.id}
              onTryOn={() => setTryOnItem((cur) => (cur?.id === item.id ? null : item))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TryOnPreview({ item, onClose }: { item: StoreListing; onClose: () => void }) {
  const me = useCurrentUser()
  const equipped = useEquippedQuery()
  const name = me.data?.profile?.display_name ?? me.data?.handle ?? 'You'

  // Construct virtual worn state applying the item on top of current loadout
  const previewWorn: EquippedCosmetics = {
    user_id: me.data?.id ?? '',
    frame: item.item_type === 'frame' ? item : (equipped.data?.frame ?? null),
    badge: item.item_type === 'badge' ? item : (equipped.data?.badge ?? null),
    banner: item.item_type === 'banner' ? item : (equipped.data?.banner ?? null),
    name_color: item.item_type === 'name_color' ? item : (equipped.data?.name_color ?? null),
    name_font: item.item_type === 'name_font' ? item : (equipped.data?.name_font ?? null),
    title: item.item_type === 'title' ? item : (equipped.data?.title ?? null),
    avatar_effect: item.item_type === 'avatar_effect' ? item : (equipped.data?.avatar_effect ?? null),
    chat_bubble: item.item_type === 'chat_bubble' ? item : (equipped.data?.chat_bubble ?? null),
    updated_at: null,
  }

  return (
    <div className={styles.spotlightPanel}>
      <div className={styles.spotlightHeader}>
        <div className={styles.spotlightHeading}>
          <SparklesIcon size={16} />
          <strong>Trying on: {item.name}</strong>
          <Badge tone={RARITY_TONE[item.rarity]}>{item.rarity}</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close try-on">
          <XIcon size={14} /> Close
        </Button>
      </div>

      <div className={styles.tryOnGrid}>
        <div className={styles.tryOnIdentity}>
          <DecoratedAvatar
            name={name}
            src={me.data?.profile?.avatar_url}
            size="lg"
            cosmetics={previewWorn}
            showBadge
          />
          <div className={styles.tryOnNameColumn}>
            <div className={styles.tryOnNameRow}>
              <CosmeticName
                item={previewWorn.name_color}
                fontItem={previewWorn.name_font}
                fallbackColor={me.data?.profile?.accent_color}
              >
                {name}
              </CosmeticName>
              <CosmeticBadge item={previewWorn.badge} />
            </div>
            {previewWorn.title && <CosmeticTitle item={previewWorn.title} />}
          </div>
        </div>

        <CosmeticChatBubble item={previewWorn.chat_bubble}>
          <div className={styles.tryOnMessage}>
            This is a preview of your chat message with <strong>{item.name}</strong>!
          </div>
        </CosmeticChatBubble>
      </div>
    </div>
  )
}

function StoreCard({
  item,
  isTryingOn,
  onTryOn,
}: {
  item: StoreListing
  isTryingOn: boolean
  onTryOn: () => void
}) {
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
      toast.success(`${item.name} is yours!`, 'Equip it from your inventory tab.')
    } catch (cause) {
      toast.error('Could not buy that', errorText(cause))
    }
  }

  return (
    <article className={cx(styles.card, RARITY_CLASS[item.rarity], isTryingOn && styles.cardSelected)}>
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

        <div className={styles.badgeRow}>
          <Tooltip content="Try this on your avatar and name">
            <Button size="sm" variant={isTryingOn ? 'primary' : 'ghost'} onClick={onTryOn}>
              {isTryingOn ? 'Trying' : 'Try on'}
            </Button>
          </Tooltip>

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
      </div>
    </article>
  )
}
