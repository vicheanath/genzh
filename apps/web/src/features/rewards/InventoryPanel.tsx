import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { CosmeticBadge, CosmeticName, DecoratedAvatar, ItemPreview } from '@/components/Cosmetics'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useCurrentUser } from '@/features/api'
import { cx } from '@/lib/cx'
import { errorText } from '@/lib/errors'

import type { EquipInput, InventoryItem, ItemType, StoreItem } from './api'
import { useEquipMutation, useEquippedQuery, useInventoryQuery } from './api'
import { slotLabel } from './slots'
import styles from './rewards.module.css'

const SLOT_FIELDS: Record<ItemType, keyof EquipInput> = {
  frame: 'frame_item_id',
  badge: 'badge_item_id',
  banner: 'banner_item_id',
  name_color: 'name_color_item_id',
}

/** What you own, and what you are wearing right now. */
export function InventoryPanel() {
  const inventory = useInventoryQuery()
  const equipped = useEquippedQuery()

  if (inventory.isLoading) return <Skeleton height="18rem" />
  if (inventory.error) {
    return (
      <Callout tone="danger">{errorText(inventory.error, 'Could not load your items')}</Callout>
    )
  }

  const items = inventory.data ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Loadout />

      {items.length === 0 ? (
        <p className={styles.empty}>
          You do not own anything yet. Earn points by checking in and inviting friends, then spend
          them in the store.
        </p>
      ) : (
        <div className={styles.grid}>
          {items.map((entry) => (
            <InventoryCard
              key={entry.id}
              entry={entry}
              // The inventory row's own `equipped` flag can lag a slot change by
              // one refetch, so the equipped query — which the mutation writes
              // straight into — is what the button reads.
              equipped={isEquipped(equipped.data, entry.item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** The live preview of everything worn at once, over the four slots. */
function Loadout() {
  const me = useCurrentUser()
  const equipped = useEquippedQuery()
  const worn = equipped.data

  const name = me.data?.profile?.display_name ?? me.data?.handle ?? 'You'

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
          <CosmeticName item={worn?.name_color} fallbackColor={me.data?.profile?.accent_color}>
            {name}
          </CosmeticName>
          <CosmeticBadge item={worn?.badge} />
        </span>
      </div>

      <div className={styles.loadoutSlots}>
        {(Object.keys(SLOT_FIELDS) as ItemType[]).map((slot) => {
          const item = worn?.[slotKey(slot)] ?? null
          return (
            <div key={slot} className={styles.slot}>
              <span className={styles.slotLabel}>{slotLabel(slot)}</span>
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
    <article className={styles.card}>
      <ItemPreview
        item={entry.item}
        name={me.data?.profile?.display_name ?? me.data?.handle ?? 'You'}
        avatarUrl={me.data?.profile?.avatar_url}
        className={styles.cardPreview}
      />

      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardName}>{entry.item.name}</span>
          {entry.source === 'grant' && <Badge tone="mint">Gift</Badge>}
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
function slotKey(slot: ItemType): 'frame' | 'badge' | 'banner' | 'name_color' {
  return slot === 'name_color' ? 'name_color' : slot
}

function isEquipped(
  worn: { frame: StoreItem | null; badge: StoreItem | null; banner: StoreItem | null; name_color: StoreItem | null } | undefined,
  item: StoreItem,
): boolean {
  if (!worn) return false
  return worn[slotKey(item.item_type)]?.id === item.id
}
