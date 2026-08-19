//! The community application service.

use genzh_domain::community::{self, Community, CommunityMember, Role, RoleWithPermissions};
use genzh_domain::{CommunityId, DomainError, Permission, PermissionSet, RoleId, UserId, now};
use genzh_infrastructure::{DbPool, ServiceError, ServiceResult};

use crate::authorization::MemberContext;
use crate::repository::CommunityRepository;

/// Input for creating a community.
#[derive(Debug, Clone)]
pub struct CreateCommunity {
    /// Display name.
    pub name: String,
    /// Optional description.
    pub description: Option<String>,
    /// Optional icon.
    pub icon_url: Option<String>,
}

/// Input for updating a community. Absent fields are left alone.
#[derive(Debug, Clone, Default)]
pub struct UpdateCommunity {
    /// New name.
    pub name: Option<String>,
    /// New description.
    pub description: Option<String>,
    /// New icon.
    pub icon_url: Option<String>,
}

/// Input for creating a role.
#[derive(Debug, Clone)]
pub struct CreateRole {
    /// Display name.
    pub name: String,
    /// Badge colour.
    pub color: Option<String>,
    /// Sort/authority position.
    pub position: Option<i32>,
    /// Permissions granted.
    pub permissions: Vec<Permission>,
}

/// Input for updating a role.
#[derive(Debug, Clone, Default)]
pub struct UpdateRole {
    /// New name.
    pub name: Option<String>,
    /// New colour.
    pub color: Option<String>,
    /// New position.
    pub position: Option<i32>,
    /// Complete replacement permission set, when present.
    pub permissions: Option<Vec<Permission>>,
}

/// Communities, membership and roles.
#[derive(Debug, Clone)]
pub struct CommunityService {
    repository: CommunityRepository,
}

impl CommunityService {
    /// Build the service.
    pub fn new(pool: DbPool) -> Self {
        Self {
            repository: CommunityRepository::new(pool),
        }
    }

    /// The repository, for other services that need to resolve membership.
    pub fn repository(&self) -> &CommunityRepository {
        &self.repository
    }

    /// Resolve a caller's standing in a community.
    ///
    /// This is *the* authorization entry point. Every mutating call in this
    /// crate, and every room and message operation, starts here.
    pub async fn member_context(
        &self,
        community_id: CommunityId,
        user_id: UserId,
    ) -> ServiceResult<MemberContext> {
        let community = self
            .repository
            .find(community_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("community"))?;

        if community.is_owner(user_id) {
            // Short-circuit: the owner needs no membership row to administer
            // their own community, and no role lookup can change the answer.
            return Ok(MemberContext::new(
                &community,
                user_id,
                Default::default(),
                [],
            ));
        }

        if self
            .repository
            .find_member(community_id, user_id)
            .await?
            .is_none()
        {
            return Err(ServiceError::Domain(DomainError::NotAMember));
        }

        let role_ids = self
            .repository
            .member_role_ids(community_id, user_id)
            .await?;
        let granted = self
            .repository
            .member_permissions(community_id, user_id)
            .await?;

        Ok(MemberContext::new(&community, user_id, role_ids, granted))
    }

    /// Create a community, owned by `owner_id`.
    pub async fn create(
        &self,
        owner_id: UserId,
        input: CreateCommunity,
    ) -> ServiceResult<Community> {
        let name = community::validate_community_name(&input.name)?;

        let timestamp = now();
        let candidate = Community {
            id: CommunityId::new(),
            name,
            description: input.description,
            icon_url: input.icon_url,
            owner_id,
            created_at: timestamp,
            updated_at: timestamp,
        };

        let created = self
            .repository
            .create(
                &candidate,
                RoleId::new(),
                &PermissionSet::default_member().to_permissions(),
            )
            .await?;

        tracing::info!(community_id = %created.id, %owner_id, "community created");
        Ok(created)
    }

    /// Fetch a community the caller can see.
    ///
    /// Membership is required: community metadata is not public, so a
    /// non-member gets the same answer as for a community that does not exist.
    pub async fn get(
        &self,
        community_id: CommunityId,
        user_id: UserId,
    ) -> ServiceResult<Community> {
        self.member_context(community_id, user_id).await?;
        self.repository
            .find(community_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("community"))
    }

