//! The room application service.

use genzh_community::CommunityService;
use genzh_community::authorization::apply_room_overrides;
use genzh_domain::room::{
    self, Room, RoomAnonymousIdentity, RoomParticipant, RoomParticipantRole, RoomStatus, RoomType,
    RoomVisibility,
};
use genzh_domain::{
    CommunityId, DomainError, Permission, PermissionSet, RoomId, UserId, now,
};
use genzh_infrastructure::{DbPool, ServiceError, ServiceResult};

use crate::authorization::RoomAccess;
use crate::repository::RoomRepository;

/// Input for creating a room.
#[derive(Debug, Clone)]
pub struct CreateRoom {
    /// Owning community, if created inside one.
    pub community_id: Option<CommunityId>,
    /// Display name.
    pub name: String,
    /// Topic line.
    pub topic: Option<String>,
    /// Topic category (e.g. "gaming", "debate", "tech", "confession", "random").
    pub category: Option<String>,
    /// What the room is for.
    pub room_type: RoomType,
    /// Visibility level.
    pub visibility: Option<RoomVisibility>,
    /// Whether user identities are anonymous.
    pub is_anonymous: bool,
    /// Duration in minutes (if temporary/expiring).
    pub duration_minutes: Option<i64>,
    /// Sort order (for community channels).
    pub position: Option<i32>,
    /// Participant cap for media rooms.
    pub max_participants: Option<i32>,
    /// Additional participants to join immediately (e.g. for Direct Message rooms).
    pub participant_ids: Option<Vec<UserId>>,
}

/// Input for updating a room.
#[derive(Debug, Clone, Default)]
pub struct UpdateRoom {
    /// New name.
    pub name: Option<String>,
    /// New topic.
    pub topic: Option<String>,
    /// New category.
    pub category: Option<String>,
    /// New visibility.
    pub visibility: Option<RoomVisibility>,
    /// New status.
    pub status: Option<RoomStatus>,
    /// New position.
    pub position: Option<i32>,
    /// New participant cap.
    pub max_participants: Option<i32>,
}

/// Rooms and room authorization.
#[derive(Debug, Clone)]
pub struct RoomService {
    rooms: RoomRepository,
    communities: CommunityService,
}

impl RoomService {
    /// Build the service.
    pub fn new(pool: DbPool, communities: CommunityService) -> Self {
        Self {
            rooms: RoomRepository::new(pool),
            communities,
        }
    }

    /// The room repository, for services layered on top (messaging, media).
    pub fn repository(&self) -> &RoomRepository {
        &self.rooms
    }

    /// Resolve a caller's standing in a room.
    pub async fn access(&self, room_id: RoomId, user_id: UserId) -> ServiceResult<RoomAccess> {
        let room = self
            .rooms
            .find(room_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("room"))?;

        if let Some(community_id) = room.community_id {
            let member = self
                .communities
                .member_context(community_id, user_id)
                .await?;
            let overrides = self.rooms.overrides(room_id).await?;
            let permissions =
                apply_room_overrides(member.permissions, &member.role_ids, &overrides);

            Ok(RoomAccess {
                room,
                member: Some(member),
                permissions,
            })
        } else {
            // Standalone playground room.
            let is_owner = room.owner_id == Some(user_id);
            let permissions = if is_owner {
                PermissionSet::ADMINISTRATOR
            } else {
                PermissionSet::default_member()
            };

            Ok(RoomAccess {
                room,
                member: None,
                permissions,
            })
        }
    }

    /// Resolve access and assert the room is visible.
    pub async fn visible_access(
        &self,
        room_id: RoomId,
        user_id: UserId,
    ) -> ServiceResult<RoomAccess> {
        let access = self.access(room_id, user_id).await?;
        access.require_visible()?;
        Ok(access)
    }

