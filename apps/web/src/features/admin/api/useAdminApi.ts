import { useEffect } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { admin, broadcasts, support } from '@/lib/api'
import { useAuth, useIsSignedIn } from '@/lib/auth'
import { chatSocket, type ChatServerEvent, type ConsoleTopic } from '@/lib/ws/ChatSocket'

import type {
  AuditEntry,
  NewAutomodRuleInput,
  NewBroadcastInput,
  OpenTicketInput,
  Page,
  PlatformRole,
  StaffUserView,
  SupportTicket,
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
  jobs: () => [...adminKeys.all, 'jobs'] as const,
  recommendationCoverage: () => [...adminKeys.all, 'recommendations', 'coverage'] as const,
  recommendationExplain: (userId: Uuid, surface: string) =>
    [...adminKeys.all, 'recommendations', 'explain', userId, surface] as const,
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

/**
 * Pull the `(created_at, id)` cursor off a page, or `undefined` when it is the
 * last one.
 *
 * Both halves or neither: React Query treats `undefined` as "no more pages", so
 * returning a half-cursor would silently page with a timestamp alone and skip
 * every row sharing a boundary timestamp.
 */
function nextPageCursor<T>(page: Page<T>) {
  return page.next_cursor && page.next_cursor_id
    ? { cursor: page.next_cursor, cursorId: page.next_cursor_id }
    : undefined
}

/**
 * The audit log, newest first, one page at a time.
 *
 * Infinite rather than a single fetch: the log is the console's deepest
 * history, and before this the console could only ever show the newest page of
 * it — there was no way to reach anything older.
 */
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
  return useInfiniteQuery({
    queryKey: adminKeys.audit(JSON.stringify(filter)),
    queryFn: ({ pageParam }) =>
      admin.audit(null, {
        limit: 100,
        ...filter,
        ...(pageParam ? { before: pageParam.cursor, before_id: pageParam.cursorId } : {}),
      }),
    initialPageParam: undefined as { cursor: Timestamp; cursorId: Uuid } | undefined,
    getNextPageParam: nextPageCursor,
    enabled: isAdmin,
  })
}

/** Every audit entry loaded so far, flattened across pages. */
export function useAuditEntries(query: ReturnType<typeof useAuditLog>): AuditEntry[] {
  return query.data?.pages.flatMap((page) => page.items) ?? []
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
  return useInfiniteQuery({
    queryKey: adminKeys.users(`${trimmed}:${JSON.stringify(options)}`),
    queryFn: ({ pageParam }) =>
      admin.searchUsers(null, trimmed, {
        ...options,
        ...(pageParam ? { before: pageParam.cursor, before_id: pageParam.cursorId } : {}),
      }),
    initialPageParam: undefined as { cursor: Timestamp; cursorId: Uuid } | undefined,
    getNextPageParam: nextPageCursor,
    enabled: isStaff,
  })
}

/** Every account loaded so far, flattened across pages. */
export function useSearchedAccounts(
  query: ReturnType<typeof useUserSearch>,
): StaffUserView[] {
  return query.data?.pages.flatMap((page) => page.items) ?? []
}

export function useStaffList() {
  const isAdmin = useIsPlatformAdmin()
  return useQuery({
    queryKey: adminKeys.staff(),
    queryFn: () => admin.listStaff(null),
    enabled: isAdmin,
  })
}

/**
 * The support queue, oldest first, one page at a time.
 *
 * Pages *forwards*: the longest wait belongs at the top, so the next page is
 * further down the backlog rather than further back in time.
 *
 * No `refetchInterval`. The queue is worked by several people at once and a
 * stale one sends two agents to the same ticket — but a socket signal now says
 * when it changed, which beats a timer that is wrong in both directions: too
 * slow the moment it matters, and refetching all night when nothing is
 * happening. See {@link useConsoleLiveUpdates}.
 */
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
  return useInfiniteQuery({
    queryKey: adminKeys.tickets(JSON.stringify(filter)),
    queryFn: ({ pageParam }) =>
      admin.tickets(null, {
        ...filter,
        ...(pageParam ? { after: pageParam.cursor, after_id: pageParam.cursorId } : {}),
      }),
    initialPageParam: undefined as { cursor: Timestamp; cursorId: Uuid } | undefined,
    getNextPageParam: nextPageCursor,
    enabled: isStaff,
  })
}

/** Every ticket loaded so far, flattened across pages. */
export function useQueuedTickets(
  query: ReturnType<typeof useSupportQueue>,
): SupportTicket[] {
  return query.data?.pages.flatMap((page) => page.items) ?? []
}

/**
 * How many tickets are still open — every one of them, not just the pages
 * loaded. Read off the first page, which is where the server puts the count.
 */
