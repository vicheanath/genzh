import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { admin, support } from '@/lib/api'
import { useAuth, useIsSignedIn } from '@/lib/auth'

import type { OpenTicketInput, PlatformRole, TicketStatus, Uuid } from './types'

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

export function useAuditLog(filter: { action?: string; subject_id?: Uuid } = {}) {
  const isAdmin = useIsPlatformAdmin()
  return useQuery({
    queryKey: adminKeys.audit(JSON.stringify(filter)),
    queryFn: () => admin.audit(null, { ...filter, limit: 100 }),
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
 * Account search.
 *
 * Disabled until there is something to search for — an empty query would match
 * every account, which is exactly what this endpoint is shaped to prevent.
 */
export function useUserSearch(query: string) {
  const isStaff = useIsStaff()
  const trimmed = query.trim()
  return useQuery({
    queryKey: adminKeys.users(trimmed),
    queryFn: () => admin.searchUsers(null, trimmed),
    enabled: isStaff && trimmed.length > 0,
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

export function useSupportQueue(filter: { status?: TicketStatus } = {}) {
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
