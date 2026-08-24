import { communities as coreCommunities } from '@/lib/api'
import type {
  Community,
  CommunityMember,
  CommunityWithPermissions,
  CreateCommunityInput,
  CreateRoleInput,
  RoleWithPermissions,
  UpdateCommunityInput,
  UpdateRoleInput,
  Uuid,
} from './types'

/**
 * Backend-for-Frontend (BFF) Communities API client.
 * Manages community CRUD, member joining/leaving, role hierarchy, and permissions.
 * Every method adheres to Single Responsibility and handles a dedicated backend communication flow.
 */
export const communitiesApi = {
  /** List all communities the current user belongs to or can discover. */
  list(token: string): Promise<Community[]> {
    return coreCommunities.list(token)
  },

  /** Get full community details and caller's permission set. */
  get(token: string, communityId: Uuid): Promise<CommunityWithPermissions> {
    return coreCommunities.get(token, communityId)
  },

  /** Create a new community with initial owner roles. */
  create(token: string, input: CreateCommunityInput): Promise<CommunityWithPermissions> {
    return coreCommunities.create(token, input)
  },

  /** Update community details (name, description, icon). */
  update(
    token: string,
    communityId: Uuid,
    input: UpdateCommunityInput,
  ): Promise<Community> {
    return coreCommunities.update(token, communityId, input)
  },

  /** Delete a community permanently. */
  delete(token: string, communityId: Uuid): Promise<void> {
    return coreCommunities.delete(token, communityId)
  },

  /** Join a community as a standard member. */
  join(token: string, communityId: Uuid): Promise<CommunityMember> {
    return coreCommunities.join(token, communityId)
  },

  /** Leave or remove a user from a community. */
  leave(token: string, communityId: Uuid, userId: Uuid): Promise<void> {
    return coreCommunities.leave(token, communityId, userId)
  },

  /** List members of a community. */
  members(token: string, communityId: Uuid, limit = 100): Promise<CommunityMember[]> {
    return coreCommunities.members(token, communityId, limit)
  },
  getMembers(token: string, communityId: Uuid, limit = 100): Promise<CommunityMember[]> {
    return coreCommunities.members(token, communityId, limit)
  },

  /** List defined roles and assigned permissions. */
  roles(token: string, communityId: Uuid): Promise<RoleWithPermissions[]> {
    return coreCommunities.roles(token, communityId)
  },
  getRoles(token: string, communityId: Uuid): Promise<RoleWithPermissions[]> {
    return coreCommunities.roles(token, communityId)
  },

  /** Create a new role within a community. */
  createRole(
    token: string,
    communityId: Uuid,
    input: CreateRoleInput,
  ): Promise<RoleWithPermissions> {
    return coreCommunities.createRole(token, communityId, input)
  },

  /** Update an existing role's permissions, color, or order. */
  updateRole(
    token: string,
    communityId: Uuid,
    roleId: Uuid,
    input: UpdateRoleInput,
  ): Promise<RoleWithPermissions> {
    return coreCommunities.updateRole(token, communityId, roleId, input)
  },

  /** Revoke a role from a member. */
  removeRole(
    token: string,
    communityId: Uuid,
    userId: Uuid,
    roleId: Uuid,
  ): Promise<void> {
    return coreCommunities.removeRole(token, communityId, userId, roleId)
  },

  /** Assign a role to a member. */
  assignRole(
    token: string,
    communityId: Uuid,
    userId: Uuid,
    roleId: Uuid,
  ): Promise<void> {
    return coreCommunities.assignRole(token, communityId, userId, roleId)
  },
}
