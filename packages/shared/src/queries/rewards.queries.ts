import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cosmetics, economy, store } from '../api/endpoints'
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
    queryFn: () => store.inventory(token),
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
