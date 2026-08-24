//! Roles, and who may hand them out.
//!
//! Its own service because roles answer to their own rule — you cannot grant a
//! permission you do not hold — and that rule has nothing to say about founding
//! a community or admitting a member. Sharing the repository with
//! [`CommunityService`] is deliberate: they are two behaviours over one store,
//! not two stores.
//!
//! Every method starts by resolving the actor's standing through
//! [`CommunityService::member_context`], so authorization is asked the same
//! question here as everywhere else.

use genzh_domain::community::{self, Role, RoleWithPermissions};
use genzh_domain::{
    CommunityId, DomainError, Permission, PermissionSet, RoleId, UserId, now,
};
use genzh_infrastructure::{ServiceError, ServiceResult};

use crate::authorization::MemberContext;
use crate::repository::CommunityRepository;
use crate::service::{CommunityService, CreateRole, UpdateRole};

/// Creating, editing and assigning roles.
#[derive(Debug, Clone)]
pub struct RoleService {
    communities: CommunityService,
    repository: CommunityRepository,
}

impl RoleService {
    pub(crate) fn new(communities: CommunityService, repository: CommunityRepository) -> Self {
        Self {
            communities,
            repository,
        }
    }

    /// Create a role.
    pub async fn create(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
        input: CreateRole,
    ) -> ServiceResult<RoleWithPermissions> {
        let context = self.communities.member_context(community_id, actor_id).await?;
        context.require(Permission::ManageRoles)?;

        let permissions = guard_privilege_escalation(&context, input.permissions)?;
        let name = community::validate_role_name(&input.name)?;

        let role = Role {
            id: RoleId::new(),
            community_id,
            name,
            color: input.color,
            position: input.position.unwrap_or(0),
            is_default: false,
            created_at: now(),
        };

        let created = self.repository.create_role(&role, &permissions).await?;
        Ok(RoleWithPermissions {
            role: created,
            permissions: PermissionSet::from_permissions(permissions),
        })
    }

    /// Update a role.
    pub async fn update(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
        role_id: RoleId,
        input: UpdateRole,
    ) -> ServiceResult<RoleWithPermissions> {
        let context = self.communities.member_context(community_id, actor_id).await?;
        context.require(Permission::ManageRoles)?;

        let existing = self
            .repository
            .find_role(community_id, role_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("role"))?;

        // Renaming @everyone would break the invariant that every community has
        // a role by that name for clients to display.
        if existing.is_default && input.name.is_some() {
            return Err(ServiceError::Domain(DomainError::invalid(
                "name",
                "the default role cannot be renamed",
            )));
        }

        let name = input
            .name
            .as_deref()
            .map(community::validate_role_name)
            .transpose()?;
        let permissions = input
            .permissions
            .map(|permissions| guard_privilege_escalation(&context, permissions))
            .transpose()?;

        let updated = self
            .repository
            .update_role(
                community_id,
                role_id,
                name.as_deref(),
                input.color.as_deref(),
                input.position,
                permissions.as_deref(),
            )
            .await?;

        let effective = match permissions {
            Some(permissions) => PermissionSet::from_permissions(permissions),
            None => {
                PermissionSet::from_permissions(self.repository.role_permissions(role_id).await?)
            }
        };

        Ok(RoleWithPermissions {
            role: updated,
            permissions: effective,
        })
    }

    /// Assign a role to a member.
    pub async fn assign(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
        target_id: UserId,
        role_id: RoleId,
    ) -> ServiceResult<()> {
        let context = self.communities.member_context(community_id, actor_id).await?;
        context.require(Permission::ManageRoles)?;

        if self
            .repository
            .find_role(community_id, role_id)
            .await?
            .is_none()
        {
            return Err(ServiceError::not_found("role"));
        }
        if self
            .repository
            .find_member(community_id, target_id)
            .await?
            .is_none()
        {
            return Err(ServiceError::not_found("membership"));
        }

        // Handing out a permission you do not hold is escalation by proxy.
        let granted = self.repository.role_permissions(role_id).await?;
        guard_privilege_escalation(&context, granted)?;

        self.repository
            .assign_role(community_id, target_id, role_id)
            .await?;
        Ok(())
    }

