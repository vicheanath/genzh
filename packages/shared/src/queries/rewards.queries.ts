import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { economy, inventory, store } from '../api/endpoints'
import type { EquipInput } from '../api/types'
import { queryKeys } from './keys'

export function useBalanceQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.economy.balance(),
    queryFn: () => economy.balance(token),
    enabled: !!token,
    staleTime: 30_000,
  })
}

export function useDailyCheckinMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => economy.dailyCheckin(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.economy.balance() })
    },
  })
}

export function useStoreItemsQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.store.items(),
    queryFn: () => store.items(token),
    enabled: !!token,
    staleTime: 60_000,
  })
}

export function useInventoryQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.store.inventory(),
    queryFn: () => inventory.mine(token),
    enabled: !!token,
    staleTime: 30_000,
  })
}

export function usePurchaseMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => store.purchase(token, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.economy.balance() })
      queryClient.invalidateQueries({ queryKey: queryKeys.store.inventory() })
    },
  })
}

export function useEquippedQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.store.equipped(),
    queryFn: () => inventory.equipped(token),
    enabled: !!token,
    staleTime: 30_000,
  })
}

export function useEquipMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: EquipInput) => inventory.equip(token, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.store.equipped() })
      // Wearing something is also how the catalog knows to mark it as worn.
      queryClient.invalidateQueries({ queryKey: queryKeys.store.items() })
    },
  })
}
