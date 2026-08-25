//! Communities, members and roles.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use genzh_domain::community::{
    self, Community, CommunityMember, MemberWithRoles, Role, RoleWithPermissions,
};
use genzh_domain::{CommunityId, Permission, RoleId, RoomType, UserId};
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult};
use crate::extract::ApiJson;
use crate::middleware::CurrentUser;
use crate::state::AppState;

/// `POST /api/v1/communities` body.
#[derive(Debug, Deserialize)]
pub struct CreateCommunityRequest {
    /// Display name.
    pub name: String,
    /// Optional description.
    #[serde(default)]
    pub description: Option<String>,
    /// Optional icon.
    #[serde(default)]
    pub icon_url: Option<String>,
    /// Which starting shape to build, from `GET /communities/templates`.
    ///
    /// Absent means the default template, which is what every client that
    /// predates templates sends — so they keep working unchanged.
    #[serde(default)]
    pub template: Option<String>,
}

/// One entry in `GET /api/v1/communities/templates`.
///
/// A projection rather than the domain type: the wire should carry permission
/// *names*, not the bitmask the domain folds them into.
#[derive(Debug, Serialize)]
pub struct CommunityTemplateResponse {
    pub key: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    /// Prefilled into the create form; empty for the blank template.
    pub suggested_name: String,
    pub suggested_description: String,
    pub rooms: Vec<TemplateRoomResponse>,
    /// The roles this template adds on top of the ones every community gets.
    pub extra_roles: Vec<TemplateRoleResponse>,
}

/// A channel a template creates.
#[derive(Debug, Serialize)]
pub struct TemplateRoomResponse {
    pub name: String,
    pub topic: Option<String>,
    pub room_type: RoomType,
    pub position: i32,
}

/// A role a template adds.
#[derive(Debug, Serialize)]
pub struct TemplateRoleResponse {
    pub name: String,
    pub color: Option<String>,
    pub permissions: Vec<Permission>,
}

/// `PATCH /api/v1/communities/{id}` body.
#[derive(Debug, Deserialize)]
pub struct UpdateCommunityRequest {
    /// New name.
    #[serde(default)]
    pub name: Option<String>,
    /// New description.
    #[serde(default)]
    pub description: Option<String>,
    /// New icon.
    #[serde(default)]
    pub icon_url: Option<String>,
}

/// `POST /api/v1/communities/{id}/members` body.
#[derive(Debug, Deserialize)]
pub struct AddMemberRequest {
    /// Who to add. Absent means "me", i.e. accepting an invite.
    #[serde(default)]
    pub user_id: Option<UserId>,
}

/// A role as clients see it.
///
/// The permission mask is expanded into the same lower-case keys the create and
/// update bodies accept. Serialising `PermissionSet` directly puts a bitflags
/// debug string on the wire — `"VIEW_ROOM | SEND_MESSAGE"` — which no client can
/// round-trip back into a request, and which every other endpoint contradicts
/// by sending `your_permissions` as keys.
#[derive(Debug, Serialize)]
pub struct RoleView {
    /// The role itself.
    #[serde(flatten)]
    pub role: Role,
    /// What it grants, as permission keys.
    pub permissions: Vec<Permission>,
}

impl From<RoleWithPermissions> for RoleView {
    fn from(value: RoleWithPermissions) -> Self {
        Self {
            permissions: value.permissions.to_permissions(),
            role: value.role,
        }
    }
}

/// A member, with the roles they hold.
#[derive(Debug, Serialize)]
pub struct MemberView {
    /// The membership.
    #[serde(flatten)]
    pub member: CommunityMember,
    /// Roles explicitly assigned to them, `@everyone` excluded.
    pub roles: Vec<Role>,
}

impl From<MemberWithRoles> for MemberView {
    fn from(value: MemberWithRoles) -> Self {
        Self {
            member: value.member,
            roles: value.roles,
        }
    }
}

/// `POST /api/v1/communities/{id}/roles` body.
#[derive(Debug, Deserialize)]
pub struct CreateRoleRequest {
    /// Display name.
    pub name: String,
    /// Badge colour.
    #[serde(default)]
    pub color: Option<String>,
    /// Sort/authority position.
    #[serde(default)]
    pub position: Option<i32>,
    /// Permission keys to grant.
    #[serde(default)]
    pub permissions: Vec<String>,
}

