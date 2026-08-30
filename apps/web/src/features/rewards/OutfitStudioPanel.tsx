import { useMemo, useState } from 'react'

import { Callout } from '@/components/Callout'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useCurrentUser } from '@/features/api'
import { errorText } from '@/lib/errors'

import styles from './rewards.module.css'

import type { EquipInput, EquippedCosmetics, ItemType, StoreItem, StoreListing } from './api'
import {
  groupBySlot,
  useBalanceQuery,
  useEquipMutation,
  useEquippedQuery,
  usePurchaseMutation,
  useStoreItemsQuery,
} from './api'
import {
  ChatBubbleSandbox,
  OutfitActionBar,
  OutfitStudioStage,
  PresetThemesGrid,
  SlotPickersGrid,
  type OutfitPreset,
} from './studio'

/**
 * Outfit Studio: Interactive fitting room and outfit sandbox orchestrator.
 */
export function OutfitStudioPanel() {
  const me = useCurrentUser()
  const balance = useBalanceQuery()
  const equipped = useEquippedQuery()
  const storeQuery = useStoreItemsQuery('all')
  const equipMutation = useEquipMutation()
  const purchaseMutation = usePurchaseMutation()
  const toast = useToast()

  const allItems = storeQuery.data ?? []
  const itemsBySlot = useMemo(() => groupBySlot(allItems), [allItems])
  const itemsBySku = useMemo(() => {
    const map = new Map<string, StoreListing>()
    for (const item of allItems) map.set(item.sku, item)
    return map
  }, [allItems])

  // Studio custom outfit state
  const [studioWorn, setStudioWorn] = useState<Record<ItemType, StoreItem | null>>(() => ({
    frame: equipped.data?.frame ?? null,
    avatar_effect: equipped.data?.avatar_effect ?? null,
    name_color: equipped.data?.name_color ?? null,
    name_font: equipped.data?.name_font ?? null,
    title: equipped.data?.title ?? null,
    badge: equipped.data?.badge ?? null,
    chat_bubble: equipped.data?.chat_bubble ?? null,
    banner: equipped.data?.banner ?? null,
  }))

  const [testMessage, setTestMessage] = useState('Hey everyone! Testing my brand new outfit style in chat ✨')
  const [buyingAll, setBuyingAll] = useState(false)

  const name = me.data?.profile?.display_name ?? me.data?.handle ?? 'You'

  // Current preview loadout composite
  const previewLoadout: EquippedCosmetics = {
    user_id: me.data?.id ?? '',
    frame: studioWorn.frame,
    avatar_effect: studioWorn.avatar_effect,
    name_color: studioWorn.name_color,
    name_font: studioWorn.name_font,
    title: studioWorn.title,
    badge: studioWorn.badge,
    chat_bubble: studioWorn.chat_bubble,
    banner: studioWorn.banner,
    updated_at: null,
  }

  // Calculate unowned items in current custom look
  const unownedItems = useMemo(() => {
    const list: StoreListing[] = []
    const slots: ItemType[] = [
      'frame',
      'avatar_effect',
      'name_color',
      'name_font',
      'title',
      'badge',
      'chat_bubble',
      'banner',
    ]
    for (const slot of slots) {
      const item = studioWorn[slot]
      if (item) {
        const listing = itemsBySku.get(item.sku)
        if (listing && !listing.owned) {
          list.push(listing)
        }
      }
    }
    return list
  }, [studioWorn, itemsBySku])

  const totalPointsNeeded = unownedItems.reduce((sum, item) => sum + item.price_points, 0)

  function applyPreset(preset: OutfitPreset) {
    setStudioWorn({
      frame: (preset.skus.frame ? itemsBySku.get(preset.skus.frame) : null) ?? null,
      avatar_effect: (preset.skus.avatar_effect ? itemsBySku.get(preset.skus.avatar_effect) : null) ?? null,
      name_color: (preset.skus.name_color ? itemsBySku.get(preset.skus.name_color) : null) ?? null,
      name_font: (preset.skus.name_font ? itemsBySku.get(preset.skus.name_font) : null) ?? null,
      title: (preset.skus.title ? itemsBySku.get(preset.skus.title) : null) ?? null,
      badge: (preset.skus.badge ? itemsBySku.get(preset.skus.badge) : null) ?? null,
      chat_bubble: (preset.skus.chat_bubble ? itemsBySku.get(preset.skus.chat_bubble) : null) ?? null,
      banner: (preset.skus.banner ? itemsBySku.get(preset.skus.banner) : null) ?? null,
    })
    toast.success(`Theme Applied: ${preset.name}`)
  }

  function randomizeOutfit() {
    const randomPick = (slot: ItemType): StoreItem | null => {
      const list = itemsBySlot[slot] ?? []
      if (list.length === 0) return null
      return list[Math.floor(Math.random() * list.length)] ?? null
    }

    setStudioWorn({
      frame: randomPick('frame'),
      avatar_effect: randomPick('avatar_effect'),
      name_color: randomPick('name_color'),
      name_font: randomPick('name_font'),
      title: randomPick('title'),
      badge: randomPick('badge'),
      chat_bubble: randomPick('chat_bubble'),
      banner: randomPick('banner'),
    })
    toast.success('Randomized Aesthetic Generated 🎲')
  }

  function resetToWorn() {
    setStudioWorn({
      frame: equipped.data?.frame ?? null,
      avatar_effect: equipped.data?.avatar_effect ?? null,
      name_color: equipped.data?.name_color ?? null,
      name_font: equipped.data?.name_font ?? null,
      title: equipped.data?.title ?? null,
      badge: equipped.data?.badge ?? null,
      chat_bubble: equipped.data?.chat_bubble ?? null,
      banner: equipped.data?.banner ?? null,
    })
  }

  function handleSlotChange(slot: ItemType, item: StoreItem | null) {
    setStudioWorn((prev) => ({ ...prev, [slot]: item }))
  }

  async function equipCurrentLook() {
    try {
      const input: EquipInput = {
        frame_item_id: studioWorn.frame?.id ?? null,
        avatar_effect_item_id: studioWorn.avatar_effect?.id ?? null,
        name_color_item_id: studioWorn.name_color?.id ?? null,
        name_font_item_id: studioWorn.name_font?.id ?? null,
        title_item_id: studioWorn.title?.id ?? null,
        badge_item_id: studioWorn.badge?.id ?? null,
        chat_bubble_item_id: studioWorn.chat_bubble?.id ?? null,
        banner_item_id: studioWorn.banner?.id ?? null,
      }
      await equipMutation.mutateAsync(input)
      toast.success('Outfit equipped successfully! 🌟')
    } catch (cause) {
      toast.error('Could not equip outfit', errorText(cause))
    }
  }

  async function buyMissingAndEquip() {
    if (unownedItems.length === 0) {
      await equipCurrentLook()
      return
    }

    setBuyingAll(true)
    try {
      for (const item of unownedItems) {
        await purchaseMutation.mutateAsync(item.id)
      }
      await equipCurrentLook()
      toast.success('Unlocked and equipped full outfit bundle! 🎉')
    } catch (cause) {
      toast.error('Purchase failed', errorText(cause))
    } finally {
      setBuyingAll(false)
    }
  }

  if (storeQuery.isLoading) {
    return <Skeleton height="24rem" />
  }
  if (storeQuery.error) {
    return <Callout tone="danger">{errorText(storeQuery.error, 'Could not load the store')}</Callout>
  }

  return (
    <div className={styles.stackLg}>
      <OutfitStudioStage
        displayName={name}
        handle={me.data?.handle}
        avatarUrl={me.data?.profile?.avatar_url}
        accentColor={me.data?.profile?.accent_color}
        previewLoadout={previewLoadout}
        studioWorn={studioWorn}
        onRandomize={randomizeOutfit}
        onReset={resetToWorn}
      />

      <ChatBubbleSandbox
        bubbleItem={studioWorn.chat_bubble}
        message={testMessage}
        onMessageChange={setTestMessage}
      />

      <PresetThemesGrid onApplyPreset={applyPreset} />

      <SlotPickersGrid
        itemsBySlot={itemsBySlot}
        allItems={allItems}
        studioWorn={studioWorn}
        onSlotChange={handleSlotChange}
      />

      <OutfitActionBar
        unownedItems={unownedItems}
        totalPointsNeeded={totalPointsNeeded}
        balance={balance.data?.balance ?? 0}
        isEquipping={equipMutation.isPending}
        isBuyingAll={buyingAll}
        onEquipAll={() => void equipCurrentLook()}
        onBuyAndEquip={() => void buyMissingAndEquip()}
      />
    </div>
  )
}
