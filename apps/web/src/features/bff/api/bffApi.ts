import { auth, communities, rooms, social } from '@/lib/api'
import type {
  CommunityOverviewResponse,
  MeOverviewResponse,
  RoomSessionResponse,
  SocialOverviewResponse,
  Uuid,
} from './types'

/**
 * The client half of the Backend-for-Frontend.
 *
 * Each call returns one screen's worth of state from one request. The
 * endpoints behind them are ordinary resource endpoints — `/me/overview`,
 * `/communities/{id}/overview`, `/rooms/{id}/session` — so nothing here is a
 * private side-channel; this module just groups the screen-shaped ones.
 */
export const bffApi = {
  /** App shell: account, communities, rooms, friends, presence, unread counts. */
  meOverview(token: string): Promise<MeOverviewResponse> {
    return auth.overview(token)
  },

  /** Community screen: the community, its rooms, its members with roles, its roles. */
  communityOverview(token: string, communityId: Uuid): Promise<CommunityOverviewResponse> {
    return communities.overview(token, communityId)
  },

  /** Open a room: metadata, participants, recent messages, media token. */
  openRoomSession(token: string, roomId: Uuid): Promise<RoomSessionResponse> {
    return rooms.session(token, roomId)
  },

  /** Social screen: friends, presence, requests both ways, blocklist. */
  socialOverview(token: string): Promise<SocialOverviewResponse> {
    return social.overview(token)
  },
}