/// `PATCH /api/v1/communities/{id}/roles/{role_id}` body.
#[derive(Debug, Deserialize)]
pub struct UpdateRoleRequest {
    /// New name.
    #[serde(default)]
    pub name: Option<String>,
    /// New colour.
    #[serde(default)]
    pub color: Option<String>,
    /// New position.
    #[serde(default)]
    pub position: Option<i32>,
    /// Complete replacement permission set.
    #[serde(default)]
    pub permissions: Option<Vec<String>>,
}

/// `POST /api/v1/communities/{id}/members/{user_id}/roles` body.
#[derive(Debug, Deserialize)]
pub struct AssignRoleRequest {
    /// Role to assign.
    pub role_id: RoleId,
}

/// Paging for member lists.
#[derive(Debug, Deserialize)]
pub struct MemberListQuery {
    /// Page size.
    #[serde(default)]
    pub limit: Option<i64>,
}

/// A community with the caller's own permissions resolved.
#[derive(Debug, Serialize)]
pub struct CommunityResponse {
    /// The community.
    #[serde(flatten)]
    pub community: Community,
    /// What the caller may do here. Clients use this to hide controls the
    /// server would refuse anyway.
    pub your_permissions: Vec<Permission>,
}

/// `POST /api/v1/communities`
pub async fn create(
    State(state): State<AppState>,
    caller: CurrentUser,
    ApiJson(body): ApiJson<CreateCommunityRequest>,
) -> ApiResult<(StatusCode, Json<CommunityResponse>)> {
    // The template's channels and roles are written by the same transaction
    // that writes the community, so there is no follow-up call here to fail
    // separately and leave a server with nothing in it.
    let community = state
        .communities
        .create(
            caller.user_id,
            genzh_community::CreateCommunity {
                name: body.name,
                description: body.description,
                icon_url: body.icon_url,
                template: body.template,
            },
        )
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityCreated,
            format!("Community '{}' created", community.name),
        )
        .about("community", community.id.as_uuid()),
    ).await;

    Ok((
        StatusCode::CREATED,
        Json(CommunityResponse {
            community,
            // The creator is the owner, so this is every permission by
            // definition — no second query needed.
            your_permissions: Permission::ALL.to_vec(),
        }),
    ))
}

/// `GET /api/v1/communities`
///
/// The communities the caller belongs to. This is the first call a client makes
/// after signing in, so it returns the whole list rather than paginating: a
/// user belongs to tens of communities, not thousands.
pub async fn list(
    State(state): State<AppState>,
    caller: CurrentUser,
) -> ApiResult<Json<Vec<Community>>> {
    Ok(Json(state.communities.list_for_user(caller.user_id).await?))
}

/// `GET /api/v1/communities/{id}`
pub async fn get(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
) -> ApiResult<Json<CommunityResponse>> {
    let context = state
        .communities
        .member_context(community_id, caller.user_id)
        .await?;
    let community = state.communities.get(community_id, caller.user_id).await?;

    Ok(Json(CommunityResponse {
        community,
        your_permissions: context.permissions.to_permissions(),
    }))
}

/// `PATCH /api/v1/communities/{id}`
pub async fn update(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
    ApiJson(body): ApiJson<UpdateCommunityRequest>,
) -> ApiResult<Json<Community>> {
    let community = state
        .communities
        .update(
            community_id,
            caller.user_id,
            genzh_community::UpdateCommunity {
                name: body.name,
                description: body.description,
                icon_url: body.icon_url,
            },
        )
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityUpdated,
            format!("Community '{}' updated", community.name),
        )
        .about("community", community.id.as_uuid()),
    ).await;

    Ok(Json(community))
}

