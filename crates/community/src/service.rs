//! The community application service.
//!
//! Communities and their membership. Roles used to live here too and now have
//! [`crate::roles`] to themselves: they are governed by a different rule — that
//! nobody may grant a permission they do not hold — and it applies to every
//! role operation and to none of the ones left in this file.

use genzh_domain::community::{self, Community, CommunityMember, MemberWithRoles};
use genzh_domain::{CommunityId, DomainError, Permission, RoleId, RoomId, UserId, now};
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
    /// Which starting shape to build. `None` means the default template.
    pub template: Option<String>,
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

    /// The roles service over this community's storage.
    ///
    /// Built here rather than in the composition root because the two share a
    /// repository, and that fact should not be something every caller has to
    /// know how to reassemble.
    pub fn roles(&self) -> crate::roles::RoleService {
        crate::roles::RoleService::new(self.clone(), self.repository.clone())
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

        // An unrecognised key is a client sending something this server does
        // not build. Falling back to the default would hand back a server that
        // is not the one they picked, silently, so it is refused instead.
        let key = input
            .template
            .as_deref()
            .unwrap_or(community::DEFAULT_TEMPLATE_KEY);
        let template = community::community_template(key).ok_or_else(|| {
            ServiceError::Domain(DomainError::invalid(
                "template",
                format!("`{key}` is not a community template"),
            ))
        })?;

        // Ids are minted here rather than in the repository so the whole set is
        // one value the transaction either writes or does not.
        let roles: Vec<(RoleId, community::RoleTemplate)> =
            community::roles_for_template(&template)
                .into_iter()
                .map(|role| (RoleId::new(), role))
                .collect();

        let rooms: Vec<(RoomId, community::RoomTemplate)> = template
            .rooms
            .iter()
            .copied()
            .map(|room| (RoomId::new(), room))
            .collect();

        let created = self.repository.create(&candidate, &roles, &rooms).await?;

        tracing::info!(
            community_id = %created.id,
            %owner_id,
            template = key,
            rooms = rooms.len(),
            "community created"
        );
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

    /// The communities the caller belongs to.
    ///
    /// No permission check: membership *is* the authorization, and a user can
    /// always see the list of places they are a member of.
    pub async fn list_for_user(&self, user_id: UserId) -> ServiceResult<Vec<Community>> {
        Ok(self.repository.list_for_user(user_id).await?)
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

    /// List members, each with the roles they hold.
    ///
    /// Separate from [`Self::list_members`] rather than replacing it: the
    /// authorization path asks "is this person a member" far more often than
    /// any screen asks "what does everyone here have", and that question should
    /// not pay for a second query.
    pub async fn list_members_with_roles(
        &self,
        community_id: CommunityId,
        user_id: UserId,
        limit: i64,
    ) -> ServiceResult<Vec<MemberWithRoles>> {
        let members = self.list_members(community_id, user_id, limit).await?;
        let mut by_member = self.repository.roles_by_member(community_id).await?;

        Ok(members
            .into_iter()
            .map(|member| MemberWithRoles {
                roles: by_member.remove(&member.user_id).unwrap_or_default(),
                member,
            })
            .collect())
    }
}
