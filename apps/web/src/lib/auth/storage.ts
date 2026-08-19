import type { TokenPair } from '@/lib/api'

const KEY = 'genzh.session'

export interface StoredSession {
  accessToken: string
  refreshToken: string
  /** Epoch milliseconds at which the access token expires. */
  expiresAt: number
}

/**
 * Tokens live in `localStorage`.
 *
 * The honest trade: this is readable by any script running on the origin, so it
 * is vulnerable to XSS in a way an `HttpOnly` cookie is not. It is used anyway
 * because the API is a separate origin and token-based, and because the
 * mitigation that actually matters — not having an XSS — is the same either
 * way. The refresh token is short-lived, single-use and revoked on reuse, which
 * bounds the damage.
 */
export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null
    }
    return parsed as StoredSession
  } catch {
    return null
  }
}

export function saveSession(tokens: TokenPair): StoredSession {
  const session: StoredSession = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    // Refresh a minute early so a request in flight cannot straddle expiry.
    expiresAt: Date.now() + Math.max(0, tokens.expires_in - 60) * 1000,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Private browsing with storage disabled: the session simply does not
    // survive a reload, which is better than failing the sign-in.
  }
  return session
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
