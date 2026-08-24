//! Two-person conversations.
//!
//! A direct room is an ordinary room with `category = "dm"` and exactly two
//! participants, but almost everything *about* it is different: it is found by
//! who is in it rather than by name, it is titled by the other person, a block
//! makes it disappear, and it is the one room type a call can happen in without
//! being a voice room. Those rules are here, away from the room lifecycle that
//! has nothing to say about any of them.

use std::collections::HashMap;

use genzh_domain::room::{self, Room, RoomType, RoomVisibility};
use genzh_domain::{RoomId, UserId};
use genzh_infrastructure::ServiceResult;

use crate::repository::RoomRepository;
use crate::service::{CreateRoom, RoomService};

/// Finding, opening and resolving direct conversations.
#[derive(Debug, Clone)]
pub struct DirectRooms {
    rooms: RoomRepository,
    service: RoomService,
}

impl DirectRooms {
    pub(crate) fn new(rooms: RoomRepository, service: RoomService) -> Self {
        Self { rooms, service }
    }

    /// Pair each of the caller's direct rooms with the person it is with.
    ///
    /// Callers render a DM as that person — their avatar and display name — so
    /// the peer has to travel with the room rather than being inferred from a
    /// name that was fixed when the conversation was opened.
    pub async fn peers(
        &self,
        user_id: UserId,
        rooms: &[Room],
    ) -> ServiceResult<HashMap<RoomId, UserId>> {
        let direct: Vec<RoomId> = rooms
            .iter()
            .filter(|room| room.is_direct())
            .map(|room| room.id)
            .collect();

        Ok(self
            .rooms
            .direct_peers(user_id, &direct)
            .await?
            .into_iter()
            .collect())
    }

    /// Find or create a 1-on-1 direct message room between two users.
    ///
    /// The boolean says whether this call created the room. Callers use it to
    /// announce a genuinely new conversation to both participants without
    /// re-announcing every time somebody reopens an old one.
    pub async fn open(
        &self,
        user_a: UserId,
        user_b: UserId,
        target_name: &str,
        target_handle: &str,
    ) -> ServiceResult<(Room, bool)> {
        // Refused before the room exists, so a block cannot be worked around by
        // opening the conversation from the blocked side.
        self.service.social().ensure_can_reach(user_a, user_b).await?;

        if let Some(existing) = self.rooms.find_direct_room(user_a, user_b).await? {
            return Ok((existing, false));
        }

        let name = if target_handle.is_empty() {
            format!("DM: @{}", target_name)
        } else {
            format!("DM: @{}", target_handle)
        };

        self.service
            .create(
            None,
            user_a,
            CreateRoom {
                community_id: None,
                name,
                topic: Some(format!("Direct message with {}", target_name)),
                category: Some(room::DIRECT_CATEGORY.to_string()),
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
        .map(|room| (room, true))
    }

    /// Who a direct conversation is with, from one side of it.
    pub async fn peer(
        &self,
        room_id: RoomId,
        user_id: UserId,
    ) -> ServiceResult<Option<UserId>> {
        Ok(self.rooms.direct_peer(room_id, user_id).await?)
    }

}
