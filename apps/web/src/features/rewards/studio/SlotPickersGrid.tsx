import { Badge } from '@/components/Badge'
import { PackageIcon } from '@/components/Icons'
import { Select } from '@/components/Select'

import type { ItemType, StoreItem, StoreListing } from '../api'
import { slotLabel } from '../slots'

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
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <PackageIcon size={16} /> Customize Every Slot
      </h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
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
            <div
              key={slot}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
                padding: 'var(--space-3)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md, 0.5rem)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                  {slotLabel(slot)}
                </span>
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
