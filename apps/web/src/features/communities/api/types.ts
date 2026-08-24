import type {
  Community,
  CommunityMember,
  CommunityWithPermissions,
  CreateRoleInput,
  Permission,
  Role,
  RoleWithPermissions,
  Timestamp,
  Uuid,
} from '@/lib/api'

export interface CreateCommunityInput {
  name: string
  description?: string
  icon_url?: string
}

export interface UpdateCommunityInput {
  name?: string
  description?: string
  icon_url?: string
}

export interface UpdateRoleInput {
  name?: string
  color?: string
  position?: number
  permissions?: string[]
}

export type {
  Community,
  CommunityMember,
  CommunityWithPermissions,
  CreateRoleInput,
  Permission,
  Role,
  RoleWithPermissions,
  Timestamp,
  Uuid,
}
