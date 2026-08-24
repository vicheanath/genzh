import type { CurrentUser, Profile, PublicProfile, Timestamp, UpdateProfileInput, Uuid } from '@/lib/api'

export interface UserPreferences {
  theme?: 'dark' | 'light' | 'system'
  enableSound?: boolean
  enableNotifications?: boolean
}

export type { CurrentUser, Profile, PublicProfile, Timestamp, UpdateProfileInput, Uuid }
