import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { admin, broadcasts, support } from '@/lib/api'
import { useAuth, useIsSignedIn } from '@/lib/auth'

import type {
  NewAutomodRuleInput,
  NewBroadcastInput,
  OpenTicketInput,
  PlatformRole,
  TicketStatus,
  Timestamp,
  Uuid,
} from './types'

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => [...adminKeys.all, 'stats'] as const,
  audit: (filter: string) => [...adminKeys.all, 'audit', filter] as const,
  auditActions: () => [...adminKeys.all, 'audit', 'actions'] as const,
  users: (query: string) => [...adminKeys.all, 'users', query] as const,
  user: (id: Uuid) => [...adminKeys.all, 'user', id] as const,
  staff: () => [...adminKeys.all, 'staff'] as const,
  tickets: (filter: string) => [...adminKeys.all, 'tickets', filter] as const,
  ticket: (id: Uuid) => [...adminKeys.all, 'ticket', id] as const,
  communities: (filter: string) => [...adminKeys.all, 'communities', filter] as const,
  liveMedia: () => [...adminKeys.all, 'live-media'] as const,
  broadcasts: () => [...adminKeys.all, 'broadcasts'] as const,
  settings: () => [...adminKeys.all, 'settings'] as const,
  ipBans: () => [...adminKeys.all, 'ip-bans'] as const,
  emailDomains: () => [...adminKeys.all, 'email-domains'] as const,
  automod: () => [...adminKeys.all, 'automod'] as const,
  telemetry: () => [...adminKeys.all, 'telemetry'] as const,
}

export const broadcastKeys = {
  all: ['broadcasts'] as const,
  active: () => [...broadcastKeys.all, 'active'] as const,
}

export const supportKeys = {
  all: ['support'] as const,
  mine: () => [...supportKeys.all, 'mine'] as const,
  ticket: (id: Uuid) => [...supportKeys.all, 'ticket', id] as const,
}

/**
 * What the signed-in account is to the platform.
 *
 * Read from `useAuth`, which holds the `/me` response — so it reflects what the
 * server said on this session, not something the client decided. A missing
 * value means `user`: an older server that does not send the field must never
 * be read as granting staff.
 */
export function usePlatformRole(): PlatformRole {
  const { user } = useAuth()
  return user?.platform_role ?? 'user'
}

/** Does this account see the console at all? */
export function useIsStaff(): boolean {
  const role = usePlatformRole()
  return role === 'support' || role === 'admin'
}

/** May this account enforce, and read the log? */
export function useIsPlatformAdmin(): boolean {
  return usePlatformRole() === 'admin'
}

// ── the console ───────────────────────────────────────────────────────────

export function useAdminStats() {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.stats(),
    queryFn: () => admin.stats(null),
    enabled: isStaff,
    refetchInterval: 15_000,
  })
}

export function useAuditLog(
  filter: {
    action?: string
    category?: string
    q?: string
    subject_id?: Uuid
    limit?: number
  } = {},
) {
  const isAdmin = useIsPlatformAdmin()
  return useQuery({
    queryKey: adminKeys.audit(JSON.stringify(filter)),
    queryFn: () => admin.audit(null, { limit: 100, ...filter }),
    enabled: isAdmin,
  })
}

export function useAuditActions() {
  const isAdmin = useIsPlatformAdmin()
  return useQuery({
    queryKey: adminKeys.auditActions(),
    queryFn: () => admin.auditActions(null),
    enabled: isAdmin,
    staleTime: Infinity,
  })
}

/**
 * Account search and filtering.
 */
export function useUserSearch(
  query: string,
  options: { role?: PlatformRole; is_active?: boolean; limit?: number } = {},
) {
  const isStaff = useIsStaff()
  const trimmed = query.trim()
  return useQuery({
    queryKey: adminKeys.users(`${trimmed}:${JSON.stringify(options)}`),
    queryFn: () => admin.searchUsers(null, trimmed, options),
    enabled: isStaff,
  })
}

