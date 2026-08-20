//! Fan-out of real-time events.
//!
//! Something happens in one request — a message is posted, a friend request is
//! accepted — and every connection that cares has to hear about it. That is a
//! publish/subscribe problem, and the shape of the answer differs enormously
//! between one process and many: in-process it is a broadcast channel, across a
//! fleet it is Redis pub/sub, NATS, or a Postgres `LISTEN`.
//!
//! [`EventBus`] is the shape both have in common: publish one event, hand each
//! subscriber a stream of them. [`InMemoryEventBus`] is today's implementation.
//! Because the API talks to the trait, moving to a broker is a change here and
//! in the line of wiring that constructs it — every publisher and every socket
//! stays as it is.
//!
//! # Delivery is best-effort, and callers must want that
//!
//! A subscriber that falls behind loses events rather than blocking the
//! publisher. This is deliberate and it is the same guarantee a broker gives:
//! one stalled socket must never be able to hold up a message for everybody
//! else. Anything that must survive the loss is written to PostgreSQL first and
//! published second — see how notifications are stored before they are pushed.
//!
//! # Subscriptions are not filtered
//!
//! Every subscriber sees every event and decides what to forward. Filtering at
//! the bus would mean the bus knowing what a room subscription or a user-scoped
//! event is, which is application knowledge; keeping it out is what lets this
//! module be generic over the event type at all.

use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::broadcast;

use crate::store::StoreResult;

/// A live subscription to a bus.
///
/// Kept as a trait object rather than a concrete receiver so an implementation
/// backed by a broker — where a subscription is a socket, not a channel — fits
/// the same call sites.
#[async_trait]
pub trait EventStream<E>: Send + Sync {
    /// The next event, or `None` once the bus is gone and no more will arrive.
    ///
    /// Implementations must be cancel-safe: this is awaited inside a
    /// `tokio::select!` alongside socket reads, so the future is dropped and
    /// recreated constantly, and an implementation that consumed an event
    /// before returning it would drop one on every loop iteration.
    async fn recv(&mut self) -> Option<E>;
}

/// Publishes events to every live subscriber.
#[async_trait]
pub trait EventBus<E>: Send + Sync + 'static
where
    E: Clone + Send + Sync + 'static,
{
    /// Publish one event.
    ///
    /// Having no subscribers is success, not failure: it means nobody is
    /// connected to tell, which is the normal state of a quiet room.
    async fn publish(&self, event: E) -> StoreResult<()>;

    /// Open a subscription.
    ///
    /// Only events published *after* this returns are delivered. A subscriber
    /// that needs the backlog reads it from the database — that is the
    /// difference between a bus and a log, and this is a bus.
    fn subscribe(&self) -> Box<dyn EventStream<E>>;

    /// How many subscriptions are open, for the health endpoint.
    fn subscriber_count(&self) -> usize;
}

/// A single-process bus over a Tokio broadcast channel.
pub struct InMemoryEventBus<E> {
    tx: broadcast::Sender<E>,
}

impl<E> std::fmt::Debug for InMemoryEventBus<E> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("InMemoryEventBus")
            .field("subscribers", &self.tx.receiver_count())
            .finish()
    }
}

impl<E> InMemoryEventBus<E>
where
    E: Clone + Send + Sync + 'static,
{
    /// Build a bus buffering `capacity` events per subscriber.
    ///
    /// The buffer is what a slow subscriber may fall behind by before it starts
    /// losing events. Too small and a client on a bad connection misses
    /// messages during a busy moment; too large and each subscriber's backlog
    /// costs memory.
    pub fn new(capacity: usize) -> Arc<Self> {
        Arc::new(Self {
            tx: broadcast::channel(capacity.max(1)).0,
        })
    }
}

#[async_trait]
impl<E> EventBus<E> for InMemoryEventBus<E>
where
    E: Clone + Send + Sync + 'static,
{
    async fn publish(&self, event: E) -> StoreResult<()> {
        // `send` errors only when there are no receivers at all, which is not a
        // failure of publishing — see the trait docs.
        let _ = self.tx.send(event);
        Ok(())
    }

    fn subscribe(&self) -> Box<dyn EventStream<E>> {
        Box::new(BroadcastStream {
            rx: self.tx.subscribe(),
        })
    }

    fn subscriber_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

/// [`EventStream`] over a broadcast receiver.
struct BroadcastStream<E> {
    rx: broadcast::Receiver<E>,
}

#[async_trait]
impl<E> EventStream<E> for BroadcastStream<E>
where
    E: Clone + Send + Sync + 'static,
{
    async fn recv(&mut self) -> Option<E> {
        loop {
            match self.rx.recv().await {
                Ok(event) => return Some(event),
                // Falling behind is recoverable: the receiver is fast-forwarded
                // to the oldest event still buffered and carries on. Returning
                // `None` here would close a socket over a momentary stall.
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "event subscriber fell behind; events dropped");
                }
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_subscriber_receives_what_is_published() {
        let bus = InMemoryEventBus::<&'static str>::new(8);
        let mut stream = bus.subscribe();

        bus.publish("hello").await.expect("publish");
        assert_eq!(stream.recv().await, Some("hello"));
    }

    #[tokio::test]
    async fn every_subscriber_receives_every_event() {
        let bus = InMemoryEventBus::<u8>::new(8);
        let mut first = bus.subscribe();
        let mut second = bus.subscribe();

        bus.publish(7).await.expect("publish");

        assert_eq!(first.recv().await, Some(7));
        assert_eq!(second.recv().await, Some(7));
    }

    #[tokio::test]
    async fn publishing_to_nobody_is_not_an_error() {
        let bus = InMemoryEventBus::<u8>::new(8);
        assert_eq!(bus.subscriber_count(), 0);
        bus.publish(1).await.expect("a quiet room is not a failure");
    }

    #[tokio::test]
    async fn only_events_published_after_subscribing_are_delivered() {
        let bus = InMemoryEventBus::<u8>::new(8);
        bus.publish(1).await.expect("publish");

        let mut stream = bus.subscribe();
        bus.publish(2).await.expect("publish");

        assert_eq!(stream.recv().await, Some(2), "the backlog is not replayed");
    }

    #[tokio::test]
    async fn a_slow_subscriber_loses_events_rather_than_the_stream() {
        let bus = InMemoryEventBus::<u8>::new(2);
        let mut stream = bus.subscribe();

        for event in 0..6 {
            bus.publish(event).await.expect("publish");
        }

        // Lagged, so the earliest events are gone — but the subscription
        // survives and resumes at the oldest event still buffered.
        assert_eq!(stream.recv().await, Some(4));
        assert_eq!(stream.recv().await, Some(5));
    }

    #[tokio::test]
    async fn a_stream_ends_when_the_bus_is_dropped() {
        let bus = InMemoryEventBus::<u8>::new(8);
        let mut stream = bus.subscribe();
        drop(bus);
        assert_eq!(stream.recv().await, None);
    }

    #[tokio::test]
    async fn subscriptions_are_counted_and_released() {
        let bus = InMemoryEventBus::<u8>::new(8);
        let stream = bus.subscribe();
        assert_eq!(bus.subscriber_count(), 1);
        drop(stream);
        assert_eq!(bus.subscriber_count(), 0);
    }

    #[tokio::test]
    async fn the_port_is_object_safe() {
        let bus: Arc<dyn EventBus<u8>> = InMemoryEventBus::new(8);
        let mut stream = bus.subscribe();
        bus.publish(3).await.expect("publish");
        assert_eq!(stream.recv().await, Some(3));
    }
}
