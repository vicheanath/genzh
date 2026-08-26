import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { cosmetics, economy, inventory, referrals, store, storeAdmin } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'

import type {
  BalanceOverview,
  EquipInput,
  EquippedCosmetics,
  GrantPointsInput,
  InventoryItem,
  ItemType,
  StoreItemInput,
  StoreListing,
  Uuid,
} from './types'

export const rewardKeys = {
  all: ['rewards'] as const,
  balance: () => [...rewardKeys.all, 'balance'] as const,
  referrals: () => [...rewardKeys.all, 'referrals'] as const,
  store: (itemType: ItemType | 'all') => [...rewardKeys.all, 'store', itemType] as const,
  inventory: () => [...rewardKeys.all, 'inventory'] as const,
  equipped: () => [...rewardKeys.all, 'equipped'] as const,
  cosmetics: (userIds: Uuid[]) =>
    [...rewardKeys.all, 'cosmetics', [...userIds].sort().join(',')] as const,
  adminCatalog: () => [...rewardKeys.all, 'admin', 'catalog'] as const,
}

/**
 * Everything a spend touches, refetched as one.
 *
 * A purchase moves the balance, the inventory, and the store tile that now says
 * "owned". Invalidating the three separately is how one of them stays stale
 * long enough for somebody to click buy again.
 */
function useRewardsInvalidation() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: rewardKeys.all })
  }
}

// ── balance & the daily claim ──────────────────────────────────────────────

export function useBalanceQuery() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: rewardKeys.balance(),
    queryFn: () => economy.balance(null),
    enabled: signedIn,
    staleTime: 1000 * 30,
  })
}

export function useDailyCheckinMutation() {
  const queryClient = useQueryClient()
  const invalidate = useRewardsInvalidation()
  return useMutation({
    mutationFn: () => economy.dailyCheckin(null),
    // The response already carries the new balance and streak, so the screen
    // can settle before the refetch lands rather than flickering through the
    // old numbers on the way.
    onSuccess: (result) => {
      queryClient.setQueryData<BalanceOverview>(rewardKeys.balance(), (previous) =>
        previous
          ? {
              ...previous,
              balance: result.new_balance,
              lifetime_earned: previous.lifetime_earned + result.points_awarded,
              daily_streak: result.daily_streak,
              can_claim_daily: false,
            }
          : previous,
      )
      invalidate()
    },
  })
}

// ── referrals ──────────────────────────────────────────────────────────────

export function useReferralOverviewQuery() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: rewardKeys.referrals(),
    queryFn: () => referrals.overview(null),
    enabled: signedIn,
    staleTime: 1000 * 60,
  })
}

export function useClaimReferralMutation() {
  const invalidate = useRewardsInvalidation()
  return useMutation({
    mutationFn: (code: string) => referrals.claim(null, code),
    onSuccess: invalidate,
  })
}

// ── the store & inventory ──────────────────────────────────────────────────

export function useStoreItemsQuery(itemType: ItemType | 'all' = 'all') {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: rewardKeys.store(itemType),
    queryFn: () => store.items(null, itemType),
    enabled: signedIn,
    staleTime: 1000 * 60 * 2,
  })
}

export function useInventoryQuery() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: rewardKeys.inventory(),
    queryFn: () => inventory.mine(null),
    enabled: signedIn,
    staleTime: 1000 * 60,
  })
}

export function useEquippedQuery() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: rewardKeys.equipped(),
    queryFn: () => inventory.equipped(null),
    enabled: signedIn,
    staleTime: 1000 * 60,
  })
}

export function usePurchaseMutation() {
  const invalidate = useRewardsInvalidation()
  return useMutation({
    mutationFn: (itemId: Uuid) => store.purchase(null, itemId),
    onSuccess: invalidate,
  })
}

export function useEquipMutation() {
  const queryClient = useQueryClient()
  const invalidate = useRewardsInvalidation()
  return useMutation({
    mutationFn: (input: EquipInput) => inventory.equip(null, input),
    onSuccess: (equipped) => {
      // The server answers with the resolved set, which is exactly what the
      // cache holds — writing it straight in means the avatar changes on the
      // same frame as the click.
      queryClient.setQueryData<EquippedCosmetics>(rewardKeys.equipped(), equipped)
      queryClient.setQueryData<EquippedCosmetics[]>(
        rewardKeys.cosmetics([equipped.user_id]),
        [equipped],
      )
      invalidate()
    },
  })
}

/**
 * What a set of people are wearing.
 *
 * One query for the whole set rather than one per person: a voice grid asks
 * about everybody on screen, and the ids it passes change every time somebody
 * joins.
 */
export function useCosmeticsFor(userIds: Uuid[]) {
  const signedIn = useIsSignedIn()
  const unique = Array.from(new Set(userIds.filter(Boolean)))
  return useQuery({
    queryKey: rewardKeys.cosmetics(unique),
    queryFn: () => cosmetics.forUsers(null, unique),
    enabled: signedIn && unique.length > 0,
    staleTime: 1000 * 60 * 5,
    select: (list: EquippedCosmetics[]) =>
      new Map(list.map((entry) => [entry.user_id, entry])),
  })
}

// ── the console: curating the catalog ──────────────────────────────────────

export function useAdminCatalogQuery(enabled = true) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: rewardKeys.adminCatalog(),
    queryFn: () => storeAdmin.items(null),
    enabled: signedIn && enabled,
    staleTime: 1000 * 30,
  })
}

export function useCreateStoreItemMutation() {
  const invalidate = useRewardsInvalidation()
  return useMutation({
    mutationFn: (input: StoreItemInput) => storeAdmin.create(null, input),
    onSuccess: invalidate,
  })
}

export function useUpdateStoreItemMutation() {
  const invalidate = useRewardsInvalidation()
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: Uuid; input: StoreItemInput }) =>
      storeAdmin.update(null, itemId, input),
    onSuccess: invalidate,
  })
}

export function useDeleteStoreItemMutation() {
  const invalidate = useRewardsInvalidation()
  return useMutation({
    mutationFn: (itemId: Uuid) => storeAdmin.remove(null, itemId),
    onSuccess: invalidate,
  })
}

export function useGrantItemMutation() {
  const invalidate = useRewardsInvalidation()
  return useMutation({
    mutationFn: ({ itemId, userId }: { itemId: Uuid; userId: Uuid }) =>
      storeAdmin.grantItem(null, itemId, userId),
    onSuccess: invalidate,
  })
}

export function useGrantPointsMutation() {
  const invalidate = useRewardsInvalidation()
  return useMutation({
    mutationFn: (input: GrantPointsInput) => storeAdmin.grantPoints(null, input),
    onSuccess: invalidate,
  })
}

/** The catalog grouped by slot, for a picker that shows one row per slot. */
export function groupBySlot(items: StoreListing[]): Record<ItemType, StoreListing[]> {
  const groups: Record<ItemType, StoreListing[]> = {
    frame: [],
    badge: [],
    banner: [],
    name_color: [],
    name_font: [],
    title: [],
    avatar_effect: [],
    chat_bubble: [],
  }
  for (const item of items) groups[item.item_type]?.push(item)
  return groups
}

/** Owned items narrowed to one slot, for the equip picker. */
export function ownedForSlot(items: InventoryItem[], slot: ItemType): InventoryItem[] {
  return items.filter((entry) => entry.item.item_type === slot)
}
