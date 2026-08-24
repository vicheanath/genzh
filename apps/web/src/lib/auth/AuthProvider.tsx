import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  ApiError,
  auth as authApi,
  setTokenProvider,
  type CurrentUser,
  type Profile,
} from '@/lib/api'

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

  useEffect(() => {
    setTokenProvider(getToken)
    return () => {
      setTokenProvider(null)
    }
  }, [getToken])

  // Restore a persisted session on first load.
  useEffect(() => {
    let cancelled = false

    async function restore() {
      // Check if arriving from OAuth redirect with access_token & refresh_token in hash or query
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.substring(1)
        : window.location.search.startsWith('?')
          ? window.location.search.substring(1)
          : ''

      if (hash.includes('access_token=') && hash.includes('refresh_token=')) {
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        if (accessToken && refreshToken) {
          session.current = saveSession({
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'Bearer',
            expires_in: 900,
          })
          const cleanPath = window.location.pathname === '/oauth/callback' ? '/' : window.location.pathname
          window.history.replaceState(null, '', cleanPath)
        }
      }

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

  const applyProfile = useCallback((profile: Profile) => {
    setUser((current) => (current ? { ...current, profile } : current))
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, loading, register, login, logout, getToken, applyProfile }),
    [user, loading, register, login, logout, getToken, applyProfile],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
