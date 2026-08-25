import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { auth } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'

import type { CurrentUser, LoginInput, RegisterInput, UpdateProfileInput } from './types'

export const authKeys = {
  all: ['auth'] as const,
  config: () => [...authKeys.all, 'config'] as const,
  me: () => [...authKeys.all, 'me'] as const,
}

/**
 * The public auth config: which OAuth providers exist, and whether signup is
 * open. Fetched without a session — it is what the sign-in screen renders.
 */
export function useAuthConfig() {
  return useQuery({
    queryKey: authKeys.config(),
    queryFn: () => auth.config(),
    staleTime: Infinity,
  })
}

export function useCurrentUser() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: () => auth.me(null),
    enabled: signedIn,
    staleTime: 1000 * 60 * 5,
  })
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => auth.updateProfile(null, input),
    onSuccess: (profile) => {
      queryClient.setQueryData<CurrentUser>(authKeys.me(), (current) =>
        current ? { ...current, profile } : current,
      )
      queryClient.invalidateQueries({ queryKey: authKeys.me() })
    },
  })
}

/**
 * Sign-in and sign-up stay mutations rather than moving into `AuthProvider`,
 * so a form gets `isPending` and `error` for free. The provider still owns the
 * session itself — these hand it the result.
 */
export function useLoginMutation() {
  return useMutation({
    mutationFn: (input: LoginInput) => auth.login(input),
  })
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (input: RegisterInput) => auth.register(input),
  })
}
