import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { communities } from '@/lib/api'
import { useIsSignedIn } from '@/lib/auth'

import type {
  CreateCommunityInput,
  CreateRoleInput,
  UpdateCommunityInput,
  UpdateRoleInput,
  Uuid,
} from './types'

export const communityKeys = {
  all: ['communities'] as const,
  list: () => [...communityKeys.all, 'list'] as const,
  templates: () => [...communityKeys.all, 'templates'] as const,
  detail: (id: Uuid) => [...communityKeys.all, 'detail', id] as const,
  members: (id: Uuid) => [...communityKeys.detail(id), 'members'] as const,
  roles: (id: Uuid) => [...communityKeys.detail(id), 'roles'] as const,
}

const idle = (...parts: string[]) => [...communityKeys.all, 'idle', ...parts] as const

export function useCommunitiesList() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: communityKeys.list(),
    queryFn: () => communities.list(null),
    enabled: signedIn,
  })
}

/**
 * The shapes a new community can be built from.
 *
 * A static catalogue that changes only when the server is deployed, so it is
 * never refetched within a session — but it is still *fetched*, because the
 * server is what builds the channels and roles each template promises.
 */
export function useCommunityTemplates() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: communityKeys.templates(),
    queryFn: () => communities.templates(null),
    enabled: signedIn,
    staleTime: Infinity,
  })
}

export function useCommunityDetail(communityId: Uuid | null | undefined) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: communityId ? communityKeys.detail(communityId) : idle('detail'),
    queryFn: () => communities.get(null, communityId!),
    enabled: signedIn && Boolean(communityId),
  })
}

export function useCommunityMembers(communityId: Uuid | null | undefined, limit = 100) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: communityId ? communityKeys.members(communityId) : idle('members'),
    queryFn: () => communities.members(null, communityId!, limit),
    enabled: signedIn && Boolean(communityId),
  })
}

export function useCommunityRoles(communityId: Uuid | null | undefined) {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: communityId ? communityKeys.roles(communityId) : idle('roles'),
    queryFn: () => communities.roles(null, communityId!),
    enabled: signedIn && Boolean(communityId),
  })
}

export function useCreateCommunityMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCommunityInput) => communities.create(null, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.list() })
    },
  })
}

export function useUpdateCommunityMutation(communityId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateCommunityInput) => communities.update(null, communityId!, input),
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: communityKeys.detail(communityId) })
      }
      queryClient.invalidateQueries({ queryKey: communityKeys.list() })
    },
  })
}

export function useDeleteCommunityMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (communityId: Uuid) => communities.delete(null, communityId),
    onSuccess: (_result, communityId) => {
      queryClient.removeQueries({ queryKey: communityKeys.detail(communityId) })
      queryClient.invalidateQueries({ queryKey: communityKeys.list() })
    },
  })
}

export function useJoinCommunityMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (communityId: Uuid) => communities.join(null, communityId),
    onSuccess: (_result, communityId) => {
      queryClient.invalidateQueries({ queryKey: communityKeys.list() })
      queryClient.invalidateQueries({ queryKey: communityKeys.members(communityId) })
    },
  })
}

export function useLeaveCommunityMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ communityId, userId }: { communityId: Uuid; userId: Uuid }) =>
      communities.leave(null, communityId, userId),
    onSuccess: (_result, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: communityKeys.list() })
      queryClient.invalidateQueries({ queryKey: communityKeys.members(communityId) })
    },
  })
}

export function useCreateRoleMutation(communityId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRoleInput) => communities.createRole(null, communityId!, input),
    onSuccess: () => {
      if (communityId) queryClient.invalidateQueries({ queryKey: communityKeys.roles(communityId) })
    },
  })
}

export function useUpdateRoleMutation(communityId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ roleId, input }: { roleId: Uuid; input: UpdateRoleInput }) =>
      communities.updateRole(null, communityId!, roleId, input),
    onSuccess: () => {
      if (communityId) queryClient.invalidateQueries({ queryKey: communityKeys.roles(communityId) })
    },
  })
}

export function useAssignRoleMutation(communityId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: Uuid; roleId: Uuid }) =>
      communities.assignRole(null, communityId!, userId, roleId),
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: communityKeys.members(communityId) })
      }
    },
  })
}

export function useRemoveRoleMutation(communityId: Uuid | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: Uuid; roleId: Uuid }) =>
      communities.removeRole(null, communityId!, userId, roleId),
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: communityKeys.members(communityId) })
      }
    },
  })
}