    /// Update community settings.
    pub async fn update(
        &self,
        community_id: CommunityId,
        user_id: UserId,
        input: UpdateCommunity,
    ) -> ServiceResult<Community> {
        let context = self.member_context(community_id, user_id).await?;
        context.require(Permission::ManageCommunity)?;

        let name = input
            .name
            .as_deref()
            .map(community::validate_community_name)
            .transpose()?;

        Ok(self
            .repository
            .update(
                community_id,
                name.as_deref(),
                input.description.as_deref(),
                input.icon_url.as_deref(),
            )
            .await?)
    }

    /// Delete a community.
    ///
    /// Owner only — `manage_community` lets an admin rename the place, not
    /// destroy it.
    pub async fn delete(&self, community_id: CommunityId, user_id: UserId) -> ServiceResult<()> {
        let context = self.member_context(community_id, user_id).await?;
        if !context.is_owner {
            return Err(ServiceError::denied("owner_only"));
        }

        if !self.repository.delete(community_id).await? {
            return Err(ServiceError::not_found("community"));
        }
        tracing::info!(%community_id, "community deleted");
        Ok(())
    }

    /// Add a member.
    ///
    /// Callers may add *themselves* (accepting an invite) or, with
    /// `manage_members`, somebody else.
    pub async fn add_member(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
        target_id: UserId,
    ) -> ServiceResult<CommunityMember> {
        if actor_id != target_id {
            let context = self.member_context(community_id, actor_id).await?;
            context.require(Permission::ManageMembers)?;
        } else if self.repository.find(community_id).await?.is_none() {
            return Err(ServiceError::not_found("community"));
        }

        if self
            .repository
            .find_member(community_id, target_id)
            .await?
            .is_some()
        {
            return Err(ServiceError::Domain(DomainError::Conflict("membership")));
        }

        Ok(self
            .repository
            .add_member(community_id, target_id, None)
            .await?)
    }

    /// Remove a member.
    ///
    /// A member may always remove themselves; removing someone else needs
    /// `manage_members`, and the owner can never be removed.
    pub async fn remove_member(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
        target_id: UserId,
    ) -> ServiceResult<()> {
        let community = self
            .repository
            .find(community_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("community"))?;

        if community.is_owner(target_id) {
            return Err(ServiceError::denied("cannot_remove_owner"));
        }

        if actor_id != target_id {
            let context = self.member_context(community_id, actor_id).await?;
            context.require(Permission::ManageMembers)?;
        }

        if !self
            .repository
            .remove_member(community_id, target_id)
            .await?
        {
            return Err(ServiceError::not_found("membership"));
        }
        Ok(())
    }

    /// List members.
    pub async fn list_members(
        &self,
        community_id: CommunityId,
        user_id: UserId,
        limit: i64,
    ) -> ServiceResult<Vec<CommunityMember>> {
        self.member_context(community_id, user_id).await?;
        Ok(self
            .repository
            .list_members(community_id, limit.clamp(1, 200))
            .await?)
    }

    /// Create a role.
    pub async fn create_role(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
        input: CreateRole,
    ) -> ServiceResult<RoleWithPermissions> {
        let context = self.member_context(community_id, actor_id).await?;
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
    pub async fn update_role(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
        role_id: RoleId,
        input: UpdateRole,
    ) -> ServiceResult<RoleWithPermissions> {
        let context = self.member_context(community_id, actor_id).await?;
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
    pub async fn assign_role(
        &self,
        community_id: CommunityId,
        actor_id: UserId,
        target_id: UserId,
        role_id: RoleId,
    ) -> ServiceResult<()> {
        let context = self.member_context(community_id, actor_id).await?;
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

    /// List roles with their permissions.
    pub async fn list_roles(
        &self,
        community_id: CommunityId,
        user_id: UserId,
    ) -> ServiceResult<Vec<RoleWithPermissions>> {
        self.member_context(community_id, user_id).await?;

        let roles = self.repository.list_roles(community_id).await?;
        let mut out = Vec::with_capacity(roles.len());
        for role in roles {
            let permissions =
                PermissionSet::from_permissions(self.repository.role_permissions(role.id).await?);
            out.push(RoleWithPermissions { role, permissions });
        }
        Ok(out)
    }
}

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
