import { useCallback } from 'react'
import {
  useAuthConfigQuery,
  useCurrentUserQuery,
  useLoginMutation,
  useLogoutMutation,
  useRegisterMutation,
  useUpdateProfileMutation,
} from '../queries/auth.queries'
import type { UpdateProfileInput } from '../api/types'

export function useAuthVM(
  token: string | null,
  onTokenReceived?: (accessToken: string, refreshToken: string) => void,
) {
  const configQuery = useAuthConfigQuery()
  const currentUserQuery = useCurrentUserQuery(token)
  const loginMutation = useLoginMutation()
  const registerMutation = useRegisterMutation()
  const logoutMutation = useLogoutMutation()
  const updateProfileMutation = useUpdateProfileMutation(token)

  const login = useCallback(
    async (input: { identifier: string; password: string }) => {
      const response = await loginMutation.mutateAsync(input)
      if (onTokenReceived) {
        onTokenReceived(response.access_token, response.refresh_token)
      }
      return response
    },
    [loginMutation, onTokenReceived],
  )

  const register = useCallback(
    async (input: {
      handle: string
      email: string
      password: string
      display_name?: string
    }) => {
      const response = await registerMutation.mutateAsync(input)
      if (onTokenReceived) {
        onTokenReceived(response.access_token, response.refresh_token)
      }
      return response
    },
    [registerMutation, onTokenReceived],
  )

  const logout = useCallback(
    async (refreshToken: string) => {
      return logoutMutation.mutateAsync(refreshToken)
    },
    [logoutMutation],
  )

  const updateProfile = useCallback(
    async (input: UpdateProfileInput) => {
      return updateProfileMutation.mutateAsync(input)
    },
    [updateProfileMutation],
  )

  return {
    // State / Model data
    user: currentUserQuery.data ?? null,
    authConfig: configQuery.data ?? null,
    isAuthenticated: Boolean(token && currentUserQuery.data),

    // Status flags
    isLoadingUser: currentUserQuery.isLoading,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isUpdatingProfile: updateProfileMutation.isPending,

    // Errors
    userError: currentUserQuery.error,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
    updateProfileError: updateProfileMutation.error,

    // Actions
    login,
    register,
    logout,
    updateProfile,
    refetchUser: currentUserQuery.refetch,
  }
}
