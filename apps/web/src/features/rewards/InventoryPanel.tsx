import { useMemo, useState } from 'react'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  CosmeticBadge,
  CosmeticName,
  CosmeticTitle,
  DecoratedAvatar,
  ItemPreview,
} from '@/components/Cosmetics'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useCurrentUser } from '@/features/api'
import { cx } from '@/lib/cx'
import { errorText } from '@/lib/errors'

import type { EquipInput, EquippedCosmetics, InventoryItem, ItemType, StoreItem } from './api'
import { useEquipMutation, useEquippedQuery, useInventoryQuery } from './api'
import { slotLabel } from './slots'
import styles from './rewards.module.css'

const SLOT_FIELDS: Record<ItemType, keyof EquipInput> = {
  frame: 'frame_item_id',
  badge: 'badge_item_id',
  banner: 'banner_item_id',
  name_color: 'name_color_item_id',
  name_font: 'name_font_item_id',
  title: 'title_item_id',
  avatar_effect: 'avatar_effect_item_id',
  chat_bubble: 'chat_bubble_item_id',
}

const INVENTORY_CATEGORIES: Array<{ value: ItemType | 'all'; label: string }> = [
  { value: 'all', label: 'All Items' },
  { value: 'frame', label: 'Frames' },
  { value: 'avatar_effect', label: 'Avatar Effects' },
  { value: 'name_color', label: 'Name Colours' },
  { value: 'name_font', label: 'Typefaces' },
  { value: 'title', label: 'Titles' },
  { value: 'badge', label: 'Badges' },
  { value: 'chat_bubble', label: 'Chat Bubbles' },
  { value: 'banner', label: 'Banners' },
]