    /// Take a role away from a member.
    ///
    /// Guarded like assigning, and for a related reason: the escalation check
    /// stops someone with `manage_roles` from stripping powers they do not
    /// themselves hold — demoting the owner out of their own community would
    /// otherwise be one request away.
    pub async fn remove(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
        target_id: UserId,
        role_id: RoleId,
    ) -> ServiceResult<()> {
        let context = self.communities.member_context(community_id, actor_id).await?;
        context.require(Permission::ManageRoles)?;

        let role = self
            .repository
            .find_role(community_id, role_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("role"))?;

        // `@everyone` is not held by assignment, so it cannot be taken away;
        // removing it would mean removing the membership.
        if role.is_default {
            return Err(ServiceError::Domain(DomainError::invalid(
                "role_id",
                "the default role cannot be removed from a member",
            )));
        }

        let granted = self.repository.role_permissions(role_id).await?;
        guard_privilege_escalation(&context, granted)?;

        if !self
            .repository
            .remove_role(community_id, target_id, role_id)
            .await?
        {
            return Err(ServiceError::not_found("member_role"));
        }
        Ok(())
    }

    /// List roles with their permissions.
    pub async fn list(
        &self,
        community_id: CommunityId,
        user_id: UserId,
    ) -> ServiceResult<Vec<RoleWithPermissions>> {
        self.communities.member_context(community_id, user_id).await?;

        let roles = self.repository.list_roles(community_id).await?;
        let mut out = Vec::with_capacity(roles.len());
        for role in roles {
            let permissions =
                PermissionSet::from_permissions(self.repository.role_permissions(role.id).await?);
            out.push(RoleWithPermissions { role, permissions });
        }
        Ok(out)
    }}

/// Refuse to grant a permission the actor does not themselves hold.
///
/// Without this, anyone with `manage_roles` could mint an `administrator` role
/// and assign it to themselves — the classic privilege-escalation hole in
/// role-based systems. Administrators are exempt because they already hold
/// everything there is to grant.
fn guard_privilege_escalation(
    context: &MemberContext,
    requested: Vec<Permission>,
) -> Result<Vec<Permission>, ServiceError> {
    if context.is_admin() {
        return Ok(requested);
    }

    for permission in &requested {
        if !context.allows(*permission) {
            return Err(ServiceError::Domain(DomainError::PermissionDenied(
                permission.key(),
            )));
        }
    }
    Ok(requested)
}

#[cfg(test)]
mod tests {
    use super::*;
    use genzh_domain::community::Community;
    use std::collections::HashSet;

    fn context(is_owner: bool, granted: &[Permission]) -> MemberContext {
        let owner = UserId::new();
        let member = if is_owner { owner } else { UserId::new() };
        let community = Community {
            id: CommunityId::new(),
            name: "Night Owls".into(),
            description: None,
            icon_url: None,
            owner_id: owner,
            created_at: now(),
            updated_at: now(),
        };
        MemberContext::new(&community, member, HashSet::new(), granted.iter().copied())
    }

    #[test]
    fn a_moderator_cannot_mint_a_role_more_powerful_than_themselves() {
        let moderator = context(false, &[Permission::ManageRoles, Permission::MuteMembers]);

        let escalation = guard_privilege_escalation(&moderator, vec![Permission::Administrator]);
        assert!(matches!(
            escalation,
            Err(ServiceError::Domain(DomainError::PermissionDenied(
                "administrator"
            )))
        ));

        let also_escalation =
            guard_privilege_escalation(&moderator, vec![Permission::ManageCommunity]);
        assert!(also_escalation.is_err());
    }

    #[test]
    fn a_moderator_may_grant_what_they_already_hold() {
        let moderator = context(false, &[Permission::ManageRoles, Permission::MuteMembers]);
        let granted =
            guard_privilege_escalation(&moderator, vec![Permission::MuteMembers]).expect("allowed");
        assert_eq!(granted, vec![Permission::MuteMembers]);
    }

    #[test]
    fn an_owner_may_grant_anything() {
        let owner = context(true, &[]);
        let granted = guard_privilege_escalation(&owner, Permission::ALL.to_vec())
            .expect("owners hold everything");
        assert_eq!(granted.len(), Permission::ALL.len());
    }

    #[test]
    fn granting_nothing_is_always_allowed() {
        let nobody = context(false, &[]);
        assert!(guard_privilege_escalation(&nobody, vec![]).is_ok());
    }
}
