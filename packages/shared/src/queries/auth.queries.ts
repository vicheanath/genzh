import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { auth } from '../api/endpoints'
import type { CurrentUser, UpdateProfileInput } from '../api/types'
import { queryKeys } from './keys'

export function useAuthConfigQuery() {
  return useQuery({
    queryKey: queryKeys.auth.config(),
    queryFn: () => auth.config(),
    staleTime: Infinity,
  })
}

export function useCurrentUserQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => (token ? auth.me(token) : Promise.reject(new Error('No token'))),
    enabled: Boolean(token),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useLoginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { identifier: string; password: string }) => auth.login(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all })
    },
  })
}

export function useRegisterMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      handle: string
      email: string
      password: string
      display_name?: string
    }) => auth.register(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all })
    },
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (refreshToken: string) => auth.logout(refreshToken),
    onSettled: () => {
      queryClient.clear()
    },
  })
}

export function useUpdateProfileMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => {
      if (!token) throw new Error('Unauthenticated')
      return auth.updateProfile(token, input)
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData<CurrentUser>(queryKeys.auth.me(), (old) => {
        if (!old) return old
        return {
          ...old,
          profile: updatedProfile,
        }
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() })
    },
  })
}