    /// Create a room (either inside a community or as a global playground room).
    pub async fn create(
        &self,
        community_id: Option<CommunityId>,
        user_id: UserId,
        input: CreateRoom,
    ) -> ServiceResult<Room> {
        if let Some(cid) = community_id {
            let context = self.communities.member_context(cid, user_id).await?;
            context.require(Permission::ManageRoom)?;
        }

        let name = room::validate_room_name(&input.name)?;

        if let Some(limit) = input.max_participants
            && (limit <= 0 || limit > room::MEDIA_ROOM_MAX_PARTICIPANTS)
        {
            return Err(ServiceError::Domain(DomainError::invalid(
                "max_participants",
                format!(
                    "must be between 1 and {}",
                    room::MEDIA_ROOM_MAX_PARTICIPANTS
                ),
            )));
        }

        let max_participants = if input.room_type.is_media() {
            input.max_participants
        } else {
            None
        };

        let timestamp = now();
        let expires_at = input.duration_minutes.map(|mins| {
            timestamp + chrono::Duration::minutes(mins)
        });

        let candidate = Room {
            id: RoomId::new(),
            community_id,
            owner_id: Some(user_id),
            name,
            topic: input.topic,
            category: input.category.unwrap_or_else(|| "random".to_string()),
            room_type: input.room_type,
            visibility: input.visibility.unwrap_or(RoomVisibility::Public),
            status: RoomStatus::Active,
            is_anonymous: input.is_anonymous,
            position: input.position.unwrap_or(0),
            max_participants,
            current_participants: 1, // Creator starts as 1 participant
            started_at: Some(timestamp),
            expires_at,
            ended_at: None,
            created_at: timestamp,
            updated_at: timestamp,
        };

        let created = self.rooms.create(&candidate).await?;

        // Add creator as owner participant
        let _ = self
            .rooms
            .join_room(created.id, user_id, RoomParticipantRole::Owner)
            .await;

        // If anonymous, initialize anonymous identity
        if created.is_anonymous {
            let _ = self
                .rooms
                .get_or_create_anonymous_identity(created.id, user_id)
                .await;
        }

        // Join any additional participants (e.g. for Direct Messages)
        if let Some(participants) = input.participant_ids {
            for pid in participants {
                if pid != user_id {
                    let _ = self
                        .rooms
                        .join_room(created.id, pid, RoomParticipantRole::Participant)
                        .await;
                    if created.is_anonymous {
                        let _ = self
                            .rooms
                            .get_or_create_anonymous_identity(created.id, pid)
                            .await;
                    }
                }
            }
        }

        tracing::info!(
            room_id = %created.id,
            community_id = ?created.community_id,
            room_type = created.room_type.as_str(),
            is_anonymous = created.is_anonymous,
            "room created"
        );
        Ok(created)
    }

    /// List standalone or direct conversation rooms the user participates in.
    pub async fn list_user_rooms(&self, user_id: UserId) -> ServiceResult<Vec<Room>> {
        self.rooms
            .list_user_rooms(user_id)
            .await
            .map_err(ServiceError::from)
    }

    /// Find or create a 1-on-1 direct message room between two users.
    pub async fn get_or_create_dm(
        &self,
        user_a: UserId,
        user_b: UserId,
        target_name: &str,
        target_handle: &str,
    ) -> ServiceResult<Room> {
        if let Some(existing) = self.rooms.find_direct_room(user_a, user_b).await? {
            return Ok(existing);
        }

        let name = if target_handle.is_empty() {
            format!("DM: @{}", target_name)
        } else {
            format!("DM: @{}", target_handle)
        };

        self.create(
            None,
            user_a,
            CreateRoom {
                community_id: None,
                name,
                topic: Some(format!("Direct message with {}", target_name)),
                category: Some("dm".to_string()),
                room_type: RoomType::Text,
                visibility: Some(RoomVisibility::Private),
                is_anonymous: false,
                duration_minutes: None,
                position: None,
                max_participants: None,
                participant_ids: Some(vec![user_b]),
            },
        )
        .await
    }

    /// Fetch a room the caller can see.
    pub async fn get(&self, room_id: RoomId, user_id: UserId) -> ServiceResult<Room> {
        Ok(self.visible_access(room_id, user_id).await?.room)
    }

