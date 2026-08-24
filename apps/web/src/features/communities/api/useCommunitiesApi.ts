import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { communitiesApi } from './communitiesApi'
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
  detail: (id: Uuid) => [...communityKeys.all, 'detail', id] as const,
  members: (id: Uuid) => [...communityKeys.detail(id), 'members'] as const,
  roles: (id: Uuid) => [...communityKeys.detail(id), 'roles'] as const,
}

export function useCommunitiesList(token: string | null) {
  return useQuery({
    queryKey: communityKeys.list(),
    queryFn: () => (token ? communitiesApi.list(token) : Promise.reject(new Error('Unauthenticated'))),
    enabled: Boolean(token),
  })
}

export function useCommunityDetail(token: string | null, communityId: Uuid | null) {
  return useQuery({
    queryKey: communityId ? communityKeys.detail(communityId) : ['communities', 'unselected'],
    queryFn: () => {
      if (!token || !communityId) throw new Error('Unauthenticated or invalid ID')
      return communitiesApi.get(token, communityId)
    },
    enabled: Boolean(token && communityId),
  })
}

export function useCommunityMembers(
  token: string | null,
  communityId: Uuid | null,
  limit = 100,
) {
  return useQuery({
    queryKey: communityId ? communityKeys.members(communityId) : ['communities', 'unselected', 'members'],
    queryFn: () => {
      if (!token || !communityId) throw new Error('Unauthenticated or invalid ID')
      return communitiesApi.getMembers(token, communityId, limit)
    },
    enabled: Boolean(token && communityId),
  })
}

export function useCommunityRoles(token: string | null, communityId: Uuid | null) {
  return useQuery({
    queryKey: communityId ? communityKeys.roles(communityId) : ['communities', 'unselected', 'roles'],
    queryFn: () => {
      if (!token || !communityId) throw new Error('Unauthenticated or invalid ID')
      return communitiesApi.getRoles(token, communityId)
    },
    enabled: Boolean(token && communityId),
  })
}

export function useCreateCommunityMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCommunityInput) => {
      if (!token) throw new Error('Unauthenticated')
      return communitiesApi.create(token, input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.list() })
    },
  })
}

export function useUpdateCommunityMutation(token: string | null, communityId: Uuid | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateCommunityInput) => {
      if (!token || !communityId) throw new Error('Unauthenticated or invalid ID')
      return communitiesApi.update(token, communityId, input)
    },
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: communityKeys.detail(communityId) })
      }
      queryClient.invalidateQueries({ queryKey: communityKeys.list() })
    },
  })
}

export function useDeleteCommunityMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (communityId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return communitiesApi.delete(token, communityId)
    },
    onSuccess: (_data, communityId) => {
      queryClient.removeQueries({ queryKey: communityKeys.detail(communityId) })
      queryClient.invalidateQueries({ queryKey: communityKeys.list() })
    },
  })
}

export function useJoinCommunityMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (communityId: Uuid) => {
      if (!token) throw new Error('Unauthenticated')
      return communitiesApi.join(token, communityId)
    },
    onSuccess: (_data, communityId) => {
      queryClient.invalidateQueries({ queryKey: communityKeys.list() })
      queryClient.invalidateQueries({ queryKey: communityKeys.members(communityId) })
    },
  })
}

export function useLeaveCommunityMutation(token: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ communityId, userId }: { communityId: Uuid; userId: Uuid }) => {
      if (!token) throw new Error('Unauthenticated')
      return communitiesApi.leave(token, communityId, userId)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: communityKeys.list() })
      queryClient.invalidateQueries({ queryKey: communityKeys.members(variables.communityId) })
    },
  })
}

export function useCreateRoleMutation(token: string | null, communityId: Uuid | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRoleInput) => {
      if (!token || !communityId) throw new Error('Unauthenticated or invalid ID')
      return communitiesApi.createRole(token, communityId, input)
    },
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: communityKeys.roles(communityId) })
      }
    },
  })
}

export function useUpdateRoleMutation(token: string | null, communityId: Uuid | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ roleId, input }: { roleId: Uuid; input: UpdateRoleInput }) => {
      if (!token || !communityId) throw new Error('Unauthenticated or invalid ID')
      return communitiesApi.updateRole(token, communityId, roleId, input)
    },
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: communityKeys.roles(communityId) })
      }
    },
  })
}

export function useAssignRoleMutation(token: string | null, communityId: Uuid | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: Uuid; roleId: Uuid }) => {
      if (!token || !communityId) throw new Error('Unauthenticated or invalid ID')
      return communitiesApi.assignRole(token, communityId, userId, roleId)
    },
    onSuccess: () => {
      if (communityId) {
        queryClient.invalidateQueries({ queryKey: communityKeys.members(communityId) })
      }
    },
  })
}
