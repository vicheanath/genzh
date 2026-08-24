import { media as coreMedia, rooms as coreRooms } from '@/lib/api'
import type {
  CreateCommunityRoomInput,
  CreateStandaloneRoomInput,
  DiscoveryResponse,
  MediaJoinResponse,
  Room,
  RoomParticipant,
  RoomType,
  RoomWithPermissions,
  UpdateRoomInput,
  UserRoom,
  Uuid,
} from './types'

/**
 * Backend-for-Frontend (BFF) Rooms & Media API client.
 * Handles discovery, room lifecycle, participation, voice/video sessions, and DMs.
 * Every method adheres to Single Responsibility and handles a dedicated backend communication flow.
 */
export const roomsApi = {
  /** Get aggregated discovery feed (trending, live now, categories, rooms). */
  getDiscovery(
    token: string,
    category?: string,
    limit?: number,
  ): Promise<DiscoveryResponse> {
    return coreRooms.discovery(token, category, limit)
  },

  /** Get trending rooms across the platform. */
  getTrending(token: string): Promise<Room[]> {
    return coreRooms.trending(token)
  },

  /** Get rooms that are currently active/live. */
  getLive(token: string): Promise<Room[]> {
    return coreRooms.live(token)
  },

  /** Find a random room by category or room type. */
  getRandom(
    token: string,
    category?: string,
    room_type?: RoomType,
  ): Promise<Room | null> {
    return coreRooms.random(token, category, room_type)
  },

  /** List rooms in a specific community. */
  list(token: string, communityId: Uuid): Promise<Room[]> {
    return coreRooms.list(token, communityId)
  },
  getCommunityRooms(token: string, communityId: Uuid): Promise<Room[]> {
    return coreRooms.list(token, communityId)
  },

  /** List user's joined/active rooms & direct message rooms. */
  getMyRooms(token: string): Promise<UserRoom[]> {
    return coreRooms.mine(token)
  },
  mine(token: string): Promise<UserRoom[]> {
    return coreRooms.mine(token)
  },

  /** Get full room details, participant state, and caller permissions. */
  get(token: string, roomId: Uuid): Promise<RoomWithPermissions> {
    return coreRooms.get(token, roomId)
  },
  getRoom(token: string, roomId: Uuid): Promise<RoomWithPermissions> {
    return coreRooms.get(token, roomId)
  },

  /** Create a standalone / playground room. */
  createStandalone(
    token: string,
    input: CreateStandaloneRoomInput,
  ): Promise<Room> {
    return coreRooms.createStandalone(token, input)
  },

  /** Create a room inside a community. */
  create(
    token: string,
    communityId: Uuid,
    input: CreateCommunityRoomInput,
  ): Promise<Room> {
    return coreRooms.create(token, communityId, input)
  },
  createCommunityRoom(
    token: string,
    communityId: Uuid,
    input: CreateCommunityRoomInput,
  ): Promise<Room> {
    return coreRooms.create(token, communityId, input)
  },

  /** Join a room. */
  join(token: string, roomId: Uuid): Promise<RoomWithPermissions> {
    return coreRooms.join(token, roomId)
  },

  /** Leave a room. */
  leave(token: string, roomId: Uuid): Promise<void> {
    return coreRooms.leave(token, roomId)
  },

  /** List participants currently in the room. */
  participants(token: string, roomId: Uuid): Promise<RoomParticipant[]> {
    return coreRooms.participants(token, roomId)
  },
  getParticipants(token: string, roomId: Uuid): Promise<RoomParticipant[]> {
    return coreRooms.participants(token, roomId)
  },

  /** Switch between anonymous identity and real profile in room. */
  setPersona(
    token: string,
    roomId: Uuid,
    is_anonymous: boolean,
  ): Promise<RoomParticipant> {
    return coreRooms.setPersona(token, roomId, is_anonymous)
  },

  /** Update room settings, topic, or status. */
  update(
    token: string,
    roomId: Uuid,
    input: UpdateRoomInput,
  ): Promise<Room> {
    return coreRooms.update(token, roomId, input)
  },

  /** Delete / close a room. */
  delete(token: string, roomId: Uuid): Promise<void> {
    return coreRooms.delete(token, roomId)
  },

  /** Open or get existing Direct Message room with a user. */
  openDM(token: string, targetUserId: Uuid): Promise<Room> {
    return coreRooms.openDM(token, targetUserId)
  },

  /** Connect to LiveKit / SFU media session for voice and video. */
  joinMediaSession(token: string, roomId: Uuid): Promise<MediaJoinResponse> {
    return coreMedia.join(token, roomId)
  },
}