/// `DELETE /api/v1/communities/{id}`
pub async fn delete(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
) -> ApiResult<StatusCode> {
    state
        .communities
        .delete(community_id, caller.user_id)
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityRemoved,
            format!("Community {} deleted", community_id),
        )
        .about("community", community_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/v1/communities/{id}/members`
pub async fn list_members(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
    Query(query): Query<MemberListQuery>,
) -> ApiResult<Json<Vec<MemberView>>> {
    let members = state
        .communities
        .list_members_with_roles(community_id, caller.user_id, query.limit.unwrap_or(100))
        .await?;
    Ok(Json(members.into_iter().map(MemberView::from).collect()))
}

/// `POST /api/v1/communities/{id}/members`
pub async fn add_member(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
    ApiJson(body): ApiJson<AddMemberRequest>,
) -> ApiResult<(StatusCode, Json<CommunityMember>)> {
    // Defaulting to the caller is what makes "join with an invite" and "add
    // somebody" the same endpoint without letting the former imply the latter:
    // adding anyone else still requires `manage_members`.
    let target = body.user_id.unwrap_or(caller.user_id);
    let member = state
        .communities
        .add_member(community_id, caller.user_id, target)
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityMemberJoined,
            format!("User {} joined community {}", target, community_id),
        )
        .about("community", community_id.as_uuid()),
    ).await;

    Ok((StatusCode::CREATED, Json(member)))
}

/// `DELETE /api/v1/communities/{id}/members/{user_id}`
pub async fn remove_member(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path((community_id, user_id)): Path<(CommunityId, UserId)>,
) -> ApiResult<StatusCode> {
    state
        .communities
        .remove_member(community_id, caller.user_id, user_id)
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityMemberRemoved,
            format!("User {} removed from community {}", user_id, community_id),
        )
        .about("community", community_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/v1/communities/{id}/members/{user_id}/roles/{role_id}`
pub async fn remove_role(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path((community_id, user_id, role_id)): Path<(CommunityId, UserId, RoleId)>,
) -> ApiResult<StatusCode> {
    state
        .roles
        .remove(community_id, caller.user_id, user_id, role_id)
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityRoleRevoked,
            format!("Role {} revoked from user {} in community {}", role_id, user_id, community_id),
        )
        .about("community", community_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/v1/communities/{id}/roles`
pub async fn list_roles(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
) -> ApiResult<Json<Vec<RoleView>>> {
    let roles = state
        .roles
        .list(community_id, caller.user_id)
        .await?;
    Ok(Json(roles.into_iter().map(RoleView::from).collect()))
}

/// `POST /api/v1/communities/{id}/roles`
pub async fn create_role(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
    ApiJson(body): ApiJson<CreateRoleRequest>,
) -> ApiResult<(StatusCode, Json<RoleView>)> {
    let role = state
        .roles
        .create(
            community_id,
            caller.user_id,
            genzh_community::CreateRole {
                name: body.name,
                color: body.color,
                position: body.position,
                permissions: parse_permissions(&body.permissions)?,
            },
        )
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityRoleCreated,
            format!("Role '{}' created in community {}", role.role.name, community_id),
        )
        .about("role", role.role.id.as_uuid()),
    ).await;

    Ok((StatusCode::CREATED, Json(RoleView::from(role))))
}

/// `PATCH /api/v1/communities/{id}/roles/{role_id}`
pub async fn update_role(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path((community_id, role_id)): Path<(CommunityId, RoleId)>,
    ApiJson(body): ApiJson<UpdateRoleRequest>,
) -> ApiResult<Json<RoleView>> {
    let permissions = body
        .permissions
        .as_deref()
        .map(parse_permissions)
        .transpose()?;

    let role = state
        .roles
        .update(
            community_id,
            caller.user_id,
            role_id,
            genzh_community::UpdateRole {
                name: body.name,
                color: body.color,
                position: body.position,
                permissions,
            },
        )
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityRoleUpdated,
            format!("Role '{}' updated in community {}", role.role.name, community_id),
        )
        .about("role", role.role.id.as_uuid()),
    ).await;

    Ok(Json(RoleView::from(role)))
}

/// `POST /api/v1/communities/{id}/members/{user_id}/roles`
pub async fn assign_role(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path((community_id, user_id)): Path<(CommunityId, UserId)>,
    ApiJson(body): ApiJson<AssignRoleRequest>,
) -> ApiResult<StatusCode> {
    state
        .roles
        .assign(community_id, caller.user_id, user_id, body.role_id)
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityRoleAssigned,
            format!("Role {} assigned to user {} in community {}", body.role_id, user_id, community_id),
        )
        .about("community", community_id.as_uuid()),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}

/// Turn permission keys from the wire into domain values.
///
/// An unknown key is a 400 rather than something silently dropped: a client
/// asking for a permission this build does not have should be told, not left
/// believing it was granted.
fn parse_permissions(keys: &[String]) -> Result<Vec<Permission>, ApiError> {
    keys.iter()
        .map(|key| key.parse::<Permission>().map_err(ApiError::Domain))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_permission_keys_parse() {
        let parsed = parse_permissions(&["speak".into(), "manage_room".into()]).expect("parse");
        assert_eq!(parsed, vec![Permission::Speak, Permission::ManageRoom]);
    }

    #[test]
    fn an_unknown_permission_key_is_a_client_error_not_a_silent_drop() {
        let error = parse_permissions(&["speak".into(), "become_root".into()]).unwrap_err();
        assert!(matches!(
            error,
            ApiError::Domain(genzh_domain::DomainError::UnknownPermission(key)) if key == "become_root"
        ));
    }

    #[test]
    fn an_empty_permission_list_is_valid() {
        assert!(parse_permissions(&[]).expect("parse").is_empty());
    }
}

/// `GET /api/v1/communities/templates`
///
/// The shapes a community can be created from. Served rather than shipped in
/// each client: the server is what builds them, so a client that held its own
/// copy could offer a template that no longer exists, or describe one as having
/// channels it does not create.
///
/// No authentication beyond a session: this is a static catalogue, and the
/// create screen needs it before any community exists.
pub async fn templates() -> Json<Vec<CommunityTemplateResponse>> {
    Json(
        community::community_templates()
            .into_iter()
            .map(|template| CommunityTemplateResponse {
                key: template.key.to_string(),
                name: template.name.to_string(),
                icon: template.icon.to_string(),
                description: template.description.to_string(),
                suggested_name: template.suggested_name.to_string(),
                suggested_description: template.suggested_description.to_string(),
                rooms: template
                    .rooms
                    .iter()
                    .map(|room| TemplateRoomResponse {
                        name: room.name.to_string(),
                        topic: room.topic.map(str::to_string),
                        room_type: room.room_type,
                        position: room.position,
                    })
                    .collect(),
                extra_roles: template
                    .extra_roles
                    .iter()
                    .map(|role| TemplateRoleResponse {
                        name: role.name.to_string(),
                        color: role.color.map(str::to_string),
                        permissions: role.permissions.to_permissions(),
                    })
                    .collect(),
            })
            .collect(),
    )
}

// ──────────────────────────── invite links ────────────────────────────

/// `POST /api/v1/communities/{id}/invites` body.
#[derive(Debug, Deserialize)]
pub struct CreateInviteRequest {
    /// Hours until it stops working. Absent means it never expires.
    #[serde(default)]
    pub expires_in_hours: Option<i64>,
    /// How many times it may be redeemed. Absent means unlimited.
    #[serde(default)]
    pub max_uses: Option<i32>,
}

/// `POST /api/v1/communities/{id}/invites`
pub async fn create_invite(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
    ApiJson(body): ApiJson<CreateInviteRequest>,
) -> ApiResult<(StatusCode, Json<genzh_community::Invite>)> {
    let invite = state
        .invites
        .create(
            community_id,
            caller.user_id,
            body.expires_in_hours,
            body.max_uses,
        )
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityInviteCreated,
            format!("Invite created for community {}", community_id),
        )
        .about("community", community_id.as_uuid()),
    ).await;

    Ok((StatusCode::CREATED, Json(invite)))
}

/// `GET /api/v1/communities/{id}/invites`
pub async fn list_invites(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
) -> ApiResult<Json<Vec<genzh_community::Invite>>> {
    Ok(Json(state.invites.list(community_id, caller.user_id).await?))
}

/// `GET /api/v1/invites/{code}`
///
/// What a link leads to, without joining it. Answers for anybody signed in,
/// because that is what a link is for: you are handed one by somebody already
/// inside, and you have to see what it is before deciding.
pub async fn preview_invite(
    State(state): State<AppState>,
    _caller: CurrentUser,
    Path(code): Path<String>,
) -> ApiResult<Json<genzh_community::InvitePreview>> {
    Ok(Json(state.invites.preview(&code).await?))
}

/// `POST /api/v1/invites/{code}`
///
/// Redeem: join the community the link points at. Returns the community so the
/// client can navigate straight there.
pub async fn redeem_invite(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(code): Path<String>,
) -> ApiResult<Json<CommunityResponse>> {
    let community_id = state.invites.redeem(&code, caller.user_id).await?;
    let community = state.communities.get(community_id, caller.user_id).await?;
    let context = state
        .communities
        .member_context(community_id, caller.user_id)
        .await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityInviteRedeemed,
            format!("Invite redeemed for community {}", community_id),
        )
        .about("community", community_id.as_uuid()),
    ).await;

    Ok(Json(CommunityResponse {
        community,
        your_permissions: context.permissions.to_permissions(),
    }))
}

/// `DELETE /api/v1/invites/{code}`
pub async fn revoke_invite(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(code): Path<String>,
) -> ApiResult<StatusCode> {
    state.invites.revoke(&code, caller.user_id).await?;

    state.audit.record_best_effort(
        genzh_admin::AuditRecord::new(
            Some(caller.user_id),
            genzh_domain::audit::AuditAction::CommunityInviteRevoked,
            format!("Invite '{}' revoked", code),
        ),
    ).await;

    Ok(StatusCode::NO_CONTENT)
}
