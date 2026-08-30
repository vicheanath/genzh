import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { communities } from '../api/endpoints'
import type { Uuid } from '../api/types'
import { queryKeys } from './keys'

export function useCommunitiesQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.communities.lists(),
    queryFn: () => (token ? communities.list(token) : Promise.reject(new Error('No token'))),
    enabled: Boolean(token),
  })
}

export function useCommunityQuery(token: string | null, communityId: Uuid | null | undefined) {
  return useQuery({
    queryKey: communityId ? queryKeys.communities.detail(communityId) : ['communities', 'detail', null],
    queryFn: () => {
      if (!token || !communityId) throw new Error('Missing token or communityId')
      return communities.get(token, communityId)
    },
    enabled: Boolean(token && communityId),
  })
}

export function useCommunityMembersQuery(
  token: string | null,
  communityId: Uuid | null | undefined,
  limit = 100,
) {
  return useQuery({
    queryKey: communityId ? queryKeys.communities.members(communityId) : ['communities', 'members', null],
    queryFn: () => {
      if (!token || !communityId) throw new Error('Missing token or communityId')
      return communities.members(token, communityId, limit)
    },
    enabled: Boolean(token && communityId),
  })
}

export function useCommunityRolesQuery(
  token: string | null,
  communityId: Uuid | null | undefined,
) {
  return useQuery({
    queryKey: communityId ? queryKeys.communities.roles(communityId) : ['communities', 'roles', null],
    queryFn: () => {
      if (!token || !communityId) throw new Error('Missing token or communityId')
      return communities.roles(token, communityId)
    },
    enabled: Boolean(token && communityId),
  })
}

export function useCreateCommunityMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; description?: string; icon_url?: string }) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.create(token, input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.lists() })
    },
  })
}

export function useJoinCommunityMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (communityId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.join(token, communityId)
    },
    onSuccess: (_data, communityId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) })
    },
  })
}

export function useLeaveCommunityMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ communityId, userId }: { communityId: Uuid; userId: Uuid }) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.leave(token, communityId, userId)
    },
    onSuccess: (_data, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) })
    },
  })
}

export function useUpdateCommunityMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      communityId,
      input,
    }: {
      communityId: Uuid
      input: { name?: string; description?: string; icon_url?: string }
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.update(token, communityId, input)
    },
    onSuccess: (_data, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) })
    },
  })
}

export function useDeleteCommunityMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (communityId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.delete(token, communityId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.all })
    },
  })
}

export function useCreateRoleMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      communityId,
      input,
    }: {
      communityId: Uuid
      input: { name: string; color?: string; position?: number; permissions?: string[] }
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.createRole(token, communityId, input)
    },
    onSuccess: (_data, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.roles(communityId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) })
    },
  })
}

export function useUpdateRoleMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      communityId,
      roleId,
      input,
    }: {
      communityId: Uuid
      roleId: Uuid
      input: { name?: string; color?: string; position?: number; permissions?: string[] }
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.updateRole(token, communityId, roleId, input)
    },
    onSuccess: (_data, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.roles(communityId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) })
    },
  })
}

export function useAssignRoleMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      communityId,
      userId,
      roleId,
    }: {
      communityId: Uuid
      userId: Uuid
      roleId: Uuid
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.assignRole(token, communityId, userId, roleId)
    },
    onSuccess: (_data, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.members(communityId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) })
    },
  })
}

export function useRemoveRoleMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      communityId,
      userId,
      roleId,
    }: {
      communityId: Uuid
      userId: Uuid
      roleId: Uuid
    }) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.removeRole(token, communityId, userId, roleId)
    },
    onSuccess: (_data, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.members(communityId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) })
    },
  })
}


// ── invite links ────────────────────────────────────────────────────────────
//
// One link is two very different things depending on which side of it you are
// standing on, and the hooks below keep that split.
//
// A *moderator* manages invites inside a community they already belong to, so
// those three hang off `communities.invites(id)` and invalidate together. A
// *recipient* holds nothing but a code — no community id, no membership — so
// the preview is keyed by the code alone and the redemption is what turns the
// one into the other.

export function useCommunityInvitesQuery(
  token: string | null,
  communityId: Uuid | null | undefined,
) {
  return useQuery({
    queryKey: communityId
      ? queryKeys.communities.invites(communityId)
      : ['communities', 'invites', null],
    queryFn: () => {
      if (!token || !communityId) throw new Error('Missing token or communityId')
      return communities.listInvites(token, communityId)
    },
    enabled: Boolean(token && communityId),
  })
}

export function useCreateInviteMutation(
  token: string | null,
  communityId: Uuid | null | undefined,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { expires_in_hours?: number; max_uses?: number }) => {
      if (!token || !communityId) throw new Error('Missing token or communityId')
      return communities.createInvite(token, communityId, input)
    },
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.communities.invites(communityId) })
      }
    },
  })
}

export function useRevokeInviteMutation(
  token: string | null,
  communityId: Uuid | null | undefined,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.revokeInvite(token, code)
    },
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.communities.invites(communityId) })
      }
      // The code is dead now, so a preview held from before must not survive to
      // tell the next reader the link still works.
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.all })
    },
  })
}

/**
 * What is behind a code, before deciding whether to walk through it.
 *
 * `retry: false` because the failure this most often hits is a 404 for a
 * revoked or expired link, and that is an answer rather than a hiccup —
 * retrying it three times only delays telling the reader so.
 */
export function useInvitePreviewQuery(token: string | null, code: string | null | undefined) {
  return useQuery({
    queryKey: code
      ? queryKeys.communities.invitePreview(code)
      : ['communities', 'invitePreview', null],
    queryFn: () => {
      if (!token || !code) throw new Error('Missing token or code')
      return communities.previewInvite(token, code)
    },
    enabled: Boolean(token && code),
    retry: false,
  })
}

export function useRedeemInviteMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => {
      if (!token) throw new Error('Unauthenticated')
      return communities.redeemInvite(token, code)
    },
    onSuccess: (community) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(community.id) })
      // Joining changes what the shell renders, and the boot payload is where
      // the community list on every other screen came from.
      queryClient.invalidateQueries({ queryKey: queryKeys.bff.meOverview() })
    },
  })
}
