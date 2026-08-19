//! The room application service.

use genzh_community::CommunityService;
use genzh_community::authorization::apply_room_overrides;
use genzh_domain::room::{self, Room, RoomType};
use genzh_domain::{CommunityId, DomainError, Permission, RoomId, UserId, now};
use genzh_infrastructure::{DbPool, ServiceError, ServiceResult};

use crate::authorization::RoomAccess;
use crate::repository::RoomRepository;

/// Input for creating a room.
#[derive(Debug, Clone)]
pub struct CreateRoom {
    /// Display name.
    pub name: String,
    /// Topic line.
    pub topic: Option<String>,
    /// What the room is for.
    pub room_type: RoomType,
    /// Sort order.
    pub position: Option<i32>,
    /// Participant cap for media rooms.
    pub max_participants: Option<i32>,
}

/// Input for updating a room.
#[derive(Debug, Clone, Default)]
pub struct UpdateRoom {
    /// New name.
    pub name: Option<String>,
    /// New topic.
    pub topic: Option<String>,
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
    ///
    /// The order matters and is the whole authorization story for rooms:
    ///
    /// 1. the room must exist;
    /// 2. the caller must be a member of its community (or its owner);
    /// 3. their community permissions are folded from their roles;
    /// 4. the room's overrides are applied on top.
    ///
    /// Callers then assert whatever specific capability they need. Nothing in
    /// this chain trusts a value supplied by the client except the room id,
    /// which is looked up rather than believed.
    pub async fn access(&self, room_id: RoomId, user_id: UserId) -> ServiceResult<RoomAccess> {
        let room = self
            .rooms
            .find(room_id)
            .await?
            .ok_or_else(|| ServiceError::not_found("room"))?;

        let member = self
            .communities
            .member_context(room.community_id, user_id)
            .await?;
        let overrides = self.rooms.overrides(room_id).await?;
        let permissions = apply_room_overrides(member.permissions, &member.role_ids, &overrides);

        Ok(RoomAccess {
            room,
            member,
            permissions,
        })
    }

    /// Resolve access and assert the room is visible.
    ///
    /// The common case; separated so handlers do not each repeat it.
    pub async fn visible_access(
        &self,
        room_id: RoomId,
        user_id: UserId,
    ) -> ServiceResult<RoomAccess> {
        let access = self.access(room_id, user_id).await?;
        access.require_visible()?;
        Ok(access)
    }

    /// Create a room in a community.
    pub async fn create(
        &self,
        community_id: CommunityId,
        user_id: UserId,
        input: CreateRoom,
    ) -> ServiceResult<Room> {
        let context = self
            .communities
            .member_context(community_id, user_id)
            .await?;
        context.require(Permission::ManageRoom)?;

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

        // A cap on a text room is meaningless and would confuse clients.
        let max_participants = if input.room_type.is_media() {
            input.max_participants
        } else {
            None
        };

        let timestamp = now();
        let candidate = Room {
            id: RoomId::new(),
            community_id,
            name,
            topic: input.topic,
            room_type: input.room_type,
            position: input.position.unwrap_or(0),
            max_participants,
            created_at: timestamp,
            updated_at: timestamp,
        };

        let created = self.rooms.create(&candidate).await?;
        tracing::info!(
            room_id = %created.id,
            %community_id,
            room_type = created.room_type.as_str(),
            "room created"
        );
        Ok(created)
    }

    /// Fetch a room the caller can see.
    pub async fn get(&self, room_id: RoomId, user_id: UserId) -> ServiceResult<Room> {
        Ok(self.visible_access(room_id, user_id).await?.room)
    }

    /// List a community's rooms, filtered to those the caller may see.
    ///
    /// Filtering here rather than in SQL keeps one implementation of the
    /// override rules; the room count per community is small enough that the
    /// extra work is irrelevant.
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
