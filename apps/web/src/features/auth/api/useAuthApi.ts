import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from './authApi'
import type { CurrentUser, LoginInput, RegisterInput, UpdateProfileInput } from './types'

export const authKeys = {
  all: ['auth'] as const,
  config: () => [...authKeys.all, 'config'] as const,
  me: () => [...authKeys.all, 'me'] as const,
}

export function useAuthConfig() {
  return useQuery({
    queryKey: authKeys.config(),
    queryFn: () => authApi.getConfig(),
    staleTime: Infinity,
  })
}

export function useCurrentUser(token: string | null) {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: () => (token ? authApi.getMe(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useLoginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (data) => {
      queryClient.setQueryData(authKeys.me(), data.user)
      queryClient.invalidateQueries({ queryKey: authKeys.all })
    },
  })
}

export function useRegisterMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (data) => {
      queryClient.setQueryData(authKeys.me(), data.user)
      queryClient.invalidateQueries({ queryKey: authKeys.all })
    },
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (refreshToken: string) => authApi.logout(refreshToken),
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
      return authApi.updateProfile(token, input)
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData<CurrentUser>(authKeys.me(), (old) => {
        if (!old) return old
        return {
          ...old,
          profile: updatedProfile,
        }
      })
      queryClient.invalidateQueries({ queryKey: authKeys.me() })
    },
  })
}
