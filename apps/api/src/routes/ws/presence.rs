//! Counting connections, and telling the room somebody arrived.
//!
//! Split from the socket loop because it is the one thing on the socket that is
//! not about *this* socket: a user with three tabs open is online once, so the
//! decision is about the account, and the connection is only the evidence.

use genzh_domain::UserId;

use crate::state::AppState;

use super::protocol::ChatServerEvent;

/// Which way a connection just went, for [`announce_presence`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Connection {
    /// A socket authenticated as this user.
    Opened,
    /// A socket that was counted for this user has gone.
    Closed,
}

/// Record a connection change and announce it — if it is a transition.
///
/// `Unchanged` is the common case — a second tab opening or closing — and
/// announcing it would put a message on every connection in the process for
/// something nobody can see.
///
/// A presence store that cannot answer costs this user their online badge and
/// nothing else, so the failure is logged and the socket carries on. Tearing
/// down a working chat connection because a counter was unreachable would be
/// the worse trade.
pub(super) async fn announce_presence(state: &AppState, user_id: UserId, connection: Connection) {
    let change = match connection {
        Connection::Opened => state.presence.connect(user_id).await,
        Connection::Closed => state.presence.disconnect(user_id).await,
    };

    let change = match change {
        Ok(change) => change,
        Err(error) => {
            tracing::warn!(%error, %user_id, ?connection, "could not record presence");
            return;
        }
    };

    let Some(online) = change.announced_state() else {
        return;
    };

    state
        .broadcast(ChatServerEvent::PresenceChanged { user_id, online })
        .await;
}
