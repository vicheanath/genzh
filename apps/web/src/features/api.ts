/**
 * Unified Backend-for-Frontend (BFF) Feature API layer for Web.
 * Exports modular, typed APIs and hooks organized per feature domain.
 */

// Auth Feature API
export { authApi, authKeys, useAuthConfig, useCurrentUser, useLoginMutation, useRegisterMutation, useLogoutMutation, useUpdateProfileMutation } from './auth/api'
export type { AuthConfig, AuthResponse, AuthSessionState, CurrentUser, LoginInput, RegisterInput, UpdateProfileInput } from './auth/api'

// Chat Feature API
export { chatApi, chatKeys, useRoomMessagesInfinite, useSendMessageMutation, useEditMessageMutation, useDeleteMessageMutation, useReactionMutation } from './chat/api'
export type { EditMessagePayload, Message, MessageHistoryParams, MessagePage, ReactionPayload, ReactionSummary, SendMessagePayload } from './chat/api'

// Communities Feature API
export {
  communitiesApi,
  communityKeys,
  useCommunitiesList,
  useCommunityDetail,
  useCommunityMembers,
  useCommunityRoles,
  useCreateCommunityMutation,
  useUpdateCommunityMutation,
  useDeleteCommunityMutation,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useAssignRoleMutation,
} from './communities/api'
export type {
  Community,
  CommunityMember,
  CommunityWithPermissions,
  CreateCommunityInput,
  CreateRoleInput,
  Permission,
  Role,
  RoleWithPermissions,
  UpdateCommunityInput,
  UpdateRoleInput,
} from './communities/api'

// Rooms & Discovery Feature API
export {
  roomsApi,
  roomKeys,
  useDiscoveryRooms,
  useTrendingRooms,
  useLiveRooms,
  useCommunityRoomsQuery,
  useMyRoomsQuery,
  useRoomDetailQuery,
  useRoomParticipantsQuery,
  useCreateStandaloneRoomMutation,
  useCreateCommunityRoomMutation,
  useJoinRoomMutation,
  useLeaveRoomMutation,
  useUpdateRoomMutation,
  useOpenDMMutation,
} from './rooms/api'
export type {
  CreateCommunityRoomInput,
  CreateStandaloneRoomInput,
  DiscoveryResponse,
  MediaJoinResponse,
  Room,
  RoomAnonymousIdentity,
  RoomParticipant,
  RoomParticipantRole,
  RoomStatus,
  RoomType,
  RoomVisibility,
  RoomWithPermissions,
  UpdateRoomInput,
  UserRoom,
} from './rooms/api'

// Friends & Social Feature API
export {
  friendsApi,
  friendKeys,
  useFriendsList,
  usePendingFriendRequests,
  useSentFriendRequests,
  useBlockedUsers,
  useSendFriendRequestMutation,
  useRespondFriendRequestMutation,
  useRemoveFriendMutation,
  useBlockUserMutation,
  useUnblockUserMutation,
} from './friends/api'
export type { FriendSummary, Friendship, FriendshipStatus, PublicProfile } from './friends/api'

// Notifications Feature API
export {
  notificationsApi,
  notificationKeys,
  useNotificationsInfinite,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} from './notifications/api'
export type { AppNotification, NotificationKind, NotificationPage, NotificationQueryParams } from './notifications/api'

// Settings Feature API
export {
  settingsApi,
  settingsKeys,
  useUserSettingsQuery,
  usePublicProfileQuery,
  useBlockedUsersSettingsQuery,
  useUpdateProfileSettingsMutation,
  useUnblockSettingMutation,
} from './settings/api'
export type { UserPreferences } from './settings/api'

// Experiences Feature API
export {
  experiencesApi,
  useVotePollMutation,
  useCreatePollMutation,
  useSubmitConfessionMutation,
  useSubmitDebateArgumentMutation,
} from './experiences/api'
export type {
  ConfessionData,
  DebateArgument,
  DebateData,
  GameState,
  PollData,
  PollOption,
} from './experiences/api'
