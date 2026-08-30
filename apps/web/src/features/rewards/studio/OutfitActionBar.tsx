import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CheckIcon, GemIcon } from '@/components/Icons'
import { cx } from '@/lib/cx'

import type { StoreListing } from '../api'
import styles from '../rewards.module.css'

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
    <section className={cx(styles.spotlightPanel, styles.spotlightPanelRow)}>
      <div className={styles.actionBarInfo}>
        <div className={styles.spotlightHeading}>
          <strong>Ready to wear this outfit?</strong>
          {unownedItems.length === 0 ? (
            <Badge tone="success">All items owned</Badge>
          ) : (
            <Badge tone="danger">
              {unownedItems.length} item{unownedItems.length === 1 ? '' : 's'} to unlock
            </Badge>
          )}
        </div>
        <span className={cx(styles.tryOnMessage, styles.mutedText)}>
          {unownedItems.length === 0
            ? 'You already own everything in this outfit.'
            : `Total cost to unlock missing items: ${totalPointsNeeded.toLocaleString()} points (Your balance: ${balance.toLocaleString()})`}
        </span>
      </div>

      <div className={styles.actionBarButtons}>
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
