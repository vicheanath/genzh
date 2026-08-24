import { auth as coreAuth } from '@/lib/api'
import type {
  AuthConfig,
  AuthResponse,
  CurrentUser,
  LoginInput,
  Profile,
  RegisterInput,
  TokenPair,
  UpdateProfileInput,
} from './types'

/**
 * Backend-for-Frontend (BFF) Auth API client.
 * Encapsulates authentication, registration, token refresh, and user profile lifecycle.
 */
export const authApi = {
  /** Fetch public auth config & available OAuth providers. */
  getConfig(): Promise<AuthConfig> {
    return coreAuth.config()
  },

  /** Authenticate with email/handle and password. */
  login(input: LoginInput): Promise<AuthResponse> {
    return coreAuth.login(input)
  },

  /** Register a new user account. */
  register(input: RegisterInput): Promise<AuthResponse> {
    return coreAuth.register(input)
  },

  /** Refresh session access token. */
  refreshToken(refreshToken: string): Promise<TokenPair> {
    return coreAuth.refresh(refreshToken)
  },

  /** Terminate session and invalidate refresh token. */
  logout(refreshToken: string): Promise<void> {
    return coreAuth.logout(refreshToken)
  },

  /** Fetch current authenticated user profile & permissions. */
  getMe(token: string): Promise<CurrentUser> {
    return coreAuth.me(token)
  },

  /** Update current user's profile metadata. */
  updateProfile(token: string, input: UpdateProfileInput): Promise<Profile> {
    return coreAuth.updateProfile(token, input)
  },
}
