import { Badge } from '@/components/Badge'
import { PackageIcon } from '@/components/Icons'
import { Select } from '@/components/Select'

import type { ItemType, StoreItem, StoreListing } from '../api'
import { slotLabel } from '../slots'
import styles from '../rewards.module.css'

export interface SlotPickersGridProps {
  itemsBySlot: Record<ItemType, StoreListing[]>
  allItems: StoreListing[]
  studioWorn: Record<ItemType, StoreItem | null>
  onSlotChange: (slot: ItemType, item: StoreItem | null) => void
}

const ALL_SLOTS: ItemType[] = [
  'frame',
  'avatar_effect',
  'name_color',
  'name_font',
  'title',
  'badge',
  'chat_bubble',
  'banner',
]

/**
 * Fine-grained slot selection grid for all 8 cosmetic categories.
 */
export function SlotPickersGrid({
  itemsBySlot,
  allItems,
  studioWorn,
  onSlotChange,
}: SlotPickersGridProps) {
  return (
    <section className={styles.sectionStack}>
      <h3 className={styles.panelTitle}>
        <PackageIcon size={16} /> Customize Every Slot
      </h3>

      <div className={styles.slotPickerGrid}>
        {ALL_SLOTS.map((slot) => {
          const list = itemsBySlot[slot] ?? []
          const currentSelected = studioWorn[slot]
          const options = [
            { value: 'none', label: '— None —' },
            ...list.map((item) => ({
              value: item.id,
              label: `${item.name}${item.owned ? ' (Owned)' : ` (${item.price_points} pts)`}`,
            })),
          ]

          return (
            <div key={slot} className={styles.slotPickerCard}>
              <div className={styles.cardTitleRow}>
                <span className={styles.slotPickerLabel}>{slotLabel(slot)}</span>
                {currentSelected && (
                  <Badge tone={currentSelected.price_points === 0 ? 'neutral' : 'accent'}>
                    {currentSelected.rarity}
                  </Badge>
                )}
              </div>

              <Select
                aria-label={slotLabel(slot)}
                value={currentSelected?.id ?? 'none'}
                onValueChange={(val) => {
                  const picked = val === 'none' ? null : allItems.find((i) => i.id === val) ?? null
                  onSlotChange(slot, picked)
                }}
                options={options}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
