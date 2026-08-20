//! # genzh-signaling
//!
//! The wire protocol spoken over `wss://…/ws/media`.
//!
//! Everything here is data: no I/O, no WebRTC types, no room state. Both the
//! media server and (eventually) a Rust test client depend on this crate, so
//! the protocol has exactly one definition.
//!
//! ## Shape
//!
//! JSON, externally tagged on a `type` field. JSON was chosen for the first
//! implementation because it is debuggable from a browser console; the
//! [`PROTOCOL_VERSION`] handshake is what lets a binary encoding replace it
//! later without a flag day.
//!
//! ```jsonc
//! // client → server
//! { "type": "join", "room_id": "…", "token": "eyJ…" }
//! { "type": "offer", "target": "publisher", "sdp": "v=0…" }
//! // server → client
//! { "type": "joined", "participant_id": "…", "participants": [ … ] }
//! { "type": "event", "event": "speaking_started", "participant_id": "…" }
//! ```
//!
//! ## Two peer connections
//!
//! Each participant runs **two** peer connections, distinguished by
//! [`PeerTarget`]:
//!
//! | Target | Offerer | Carries |
//! |---|---|---|
//! | [`PeerTarget::Publisher`] | the client | the participant's own mic/camera/screen |
//! | [`PeerTarget::Subscriber`] | the server | everybody else's tracks |
//!
//! This is a deliberate departure from the single-connection sketch, and it
//! buys something specific: **there is never a glare condition**. With one
//! connection, the server must add a track (someone else joined) at the same
//! moment the client adds one (the user unmutes), and both sides try to offer.
//! Handling that correctly needs rollback and a politeness rule. With one
//! offerer per connection the problem does not exist, at the cost of a second
//! ICE/DTLS handshake — which is why every production SFU is built this way.

pub mod budget;
pub mod limits;
pub mod protocol;

pub use budget::MessageBudget;
pub use limits::*;
pub use protocol::{
    ClientMessage, PROTOCOL_VERSION, PeerTarget, ProtocolError, ServerMessage, SignalCloseCode,
};
