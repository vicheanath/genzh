//! Rooms.
//!
//! There is exactly **one** room concept. A voice room is not a different
//! server or a different table — it is a room whose [`RoomType`] happens to
//! carry media. That is what lets the same permission model, the same
//! membership checks and the same message history apply everywhere, and what
//! lets a room gain video later without a migration.

use serde::{Deserialize, Serialize};

use crate::error::{DomainError, DomainResult};
use crate::ids::{CommunityId, RoomId};
use crate::permission::Permission;
use crate::Timestamp;

/// Maximum length of a room name.
pub const ROOM_NAME_MAX_LEN: usize = 64;
/// Hard ceiling on participants in one media room, enforced by the API before
/// a media token is minted.
pub const MEDIA_ROOM_MAX_PARTICIPANTS: i32 = 50;

/// What a room is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "room_type", rename_all = "snake_case")]
pub enum RoomType {
    /// Persistent chat only.
    Text,
    /// Audio-first hangout. Video may still be enabled per participant.
    Voice,
    /// Video-first room.
    Video,
    /// A mini-game or shared activity, with media alongside it.
    Activity,
}

impl RoomType {
    /// Does joining this room involve the media plane at all?
    pub const fn is_media(self) -> bool {
        matches!(self, RoomType::Voice | RoomType::Video | RoomType::Activity)
    }

    /// Can messages be posted here?
    ///
    /// Every room has a text channel — a voice room's chat sidebar is the same
    /// `messages` table as a text room's history.
    pub const fn allows_messages(self) -> bool {
        true
    }

    /// Stable lower-case name, used in errors and logs.
    pub const fn as_str(self) -> &'static str {
        match self {
            RoomType::Text => "text",
            RoomType::Voice => "voice",
            RoomType::Video => "video",
            RoomType::Activity => "activity",
        }
    }

    /// The permission a participant needs to publish a camera track here.
    ///
    /// Kept as a method rather than a constant so a future "stage" room type
    /// can demand something stricter without touching call sites.
    pub const fn camera_permission(self) -> Permission {
        Permission::UseVideo
    }
}

/// A room inside a community.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Room {
    /// Primary key.
    pub id: RoomId,
    /// Owning community.
    pub community_id: CommunityId,
    /// Display name.
    pub name: String,
    /// Topic line shown under the name.
    pub topic: Option<String>,
    /// What the room is for.
    pub room_type: RoomType,
    /// Sort order within the community.
    pub position: i32,
    /// Cap on simultaneous media participants; `None` means the global default.
    pub max_participants: Option<i32>,
    /// Creation time (UTC).
    pub created_at: Timestamp,
    /// Last modification time (UTC).
    pub updated_at: Timestamp,
}

impl Room {
    /// Effective participant cap for this room.
    pub fn participant_limit(&self) -> i32 {
        self.max_participants.unwrap_or(MEDIA_ROOM_MAX_PARTICIPANTS)
    }

    /// Reject media joins on text rooms early, with a typed error.
    pub fn require_media(&self) -> DomainResult<()> {
        if self.room_type.is_media() {
            Ok(())
        } else {
            Err(DomainError::UnsupportedRoomType(self.room_type.as_str()))
        }
    }
}

/// Validate a room name.
pub fn validate_room_name(raw: &str) -> DomainResult<String> {
    let name = raw.trim().to_owned();
    if name.is_empty() || name.chars().count() > ROOM_NAME_MAX_LEN {
        return Err(DomainError::invalid(
            "name",
            format!("must be between 1 and {ROOM_NAME_MAX_LEN} characters"),
        ));
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn room(room_type: RoomType) -> Room {
        Room {
            id: RoomId::new(),
            community_id: CommunityId::new(),
            name: "lounge".into(),
            topic: None,
            room_type,
            position: 0,
            max_participants: None,
            created_at: crate::now(),
            updated_at: crate::now(),
        }
    }

    #[test]
    fn only_media_room_types_accept_media_sessions() {
        assert!(room(RoomType::Voice).require_media().is_ok());
        assert!(room(RoomType::Video).require_media().is_ok());
        assert!(room(RoomType::Activity).require_media().is_ok());

        let err = room(RoomType::Text).require_media().unwrap_err();
        assert_eq!(err, DomainError::UnsupportedRoomType("text"));
    }

    #[test]
    fn every_room_has_chat() {
        for t in [RoomType::Text, RoomType::Voice, RoomType::Video, RoomType::Activity] {
            assert!(t.allows_messages());
        }
    }

    #[test]
    fn participant_limit_falls_back_to_the_default() {
        let mut r = room(RoomType::Voice);
        assert_eq!(r.participant_limit(), MEDIA_ROOM_MAX_PARTICIPANTS);
        r.max_participants = Some(4);
        assert_eq!(r.participant_limit(), 4);
    }
}