export function useStaffList() {
  const isAdmin = useIsPlatformAdmin()
  return useQuery({
    queryKey: adminKeys.staff(),
    queryFn: () => admin.listStaff(null),
    enabled: isAdmin,
  })
}

export function useSupportQueue(
  filter: {
    status?: TicketStatus
    kind?: string
    q?: string
    assignee_id?: Uuid
    limit?: number
  } = {},
) {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.tickets(JSON.stringify(filter)),
    queryFn: () => admin.tickets(null, filter),
    enabled: isStaff,
    // The queue is worked by several people at once; a stale one sends two
    // agents to the same ticket.
    refetchInterval: 30_000,
  })
}

export function useSupportTicket(id: Uuid | null) {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: id ? adminKeys.ticket(id) : [...adminKeys.all, 'ticket', 'idle'],
    queryFn: () => admin.ticket(null, id!),
    enabled: isStaff && Boolean(id),
  })
}

function useConsoleInvalidation() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.all })
  }
}

export function useSuspendUserMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: Uuid; reason: string }) =>
      admin.suspendUser(null, userId, reason),
    onSuccess: invalidate,
  })
}

export function useReinstateUserMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: (userId: Uuid) => admin.reinstateUser(null, userId),
    onSuccess: invalidate,
  })
}

export function useSetPlatformRoleMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: Uuid; role: PlatformRole }) =>
      admin.setPlatformRole(null, userId, role),
    onSuccess: invalidate,
  })
}

export function useStaffReplyMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({
      ticketId,
      body,
      staffOnly,
    }: {
      ticketId: Uuid
      body: string
      staffOnly?: boolean
    }) => admin.replyToTicket(null, ticketId, body, staffOnly ?? false),
    onSuccess: invalidate,
  })
}

export function useUpdateTicketMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({
      ticketId,
      patch,
    }: {
      ticketId: Uuid
      patch: { status?: TicketStatus; assignee_id?: Uuid | null }
    }) => admin.updateTicket(null, ticketId, patch),
    onSuccess: invalidate,
  })
}

export function useAssignTicketMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({
      ticketId,
      assigneeId,
    }: {
      ticketId: Uuid
      assigneeId: Uuid | null
    }) => admin.assignTicket(null, ticketId, assigneeId),
    onSuccess: invalidate,
  })
}

// ── communities ────────────────────────────────────────────────────────────

export function useAdminCommunities(
  params: { q?: string; is_quarantined?: boolean; limit?: number } = {},
) {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.communities(JSON.stringify(params)),
    queryFn: () => admin.communities(null, params),
    enabled: isStaff,
  })
}

export function useQuarantineCommunityMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({
      communityId,
      reason,
    }: {
      communityId: Uuid
      reason: string
    }) => admin.quarantineCommunity(null, communityId, reason),
    onSuccess: invalidate,
  })
}

export function useUnquarantineCommunityMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: (communityId: Uuid) => admin.unquarantineCommunity(null, communityId),
    onSuccess: invalidate,
  })
}

export function useDeleteAdminCommunityMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: (communityId: Uuid) => admin.deleteCommunity(null, communityId),
    onSuccess: invalidate,
  })
}

// ── live media ─────────────────────────────────────────────────────────────

export function useLiveMediaSessions() {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.liveMedia(),
    queryFn: () => admin.liveMedia(null),
    enabled: isStaff,
    refetchInterval: 5_000,
  })
}

export function useTerminateLiveMediaMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: (roomId: Uuid) => admin.terminateLiveMedia(null, roomId),
    onSuccess: invalidate,
  })
}

// ── system broadcasts ──────────────────────────────────────────────────────

export function useActiveBroadcasts() {
  return useQuery({
    queryKey: broadcastKeys.active(),
    queryFn: () => broadcasts.active(),
    refetchInterval: 60_000,
  })
}

export function useAdminBroadcasts() {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.broadcasts(),
    queryFn: () => admin.broadcasts(null),
    enabled: isStaff,
  })
}

