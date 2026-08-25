//! The queries, run against a real PostgreSQL.
//!
//! The scoring is unit-tested without a database and the filters are not, which
//! leaves the half that can only fail at runtime: a mistyped bind, a column that
//! does not exist, an array parameter Postgres refuses to plan. None of those
//! fail to compile — `sqlx::query_as` will build any string at all — so this is
//! the only place they can be caught.
//!
//! Read-only throughout. Every statement is a `SELECT`, so this is safe to point
//! at a development database.
//!
//! Skipped when `DATABASE_URL` is unset, and **loudly** — a silent skip that
//! still prints "ok" is how a suite comes to certify nothing at all.

use genzh_domain::UserId;
use genzh_infrastructure::{PgConfig, connect};
use genzh_recommend::{CommunityRecommender, PeopleRecommender, RoomRecommender, ViewerSignals};

/// Connect, or explain why not and skip.
async fn pool() -> Option<genzh_infrastructure::DbPool> {
    let url = std::env::var("DATABASE_URL")
        .or_else(|_| std::env::var("TEST_DATABASE_URL"))
        .ok()?;

    let mut config = PgConfig::new(&url);
    config.max_connections = 2;

    match connect(&config).await {
        Ok(pool) => Some(pool),
        Err(error) => {
            eprintln!("SKIP: cannot reach the database: {error}");
            None
        }
    }
}

fn skipped() {
    eprintln!("SKIP: set DATABASE_URL to run the recommendation query tests");
}

/// Any account, so the queries run against real row shapes. Falls back to a
/// random UUID, which is itself worth exercising: a viewer with no rows at all
/// is the cold-start path.
async fn some_viewer(pool: &genzh_infrastructure::DbPool) -> UserId {
    // `RECOMMEND_VIEWER` pins the account, for reproducing one person's feed.
    if let Ok(raw) = std::env::var("RECOMMEND_VIEWER")
        && let Ok(id) = raw.parse::<uuid::Uuid>()
    {
        return UserId::from(id);
    }

    sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM users ORDER BY id LIMIT 1")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(UserId::from)
        .unwrap_or_else(|| UserId::from(uuid::Uuid::new_v4()))
}

#[tokio::test]
async fn every_recommender_query_plans_and_runs() {
    let Some(pool) = pool().await else {
        return skipped();
    };

    let viewer = some_viewer(&pool).await;
    let signals = ViewerSignals::load(&pool, viewer)
        .await
        .expect("viewer signals must load");

    let rooms = RoomRecommender::new(pool.clone())
        .recommend(viewer, &signals, None, 10)
        .await
        .expect("room recommendations must run");

    let filtered = RoomRecommender::new(pool.clone())
        .recommend(viewer, &signals, Some("tech"), 10)
        .await
        .expect("category-filtered room recommendations must run");

    let people = PeopleRecommender::new(pool.clone())
        .recommend(viewer, &signals, 10)
        .await
        .expect("people recommendations must run");

    let communities = CommunityRecommender::new(pool.clone())
        .recommend(viewer, &signals, 10)
        .await
        .expect("community recommendations must run");

    eprintln!(
        "viewer={viewer:?} cold={} friends={} communities_in={} known_rooms={}",
        signals.is_cold(),
        signals.friends.len(),
        signals.communities.len(),
        signals.known_rooms.len(),
    );
    eprintln!(
        "  -> rooms={} filtered={} people={} communities={}",
        rooms.len(),
        filtered.len(),
        people.len(),
        communities.len(),
    );

    // Ranked, and never longer than asked for.
    assert!(rooms.len() <= 10);
    assert!(people.len() <= 10);
    assert!(communities.len() <= 10);

    for window in rooms.windows(2) {
        assert!(
            window[0].score >= window[1].score,
            "rooms must come back ranked"
        );
    }

    // The filters are the safety boundary, so assert them rather than trust
    // them: every one of these is a promise the ranking cannot make.
    for recommendation in &rooms {
        assert!(
            !signals.known_rooms.contains(&recommendation.room.id.into()),
            "a room the viewer is already in was recommended"
        );
        assert_ne!(
            recommendation.room.owner_id.map(uuid::Uuid::from),
            Some(uuid::Uuid::from(viewer)),
            "a room the viewer owns was recommended back to them"
        );
    }

    for person in &people {
        assert!(
            !signals.excluded_users.contains(&person.user_id),
            "an excluded account was recommended"
        );
        assert!(
            !signals.friends.contains(&person.user_id),
            "an existing friend was recommended"
        );
    }

    for community in &communities {
        assert!(
            !signals.communities.contains(&community.community_id),
            "a community the viewer is already in was recommended"
        );
    }
}

#[tokio::test]
async fn a_viewer_with_no_history_still_gets_rooms() {
    let Some(pool) = pool().await else {
        return skipped();
    };

    // An account that does not exist has no friends, no communities and no
    // history — exactly the shape of a just-registered one, and the case that
    // must not come back empty.
    let stranger = UserId::from(uuid::Uuid::new_v4());
    let signals = ViewerSignals::load(&pool, stranger)
        .await
        .expect("signals for an unknown viewer must load");

    assert!(signals.is_cold(), "an unknown viewer must read as cold");

    let rooms = RoomRecommender::new(pool.clone())
        .recommend(stranger, &signals, None, 5)
        .await
        .expect("cold-start room recommendations must run");

    let eligible: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM rooms
          WHERE status = 'active' AND visibility = 'public' AND category <> 'dm'",
    )
    .fetch_one(&pool)
    .await
    .expect("count eligible rooms");

    if eligible > 0 {
        assert!(
            !rooms.is_empty(),
            "cold start returned nothing despite {eligible} eligible rooms"
        );
        // Popularity is the only term it can score on, so these should still
        // arrive explained rather than as a bare list.
        assert!(
            rooms.iter().any(|r| !r.reasons.is_empty()),
            "cold-start recommendations must still be explained"
        );
    }
}
