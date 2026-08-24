//! Finding rooms you are not in yet.
//!
//! Read-only, and deliberately outside [`RoomService`]: discovery answers "what
//! is going on right now" for somebody who has no standing anywhere, so none of
//! it consults permissions and none of it can change anything. Keeping it apart
//! is what makes that obvious rather than something you have to check.

use genzh_domain::room::{Room, RoomType};
use genzh_domain::{UserId};
use genzh_infrastructure::{ServiceError, ServiceResult};

use crate::repository::RoomRepository;

/// The public face of the room list.
#[derive(Debug, Clone)]
pub struct RoomDirectory {
    rooms: RoomRepository,
}

impl RoomDirectory {
    pub(crate) fn new(rooms: RoomRepository) -> Self {
        Self { rooms }
    }

    pub async fn for_user(&self, user_id: UserId) -> ServiceResult<Vec<Room>> {
        self.rooms
            .list_user_rooms(user_id)
            .await
            .map_err(ServiceError::from)
    }

    /// List rooms for discovery feed.
    pub async fn discover(
        &self,
        category: Option<&str>,
        limit: i64,
    ) -> ServiceResult<Vec<Room>> {
        Ok(self.rooms.list_discovery(category, limit).await?)
    }

    /// List trending rooms.
    pub async fn trending(&self, limit: i64) -> ServiceResult<Vec<Room>> {
        Ok(self.rooms.list_trending(limit).await?)
    }

    /// List live voice/video/stage rooms.
    pub async fn live(&self, limit: i64) -> ServiceResult<Vec<Room>> {
        Ok(self.rooms.list_live(limit).await?)
    }

    /// Find a random room for instant matchmaking.
    pub async fn random(
        &self,
        category: Option<&str>,
        room_type: Option<RoomType>,
    ) -> ServiceResult<Option<Room>> {
        Ok(self.rooms.find_random(category, room_type).await?)
    }

}
