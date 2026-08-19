//! Communities, members and roles.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use genzh_domain::community::{Community, CommunityMember, RoleWithPermissions};
use genzh_domain::{CommunityId, Permission, RoleId, UserId};
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
    let community = state
        .communities
        .create(
            caller.user_id,
            genzh_community::CreateCommunity {
                name: body.name,
                description: body.description,
                icon_url: body.icon_url,
            },
        )
        .await?;

    let _ = state
        .rooms
        .create(
            Some(community.id),
            caller.user_id,
            genzh_room::CreateRoom {
                community_id: Some(community.id),
                name: "general".to_string(),
                topic: Some("Welcome to your new server!".to_string()),
                category: None,
                room_type: genzh_domain::RoomType::Text,
                visibility: None,
                is_anonymous: false,
                duration_minutes: None,
                position: Some(0),
                max_participants: None,
                participant_ids: None,
            },
        )
        .await;

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
    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/v1/communities/{id}/members`
pub async fn list_members(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
    Query(query): Query<MemberListQuery>,
) -> ApiResult<Json<Vec<CommunityMember>>> {
    let members = state
        .communities
        .list_members(community_id, caller.user_id, query.limit.unwrap_or(100))
        .await?;
    Ok(Json(members))
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
    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/v1/communities/{id}/roles`
pub async fn list_roles(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
) -> ApiResult<Json<Vec<RoleWithPermissions>>> {
    Ok(Json(
        state
            .communities
            .list_roles(community_id, caller.user_id)
            .await?,
    ))
}

/// `POST /api/v1/communities/{id}/roles`
pub async fn create_role(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path(community_id): Path<CommunityId>,
    ApiJson(body): ApiJson<CreateRoleRequest>,
) -> ApiResult<(StatusCode, Json<RoleWithPermissions>)> {
    let role = state
        .communities
        .create_role(
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
    Ok((StatusCode::CREATED, Json(role)))
}

/// `PATCH /api/v1/communities/{id}/roles/{role_id}`
pub async fn update_role(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path((community_id, role_id)): Path<(CommunityId, RoleId)>,
    ApiJson(body): ApiJson<UpdateRoleRequest>,
) -> ApiResult<Json<RoleWithPermissions>> {
    let permissions = body
        .permissions
        .as_deref()
        .map(parse_permissions)
        .transpose()?;

    let role = state
        .communities
        .update_role(
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
    Ok(Json(role))
}

/// `POST /api/v1/communities/{id}/members/{user_id}/roles`
pub async fn assign_role(
    State(state): State<AppState>,
    caller: CurrentUser,
    Path((community_id, user_id)): Path<(CommunityId, UserId)>,
    ApiJson(body): ApiJson<AssignRoleRequest>,
) -> ApiResult<StatusCode> {
    state
        .communities
        .assign_role(community_id, caller.user_id, user_id, body.role_id)
        .await?;
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
