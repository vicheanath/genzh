//! Strongly-typed identifiers.
//!
//! Every aggregate gets its own newtype over [`Uuid`] so that a `RoomId` can
//! never be passed where a `CommunityId` is expected. They are transparent to
//! SQLx and serde, so they cost nothing at the storage or wire boundary.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

macro_rules! typed_id {
    ($(#[$meta:meta])* $name:ident) => {
        $(#[$meta])*
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
            sqlx::Type,
        )]
        #[serde(transparent)]
        #[sqlx(transparent)]
        pub struct $name(pub Uuid);

        impl $name {
            /// Generate a fresh random identifier.
            pub fn new() -> Self {
                Self(Uuid::new_v4())
            }

            /// The underlying UUID.
            pub const fn as_uuid(&self) -> Uuid {
                self.0
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl From<Uuid> for $name {
            fn from(value: Uuid) -> Self {
                Self(value)
            }
        }

        impl From<$name> for Uuid {
            fn from(value: $name) -> Self {
                value.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                fmt::Display::fmt(&self.0, f)
            }
        }

        impl FromStr for $name {
            type Err = uuid::Error;

            fn from_str(s: &str) -> Result<Self, Self::Err> {
                Ok(Self(Uuid::parse_str(s)?))
            }
        }
    };
}

typed_id!(
    /// Identifies a user account.
    UserId
);
typed_id!(
    /// Identifies a refresh-token session.
    SessionId
);
typed_id!(
    /// Identifies a community ("server" in other products).
    CommunityId
);
typed_id!(
    /// Identifies a role inside a community.
    RoleId
);
typed_id!(
    /// Identifies a room inside a community.
    RoomId
);
typed_id!(
    /// Identifies a chat message.
    MessageId
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_roundtrip_through_strings() {
        let id = RoomId::new();
        let parsed: RoomId = id.to_string().parse().expect("valid uuid");
        assert_eq!(id, parsed);
    }

    #[test]
    fn ids_are_distinct_types_but_share_a_uuid_representation() {
        let uuid = Uuid::new_v4();
        assert_eq!(RoomId::from(uuid).as_uuid(), CommunityId::from(uuid).as_uuid());
    }
}
