import type { Friendship, FriendshipStatus, PublicProfile, Timestamp, Uuid } from '@/lib/api'

export interface FriendSummary {
  userId: Uuid
  profile?: PublicProfile | null
  isOnline: boolean
}

export type { Friendship, FriendshipStatus, PublicProfile, Timestamp, Uuid }
