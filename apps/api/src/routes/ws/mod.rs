//! Real-time Chat WebSocket gateway.
//!
//! Provides sub-millisecond instant message delivery, live reactions, typing
//! indicators, and presence updates for connected clients.
//!
//! ## Abuse, over a socket
//!
//! Nothing that arrives here passed the per-address rate-limit middleware: the
//! HTTP layer saw one upgrade request and has not looked since. Two defences
//! stand in for it, and they are in different places for a reason.
//!
//! Anything that becomes a row — a message, a reaction — is refused inside
//! `genzh_messaging`, so the rule is the same whichever transport carried it.
//! What is left is [`ChatClientCommand::Typing`], which writes nothing and is
//! therefore invisible to that guard while still fanning out to every
//! subscriber in the room. It is throttled per connection, in [`session`],
//! because "how often may this socket say someone is typing" is a fact about
//! this socket.
//!
//! ## The shape of this module
//!
//! [`protocol`] is the wire contract, [`session`] is one connection, [`commands`]
//! is what each command means, and [`presence`] is the connection accounting.
//! What is left below is the loop itself: read a frame, hand it on, write what
//! the application published. It has no idea what any of the commands do, which
//! is the point — the previous version was a single 320-line function where the
//! heartbeat, the JSON, the throttle and the mention notifications were all the
//! same block of code.

mod commands;
mod presence;
mod protocol;
mod session;

use axum::extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use futures::StreamExt;
use std::time::Duration;
use tokio::time::interval;

use crate::state::AppState;

pub use protocol::{CallEndReason, ChatClientCommand, ChatServerEvent, WsAuthQuery};

use session::{Outbound, Session};

/// How often the server pings an idle connection.
const HEARTBEAT: Duration = Duration::from_secs(30);

/// `GET /api/v1/ws`
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<WsAuthQuery>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, query.token))
}

async fn handle_socket(socket: WebSocket, state: AppState, initial_token: Option<String>) {
    let (sink, mut receiver) = socket.split();
    let mut out = Outbound::new(sink);
    let mut session = Session::new();

    // Subscribing before the token is looked at, so this connection hears about
    // its own arrival like everyone else.
    let mut events = state.events.subscribe();

    if let Some(token) = initial_token
        && session.authenticate(&state, &token).await
        && let Some(user) = session.user()
    {
        out.tell(ChatServerEvent::Authenticated {
            user_id: user.user_id,
        })
        .await;
    }

    let mut heartbeat = interval(HEARTBEAT);

    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                if !out.ping().await {
                    break;
                }
            }

            // Inbound: whatever this client asked for.
            frame = receiver.next() => {
                let Some(Ok(frame)) = frame else { break };

                match frame {
                    WsMessage::Text(text) => {
                        // Unparseable input is ignored rather than answered.
                        // A client that cannot form a command cannot read the
                        // complaint either, and saying nothing keeps a broken
                        // or hostile socket from making the server talk.
                        if let Ok(command) = serde_json::from_str::<ChatClientCommand>(&text) {
                            commands::handle(&state, &mut session, &mut out, command).await;
                        }
                    }
                    WsMessage::Close(_) => break,
                    _ => {}
                }
            }

            // Outbound: whatever the application published.
            event = events.recv() => {
                // `None` means the bus is gone, which only happens on shutdown.
                // Continuing would spin on a closed stream forever.
                let Some(event) = event else { break };

                if !session.accepts(&event) {
                    continue;
                }

                if !out.send(&event).await {
                    break;
                }
            }
        }
    }

    // The loop only ends when the socket is gone, so this is the one place a
    // disconnect is observed — every exit path funnels through it.
    session.release(&state).await;
}
