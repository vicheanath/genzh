import { auth as coreAuth, blocks as coreBlocks, users as coreUsers } from '@/lib/api'
import type { CurrentUser, Profile, PublicProfile, UpdateProfileInput, Uuid } from './types'

/**
 * Backend-for-Frontend (BFF) Settings & Profile API client.
 * Manages user profile updates, public profile lookups, preferences, and user blocks.
 * Every method adheres to Single Responsibility and handles a dedicated backend communication flow.
 */
export const settingsApi = {
  /** Get current user settings and profile data. */
  getCurrentUser(token: string): Promise<CurrentUser> {
    return coreAuth.me(token)
  },
  me(token: string): Promise<CurrentUser> {
    return coreAuth.me(token)
  },

  /** Update current user's profile info (display name, bio, avatar, colors). */
  updateProfile(token: string, input: UpdateProfileInput): Promise<Profile> {
    return coreAuth.updateProfile(token, input)
  },

  /** Fetch any user's public profile by their ID. */
  getPublicProfile(token: string, userId: Uuid): Promise<PublicProfile> {
    return coreUsers.get(token, userId)
  },
  get(token: string, userId: Uuid): Promise<PublicProfile> {
    return coreUsers.get(token, userId)
  },

  /** Get list of blocked user IDs. */
  listBlocked(token: string): Promise<Uuid[]> {
    return coreBlocks.list(token)
  },
  list(token: string): Promise<Uuid[]> {
    return coreBlocks.list(token)
  },

  /** Block a specific user. */
  blockUser(token: string, userId: Uuid): Promise<void> {
    return coreBlocks.block(token, userId)
  },
  block(token: string, userId: Uuid): Promise<void> {
    return coreBlocks.block(token, userId)
  },

  /** Unblock a specific user. */
  unblockUser(token: string, userId: Uuid): Promise<void> {
    return coreBlocks.unblock(token, userId)
  },
  unblock(token: string, userId: Uuid): Promise<void> {
    return coreBlocks.unblock(token, userId)
  },
}