    /// List a community's rooms.
    pub async fn list(
        &self,
        community_id: CommunityId,
        user_id: UserId,
    ) -> ServiceResult<Vec<Room>> {
        let member = self
            .communities
            .member_context(community_id, user_id)
            .await?;
        let rooms = self.rooms.list_for_community(community_id).await?;

        let mut visible = Vec::with_capacity(rooms.len());
        for room in rooms {
            let overrides = self.rooms.overrides(room.id).await?;
            let permissions =
                apply_room_overrides(member.permissions, &member.role_ids, &overrides);
            if permissions.allows(Permission::ViewRoom) {
                visible.push(room);
            }
        }
        Ok(visible)
    }

    /// List rooms for discovery feed.
    pub async fn list_discovery(
        &self,
        category: Option<&str>,
        limit: i64,
    ) -> ServiceResult<Vec<Room>> {
        Ok(self.rooms.list_discovery(category, limit).await?)
    }

    /// List trending rooms.
    pub async fn list_trending(&self, limit: i64) -> ServiceResult<Vec<Room>> {
        Ok(self.rooms.list_trending(limit).await?)
    }

    /// List live voice/video/stage rooms.
    pub async fn list_live(&self, limit: i64) -> ServiceResult<Vec<Room>> {
        Ok(self.rooms.list_live(limit).await?)
    }

    /// Find a random room for instant matchmaking.
    pub async fn find_random(
        &self,
        category: Option<&str>,
        room_type: Option<RoomType>,
    ) -> ServiceResult<Option<Room>> {
        Ok(self.rooms.find_random(category, room_type).await?)
    }

    /// Join a room (assigns anonymous identity if anonymous).
    pub async fn join(
        &self,
        room_id: RoomId,
        user_id: UserId,
    ) -> ServiceResult<(Room, Option<RoomAnonymousIdentity>)> {
        let access = self.visible_access(room_id, user_id).await?;
        let role = if access.room.owner_id == Some(user_id) {
            RoomParticipantRole::Owner
        } else {
            RoomParticipantRole::Participant
        };

        self.rooms.join_room(room_id, user_id, role).await?;

        let anon_identity = if access.room.is_anonymous {
            Some(
                self.rooms
                    .get_or_create_anonymous_identity(room_id, user_id)
                    .await?,
            )
        } else {
            None
        };

        let updated_room = self
            .rooms
            .find(room_id)
            .await?
            .unwrap_or(access.room);

        Ok((updated_room, anon_identity))
    }

    /// Leave a room.
    pub async fn leave(&self, room_id: RoomId, user_id: UserId) -> ServiceResult<bool> {
        Ok(self.rooms.leave_room(room_id, user_id).await?)
    }

    /// Get anonymous identity for a user in a room.
    pub async fn get_anonymous_identity(
        &self,
        room_id: RoomId,
        user_id: UserId,
    ) -> ServiceResult<Option<RoomAnonymousIdentity>> {
        Ok(self.rooms.find_anonymous_identity(room_id, user_id).await?)
    }

    /// List active participants in a room.
    pub async fn list_participants(
        &self,
        room_id: RoomId,
    ) -> ServiceResult<Vec<RoomParticipant>> {
        Ok(self.rooms.list_participants(room_id).await?)
    }

    /// Update a room.
    pub async fn update(
        &self,
        room_id: RoomId,
        user_id: UserId,
        input: UpdateRoom,
    ) -> ServiceResult<Room> {
        let access = self.access(room_id, user_id).await?;
        access.require(Permission::ManageRoom)?;

        let name = input
            .name
            .as_deref()
            .map(room::validate_room_name)
            .transpose()?;

        Ok(self
            .rooms
            .update(
                room_id,
                name.as_deref(),
                input.topic.as_deref(),
                input.category.as_deref(),
                input.visibility,
                input.status,
                input.position,
                input.max_participants,
            )
            .await?)
    }

    /// Delete a room.
    pub async fn delete(&self, room_id: RoomId, user_id: UserId) -> ServiceResult<()> {
        let access = self.access(room_id, user_id).await?;
        access.require(Permission::ManageRoom)?;

        if !self.rooms.delete(room_id).await? {
            return Err(ServiceError::not_found("room"));
        }
        tracing::info!(%room_id, "room deleted");
        Ok(())
    }
}
