/**
 * The web app's server-state surface, one module per feature domain.
 *
 * Everything here is a React Query hook. There is no imperative API client
 * exported alongside them on purpose: a screen that calls an endpoint directly
 * owns a copy of the response that nothing can invalidate, and the two copies
 * disagree the moment anything writes. Fetching goes through a query, writing
 * goes through a mutation, and live updates arrive over the socket bridge —
 * all three meeting in the same cache.
 *
 * None of these take an access token. The API client resolves it through the
 * provider `AuthProvider` registers, so a session is ambient rather than an
 * argument threaded through every call site.
 */

// Auth
export { authKeys, useAuthConfig, useCurrentUser, useLoginMutation, useRegisterMutation, useUpdateProfileMutation } from './auth/api'
export type { AuthConfig, AuthResponse, CurrentUser, LoginInput, RegisterInput, UpdateProfileInput } from './auth/api'

// Chat
export {
  chatKeys,
  mergeMessages,
  applyMessageCreated,
  applyMessageUpdated,
  applyMessageDeleted,
  applyReactionsUpdated,
  applyLocalReaction,
  useRoomMessagesInfinite,
  useSendMessageMutation,
  useEditMessageMutation,
  useDeleteMessageMutation,
  useReactionMutation,
  useRoomPinsQuery,
  usePinMessageMutation,
  useUnpinMessageMutation,
  useSearchMessagesQuery,
  useUnreadOverviewQuery,
  useMarkRoomReadMutation,
  useMuteRoomMutation,
} from './chat/api'
export type {
  EditMessagePayload,
  Message,
  MessagePage,
  MessageSearchParams,
  ReactionPayload,
  ReactionSummary,
  RoomUnread,
  SendMessagePayload,
} from './chat/api'

// Communities
export {
  communityKeys,
  useCommunitiesList,
  useCommunityTemplates,
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
  useRemoveRoleMutation,
  useCommunityInvites,
  useCreateInviteMutation,
  useRevokeInviteMutation,
  useInvitePreview,
  useRedeemInviteMutation,
} from './communities/api'
export type {
  Community,
  CommunityMember,
  CommunityTemplate,
  CommunityWithPermissions,
  CreateCommunityInput,
  CreateInviteInput,
  CreateRoleInput,
  Invite,
  InvitePreview,
  Permission,
  Role,
  RoleWithPermissions,
  UpdateCommunityInput,
  UpdateRoleInput,
} from './communities/api'

// Rooms & discovery
export {
  roomKeys,
  useDiscoveryRooms,
  useTrendingRooms,
  useLiveRooms,
  useCommunityRoomsQuery,
  useMyRoomsQuery,
  useRoomDetailQuery,
  useJoinedRoomQuery,
  useRoomParticipantsQuery,
  useCreateStandaloneRoomMutation,
  useCreateCommunityRoomMutation,
  useJoinRoomMutation,
  useLeaveRoomMutation,
  useUpdateRoomMutation,
  useDeleteRoomMutation,
  useSetPersonaMutation,
  useOpenDMMutation,
  useRandomRoomMutation,
  useJoinMediaSessionMutation,
  useRingMutation,
  useEndCallMutation,
} from './rooms/api'
export type {
  CallEndReason,
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

// Friends, blocks & presence
export {
  friendKeys,
  socialGraphKeys,
  useFriendsList,
  usePendingFriendRequests,
  useSentFriendRequests,
  useBlockedUsers,
  useOnlineUsers,
  useSendFriendRequestMutation,
  useRespondFriendRequestMutation,
  useRemoveFriendMutation,
  useBlockUserMutation,
  useUnblockUserMutation,
} from './friends/api'
export type { Friendship, FriendshipStatus, PublicProfile } from './friends/api'

// Notifications
export {
  notificationKeys,
  applyNotificationCreated,
  useNotificationsInfinite,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} from './notifications/api'
export type { AppNotification, NotificationKind, NotificationPage, NotificationQueryParams } from './notifications/api'

// Profiles
export { settingsKeys, usePublicProfileQuery, usePublicProfiles } from './settings/api'
export type { UserPreferences } from './settings/api'

// Experiences
export {
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

// Platform staff, the audit log, and support
export {
  adminKeys,
  supportKeys,
  usePlatformRole,
  useIsStaff,
  useIsPlatformAdmin,
  useAdminStats,
  useAuditLog,
  useAuditActions,
  useUserSearch,
  useStaffList,
  useSupportQueue,
  useSupportTicket,
  useSuspendUserMutation,
  useReinstateUserMutation,
  useSetPlatformRoleMutation,
  useStaffReplyMutation,
  useUpdateTicketMutation,
  useMyTickets,
  useMyTicket,
  useOpenTicketMutation,
  useReplyToMyTicketMutation,
} from './admin/api'
export type {
  AdminStats,
  AuditEntry,
  OpenTicketInput,
  PlatformRole,
  StaffUserView,
  SupportMessage,
  SupportQueue,
  SupportTicket,
  SupportTicketDetail,
  TicketKind,
  TicketStatus,
  TicketSubjectType,
} from './admin/api'

// Composite screen views (the BFF layer)
export {
  bffKeys,
  useMeOverviewQuery,
  useCommunityOverviewQuery,
  useRoomSessionQuery,
  useSocialOverviewQuery,
} from './bff/api'
export type {
  MeOverviewResponse,
  CommunityOverviewResponse,
  RoomSessionResponse,
  SocialOverviewResponse,
} from './bff/api'
