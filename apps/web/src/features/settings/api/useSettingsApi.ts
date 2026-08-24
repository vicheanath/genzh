import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from './settingsApi'
import type { CurrentUser, UpdateProfileInput, Uuid } from './types'

export const settingsKeys = {
  all: ['settings'] as const,
  profile: () => [...settingsKeys.all, 'profile'] as const,
  publicProfile: (userId: Uuid) => [...settingsKeys.all, 'publicProfile', userId] as const,
  blocked: () => [...settingsKeys.all, 'blocked'] as const,
}

export function useUserSettingsQuery(token: string | null) {
  return useQuery({
    queryKey: settingsKeys.profile(),
    queryFn: () => (token ? settingsApi.getCurrentUser(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function usePublicProfileQuery(token: string | null, userId: Uuid | null) {
  return useQuery({
    queryKey: userId ? settingsKeys.publicProfile(userId) : ['settings', 'unselected', 'publicProfile'],
    queryFn: () => {
      if (!token || !userId) throw new Error('Unauthenticated or missing user ID')
      return settingsApi.getPublicProfile(token, userId)
    },
    enabled: Boolean(token && userId),
  })
}

export function useBlockedUsersSettingsQuery(token: string | null) {
  return useQuery({
    queryKey: settingsKeys.blocked(),
    queryFn: () => (token ? settingsApi.listBlocked(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function useUpdateProfileSettingsMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => {
      if (!token) throw new Error('Unauthenticated')
      return settingsApi.updateProfile(token, input)
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData<CurrentUser>(settingsKeys.profile(), (old) => {
        if (!old) return old
        return {
          ...old,
          profile: updatedProfile,
        }
      })
      queryClient.invalidateQueries({ queryKey: settingsKeys.profile() })
    },
  })
}

export function useUnblockSettingMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return settingsApi.unblockUser(token, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.blocked() })
    },
  })
}
