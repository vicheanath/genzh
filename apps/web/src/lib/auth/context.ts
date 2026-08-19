import { createContext, use } from 'react'

import type { CurrentUser } from '@/lib/api'

export interface AuthValue {
  user: CurrentUser | null
  /** True until the stored session has been checked on first load. */
  loading: boolean
  register: (input: {
    handle: string
    email: string
    password: string
    displayName?: string
  }) => Promise<void>
  login: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /**
   * A valid access token, refreshing first if the current one is close to
   * expiry. Every authenticated call goes through this rather than reading a
   * token directly, so refresh happens in exactly one place.
   */
  getToken: () => Promise<string>
}

/**
 * Kept in its own module, away from the provider component.
 *
 * A file that exports both a component and a hook breaks React Fast Refresh:
 * editing the hook forces a full reload instead of preserving state, which is
 * exactly what you do not want while iterating on a live voice call.
 */
export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = use(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