export function useOpenTicketCount(
  query: ReturnType<typeof useSupportQueue>,
): number {
  return query.data?.pages[0]?.open_count ?? 0
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

// ── background jobs ───────────────────────────────────────────────────────

/**
 * What the background scheduler has been doing, failing jobs first.
 *
 * Polled rather than pushed: a job that fails at 03:00 emits no socket frame,
 * and a console left open overnight should still show it by morning. Sixty
 * seconds is well inside the shortest schedule any job runs on.
 *
 * The counters are per-process and reset on restart, which is the honest scope
 * for an in-process scheduler — they describe the instance that answered.
 */
export function useBackgroundJobs() {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.jobs(),
    queryFn: () => admin.jobs(null),
    enabled: isStaff,
    refetchInterval: 60_000,
  })
}

/**
 * Run one job now rather than waiting for its next tick. Admin only, audited.
 *
 * Succeeds as a *request* even when the run itself failed — read `healthy` and
 * `last_error` off the returned report rather than treating settled as fine.
 */
export function useRunJobMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => admin.runJob(null, name),
    onSuccess: () => {
      // The job just deleted rows somewhere; the audit log gained an entry for
      // the trigger, and whatever the job touched is now stale.
      queryClient.invalidateQueries({ queryKey: adminKeys.all })
    },
  })
}

// ── bulk enforcement ──────────────────────────────────────────────────────

/**
 * Suspend several accounts at once.
 *
 * Resolves with a per-account report even when some accounts failed. The caller
 * must read {@link BulkReport.outcomes}: treating a settled mutation as "all
 * forty done" is exactly the mistake this shape exists to prevent.
 */
export function useBulkSuspendMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: ({ userIds, reason }: { userIds: Uuid[]; reason: string }) =>
      admin.bulkSuspendUsers(null, userIds, reason),
    onSuccess: invalidate,
  })
}

/** Lift suspensions on several accounts. Same per-account reporting. */
export function useBulkReinstateMutation() {
  const invalidate = useConsoleInvalidation()
  return useMutation({
    mutationFn: (userIds: Uuid[]) => admin.bulkReinstateUsers(null, userIds),
    onSuccess: invalidate,
  })
}

// ── recommendation engine ─────────────────────────────────────────────────

/**
 * What the recommendation engine has to work with, platform-wide.
 *
 * The numbers that separate "the ranking is wrong" from "there is nothing to
 * rank" — which look identical from a thin feed and have completely different
 * fixes.
 */
export function useRecommendationCoverage() {
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: adminKeys.recommendationCoverage(),
    queryFn: () => admin.recommendationCoverage(null),
    enabled: isStaff,
    refetchInterval: 60_000,
  })
}

/**
 * One account's feed, with the reasons behind each entry. Admin only.
 *
 * `enabled` on a supplied id, so the panel does not fire a query for nobody
 * before an account has been chosen.
 */
export function useRecommendationExplain(userId: Uuid | null, surface: string) {
  const isAdmin = useIsPlatformAdmin()
  return useQuery({
    queryKey: adminKeys.recommendationExplain(userId ?? ('none' as Uuid), surface),
    queryFn: () => admin.explainRecommendations(null, { user_id: userId!, surface, limit: 10 }),
    enabled: isAdmin && Boolean(userId),
  })
}

// ── live updates ──────────────────────────────────────────────────────────

/** Which console queries a topic makes stale. */
const TOPIC_KEYS: Record<ConsoleTopic, readonly (readonly unknown[])[]> = {
  // Prefixes, not exact keys: every filter the panel offers produces its own
  // query key, and a signal has no idea which filters are on screen. React
  // Query matches by prefix, so invalidating `['admin','tickets']` catches all
  // of them.
  support_queue: [[...adminKeys.all, 'tickets'], adminKeys.stats()],
  live_media: [adminKeys.liveMedia()],
  broadcasts: [adminKeys.broadcasts(), broadcastKeys.active()],
  users: [[...adminKeys.all, 'users'], adminKeys.staff(), adminKeys.stats()],
  audit_log: [[...adminKeys.all, 'audit']],
}

/**
 * Refetch console lists when the server says they changed.
 *
 * Invalidation, not a cache write — which is why this is here rather than in
 * `useQueryCacheSync`. The frame carries no data by design: it says *that* the
 * queue moved, and React Query refetches it over REST, where staff authority is
 * re-checked on that request. A payload would make the socket a second, weaker
 * copy of that check.
 *
 * Mount it once, in the console shell. Off the console there is nothing to
 * invalidate, and staying subscribed would refetch lists nobody is looking at.
 */
export function useConsoleLiveUpdates(enabled = true): void {
  const queryClient = useQueryClient()
  const isStaff = useIsStaff()

  useEffect(() => {
    if (!enabled || !isStaff) return

    return chatSocket.on<ChatServerEvent>('console_changed', (event) => {
      if (event.type !== 'console_changed') return

      // An unknown topic from a newer server invalidates nothing rather than
      // throwing: the console should degrade to its old polling behaviour, not
      // break on a field it does not recognise yet.
      for (const queryKey of TOPIC_KEYS[event.topic] ?? []) {
        queryClient.invalidateQueries({ queryKey })
      }
    })
  }, [queryClient, enabled, isStaff])
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
