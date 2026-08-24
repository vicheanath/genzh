import type {
  AuthConfig,
  AuthResponse,
  CurrentUser,
  Profile,
  TokenPair,
  UpdateProfileInput,
  Uuid,
} from '@/lib/api'

export interface LoginInput {
  identifier: string
  password: string
}

export interface RegisterInput {
  handle: string
  email: string
  password: string
  display_name?: string
}

export interface AuthSessionState {
  user: CurrentUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

export type { AuthConfig, AuthResponse, CurrentUser, Profile, TokenPair, UpdateProfileInput, Uuid }
