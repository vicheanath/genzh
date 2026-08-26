import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CheckIcon, GemIcon } from '@/components/Icons'

import type { StoreListing } from '../api'

export interface OutfitActionBarProps {
  unownedItems: StoreListing[]
  totalPointsNeeded: number
  balance: number
  isEquipping: boolean
  isBuyingAll: boolean
  onEquipAll: () => void
  onBuyAndEquip: () => void
}

/**
 * Action footer allowing 1-click equipping of owned items or instant bundle purchase.
 */
export function OutfitActionBar({
  unownedItems,
  totalPointsNeeded,
  balance,
  isEquipping,
  isBuyingAll,
  onEquipAll,
  onBuyAndEquip,
}: OutfitActionBarProps) {
  const canAffordAll = balance >= totalPointsNeeded

  return (
    <section
      style={{
        padding: 'var(--space-4) var(--space-5)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-accent)',
        borderRadius: 'var(--radius-lg, 0.75rem)',
        boxShadow: 'var(--glow-accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <strong>Ready to wear this outfit?</strong>
          {unownedItems.length === 0 ? (
            <Badge tone="success">All items owned</Badge>
          ) : (
            <Badge tone="danger">
              {unownedItems.length} item{unownedItems.length === 1 ? '' : 's'} to unlock
            </Badge>
          )}
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {unownedItems.length === 0
            ? 'You already own everything in this outfit.'
            : `Total cost to unlock missing items: ${totalPointsNeeded.toLocaleString()} points (Your balance: ${balance.toLocaleString()})`}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        {unownedItems.length === 0 ? (
          <Button size="sm" onClick={onEquipAll} disabled={isEquipping}>
            <CheckIcon size={15} /> Equip Entire Outfit
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onBuyAndEquip}
            disabled={isBuyingAll || !canAffordAll}
          >
            <GemIcon size={14} />
            {isBuyingAll
              ? 'Unlocking & Equipping…'
              : canAffordAll
                ? `Unlock & Equip All (${totalPointsNeeded.toLocaleString()} pts)`
                : `Need ${(totalPointsNeeded - balance).toLocaleString()} more pts`}
          </Button>
        )}
      </div>
    </section>
  )
}
