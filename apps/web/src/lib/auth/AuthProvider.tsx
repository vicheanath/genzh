import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { ApiError, auth as authApi, type CurrentUser } from '@/lib/api'

import { AuthContext, type AuthValue } from './context'

import {
  clearSession,
  loadSession,
  saveSession,
  type StoredSession,
} from './storage'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  const session = useRef<StoredSession | null>(loadSession())
  // De-duplicates concurrent refreshes: five requests noticing an expired token
  // at once must produce one refresh, not five — and five would invalidate each
  // other, since refresh tokens are single-use.
  const refreshing = useRef<Promise<string> | null>(null)

  const signOutLocally = useCallback(() => {
    session.current = null
    clearSession()
    setUser(null)
  }, [])

  const getToken = useCallback(async (): Promise<string> => {
    const current = session.current
    if (!current) throw new ApiError(401, 'UNAUTHENTICATED', 'Not signed in')

    if (Date.now() < current.expiresAt) return current.accessToken

    if (!refreshing.current) {
      refreshing.current = (async () => {
        try {
          const tokens = await authApi.refresh(current.refreshToken)
          session.current = saveSession(tokens)
          return tokens.access_token
        } catch (error) {
          // A refresh failure is terminal: the session is gone and the user
          // has to sign in again.
          signOutLocally()
          throw error
        } finally {
          refreshing.current = null
        }
      })()
    }

    return refreshing.current
  }, [signOutLocally])

  // Restore a persisted session on first load.
  useEffect(() => {
    let cancelled = false

    async function restore() {
      if (!session.current) {
        setLoading(false)
        return
      }
      try {
        const token = await getToken()
        const me = await authApi.me(token)
        if (!cancelled) setUser(me)
      } catch {
        if (!cancelled) signOutLocally()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [getToken, signOutLocally])

  const register = useCallback<AuthValue['register']>(async (input) => {
    const result = await authApi.register({
      handle: input.handle,
      email: input.email,
      password: input.password,
      display_name: input.displayName,
    })
    session.current = saveSession(result)
    setUser(result.user)
  }, [])

  const login = useCallback<AuthValue['login']>(async (identifier, password) => {
    const result = await authApi.login({ identifier, password })
    session.current = saveSession(result)
    setUser(result.user)
  }, [])

  const logout = useCallback<AuthValue['logout']>(async () => {
    const current = session.current
    // Sign out locally first: the user should never be stuck signed in because
    // the network is down.
    signOutLocally()
    if (current) {
      try {
        await authApi.logout(current.refreshToken)
      } catch {
        /* the server-side session expires on its own */
      }
    }
  }, [signOutLocally])

  const value = useMemo<AuthValue>(
    () => ({ user, loading, register, login, logout, getToken }),
    [user, loading, register, login, logout, getToken],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