/** What you own, and what you are wearing right now across all 8 slots. */
export function InventoryPanel() {
  const inventory = useInventoryQuery()
  const equipped = useEquippedQuery()
  const [filter, setFilter] = useState<ItemType | 'all'>('all')

  if (inventory.isLoading) return <Skeleton height="18rem" />
  if (inventory.error) {
    return (
      <Callout tone="danger">{errorText(inventory.error, 'Could not load your items')}</Callout>
    )
  }

  const items = inventory.data ?? []

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: items.length }
    for (const entry of items) {
      map[entry.item.item_type] = (map[entry.item.item_type] ?? 0) + 1
    }
    return map
  }, [items])

  const filteredItems = filter === 'all' ? items : items.filter((i) => i.item.item_type === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Loadout />

      <div className={styles.filters}>
        {INVENTORY_CATEGORIES.map((cat) => {
          const count = categoryCounts[cat.value] ?? 0
          return (
            <Button
              key={cat.value}
              size="sm"
              variant={filter === cat.value ? 'primary' : 'secondary'}
              onClick={() => setFilter(cat.value)}
            >
              {cat.label} {count > 0 && <span style={{ opacity: 0.7, fontSize: '0.85em', marginLeft: 2 }}>({count})</span>}
            </Button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>
          You do not own anything yet. Earn points by checking in daily and inviting friends, then spend
          them in the store.
        </p>
      ) : filteredItems.length === 0 ? (
        <p className={styles.empty}>No items in this category yet.</p>
      ) : (
        <div className={styles.grid}>
          {filteredItems.map((entry) => (
            <InventoryCard
              key={entry.id}
              entry={entry}
              equipped={isEquipped(equipped.data, entry.item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** The live preview of everything worn at once, over all 8 slots. */
function Loadout() {
  const me = useCurrentUser()
  const equipped = useEquippedQuery()
  const equip = useEquipMutation()
  const toast = useToast()
  const worn = equipped.data

  const name = me.data?.profile?.display_name ?? me.data?.handle ?? 'You'

  async function unequipSlot(slot: ItemType) {
    const field = SLOT_FIELDS[slot]
    try {
      await equip.mutateAsync({ [field]: null } as EquipInput)
      toast.success(`${slotLabel(slot)} taken off`)
    } catch (cause) {
      toast.error('Could not take off item', errorText(cause))
    }
  }

  return (
    <section className={styles.loadout} aria-label="What you are wearing">
      <div className={styles.loadoutPreview}>
        <DecoratedAvatar
          name={name}
          src={me.data?.profile?.avatar_url}
          size="xl"
          cosmetics={worn}
          showBadge
        />
        <span className={styles.loadoutName}>
          <CosmeticName
            item={worn?.name_color}
            fontItem={worn?.name_font}
            fallbackColor={me.data?.profile?.accent_color}
          >
            {name}
          </CosmeticName>
          <CosmeticBadge item={worn?.badge} />
        </span>
        {worn?.title && <CosmeticTitle item={worn.title} />}
      </div>

      <div className={styles.loadoutSlots}>
        {(Object.keys(SLOT_FIELDS) as ItemType[]).map((slot) => {
          const item = worn?.[slotKey(slot)] ?? null
          return (
            <div key={slot} className={styles.slot}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={styles.slotLabel}>{slotLabel(slot)}</span>
                {item && (
                  <button
                    type="button"
                    onClick={() => void unequipSlot(slot)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: 'var(--text-2xs)',
                      color: 'var(--color-text-muted)',
                      textDecoration: 'underline',
                    }}
                    title={`Take off ${item.name}`}
                  >
                    Remove
                  </button>
                )}
              </div>
              <span className={cx(styles.slotValue, !item && styles.slotEmpty)}>
                {item ? item.name : 'Nothing equipped'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const RARITY_TONE = {
  common: 'neutral',
  rare: 'mint',
  epic: 'accent',
  legendary: 'danger',
} as const

function InventoryCard({ entry, equipped }: { entry: InventoryItem; equipped: boolean }) {
  const me = useCurrentUser()
  const equip = useEquipMutation()
  const toast = useToast()

  async function toggle() {
    const field = SLOT_FIELDS[entry.item.item_type]
    try {
      await equip.mutateAsync({ [field]: equipped ? null : entry.item.id } as EquipInput)
      toast.success(equipped ? `${entry.item.name} taken off` : `${entry.item.name} equipped`)
    } catch (cause) {
      toast.error('Could not change that', errorText(cause))
    }
  }

  return (
    <article className={cx(styles.card, equipped && styles.cardSelected)}>
      <ItemPreview
        item={entry.item}
        name={me.data?.profile?.display_name ?? me.data?.handle ?? 'You'}
        avatarUrl={me.data?.profile?.avatar_url}
        className={styles.cardPreview}
      />

      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardName}>{entry.item.name}</span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Badge tone={RARITY_TONE[entry.item.rarity]}>{entry.item.rarity}</Badge>
            {entry.source === 'grant' && <Badge tone="mint">Gift</Badge>}
          </div>
        </div>
        <p className={styles.cardDescription}>
          {entry.item.description || slotLabel(entry.item.item_type)}
        </p>
      </div>

      <div className={styles.cardFooter}>
        <span className={styles.rowMeta}>
          {entry.paid_points > 0 ? `Paid ${entry.paid_points.toLocaleString()}` : 'Free'}
        </span>
        <Button
          size="sm"
          variant={equipped ? 'secondary' : 'primary'}
          onClick={() => void toggle()}
          disabled={equip.isPending}
        >
          {equipped ? 'Take off' : 'Equip'}
        </Button>
      </div>
    </article>
  )
}

/** The `EquippedCosmetics` field for a slot. */
function slotKey(slot: ItemType): keyof Omit<EquippedCosmetics, 'user_id' | 'updated_at'> {
  return slot
}

function isEquipped(
  worn: EquippedCosmetics | undefined,
  item: StoreItem,
): boolean {
  if (!worn) return false
  return worn[slotKey(item.item_type)]?.id === item.id
}