export function useCreateBroadcastMutation() {
  const invalidate = useConsoleInvalidation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewBroadcastInput) => admin.createBroadcast(null, input),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: broadcastKeys.active() })
    },
  })
}

export function useDeleteBroadcastMutation() {
  const invalidate = useConsoleInvalidation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (broadcastId: Uuid) => admin.deleteBroadcast(null, broadcastId),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: broadcastKeys.active() })
    },
  })
}

// ── feature flags & settings ───────────────────────────────────────────────

export function useAdminSettings() {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.settings(),
    queryFn: () => admin.settings(null),
    enabled: isStaff,
  })
}

export function useUpdateSettingMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      admin.updateSetting(null, key, value),
    onSuccess: invalidate,
  })
}

// ── security & bans ────────────────────────────────────────────────────────

export function useIpBans() {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.ipBans(),
    queryFn: () => admin.ipBans(null),
    enabled: isStaff,
  })
}

export function useBanIpMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({
      ipOrCidr,
      reason,
      expiresAt,
    }: {
      ipOrCidr: string
      reason: string
      expiresAt?: Timestamp
    }) => admin.banIp(null, ipOrCidr, reason, expiresAt),
    onSuccess: invalidate,
  })
}

export function useUnbanIpMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: (banId: Uuid) => admin.unbanIp(null, banId),
    onSuccess: invalidate,
  })
}

export function useBlockedEmailDomains() {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.emailDomains(),
    queryFn: () => admin.emailDomains(null),
    enabled: isStaff,
  })
}

export function useBlockEmailDomainMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({ domain, reason }: { domain: string; reason?: string }) =>
      admin.blockEmailDomain(null, domain, reason),
    onSuccess: invalidate,
  })
}

export function useUnblockEmailDomainMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: (domain: string) => admin.unblockEmailDomain(null, domain),
    onSuccess: invalidate,
  })
}

// ── automod rules ──────────────────────────────────────────────────────────

export function useAutomodRules() {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.automod(),
    queryFn: () => admin.automodRules(null),
    enabled: isStaff,
  })
}

export function useCreateAutomodRuleMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: (input: NewAutomodRuleInput) => admin.createAutomodRule(null, input),
    onSuccess: invalidate,
  })
}

export function useDeleteAutomodRuleMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: (id: Uuid) => admin.deleteAutomodRule(null, id),
    onSuccess: invalidate,
  })
}

// ── system health & telemetry ──────────────────────────────────────────────

export function useSystemTelemetry() {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.telemetry(),
    queryFn: () => admin.telemetry(null),
    enabled: isStaff,
    refetchInterval: 5_000,
  })
}

// ── user session moderation ────────────────────────────────────────────────

export function useRevokeUserSessionsMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: (userId: Uuid) => admin.revokeUserSessions(null, userId),
    onSuccess: invalidate,
  })
}

export function useStaffUpdateUserProfileMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({
      userId,
      patch,
    }: {
      userId: Uuid
      patch: { handle?: string; display_name?: string }
    }) => admin.staffUpdateUserProfile(null, userId, patch),
    onSuccess: invalidate,
  })
}

// ── support, as the person who raised it sees it ──────────────────────────

export function useMyTickets() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: supportKeys.mine(),
    queryFn: () => support.mine(null),
    enabled: signedIn,
  })
}

export function useMyTicket(id: Uuid | null) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: id ? supportKeys.ticket(id) : [...supportKeys.all, 'idle'],
    queryFn: () => support.get(null, id!),
    enabled: signedIn && Boolean(id),
  })
}

export function useOpenTicketMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OpenTicketInput) => support.open(null, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supportKeys.mine() })
    },
  })
}

export function useReplyToMyTicketMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: Uuid; body: string }) =>
      support.reply(null, ticketId, body),
    onSuccess: (_result, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: supportKeys.ticket(ticketId) })
      queryClient.invalidateQueries({ queryKey: supportKeys.mine() })
    },
  })
}
