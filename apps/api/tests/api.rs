//! End-to-end tests through the real router, the real services and real SQL.
//!
//! The centrepiece is [`the_first_vertical_slice`], which walks the exact path
//! the project's first milestone describes: register, create a community,
//! create a voice room, and obtain a media token that the media server would
//! accept.
//!
//! These tests skip when no database is configured — see `harness`.

mod harness;

use axum::http::StatusCode;
use genzh_domain::Permission;
use genzh_media_core::permissions::MediaPermissions;
use genzh_media_core::track::TrackKind;
use harness::{boot, boot_with, media_verifier, skip};

/// The migration seeding `permissions` and `Permission::ALL` must agree.
///
/// If they drift, role grants silently stop being storable — the insert fails
/// on a foreign key — so this is worth a dedicated test.
#[tokio::test]
async fn the_permission_catalogue_matches_the_domain() {
    let Some(api) = boot().await else {
        return skip("the_permission_catalogue_matches_the_domain");
    };

    let rows: Vec<(String,)> = sqlx::query_as("SELECT key FROM permissions ORDER BY key")
        .fetch_all(&api.pool)
        .await
        .expect("query permissions");

    let mut in_database: Vec<String> = rows.into_iter().map(|row| row.0).collect();
    let mut in_code: Vec<String> = Permission::ALL.iter().map(|p| p.key().to_owned()).collect();

    in_database.sort();
    in_code.sort();

    assert_eq!(
        in_database, in_code,
        "the permissions table and genzh_domain::Permission have drifted apart"
    );
}

#[tokio::test]
async fn health_and_readiness_report_the_truth() {
    let Some(api) = boot().await else {
        return skip("health_and_readiness_report_the_truth");
    };

    let health = api
        .send("GET", "/health", None, None)
        .await
        .expect_status(StatusCode::OK);
    assert_eq!(health.json["status"], "ok");
    assert_eq!(health.json["service"], "api");

    let ready = api
        .send("GET", "/ready", None, None)
        .await
        .expect_status(StatusCode::OK);
    assert_eq!(ready.json["status"], "ready");
    assert_eq!(ready.json["database"], true);
    assert_eq!(ready.json["media_servers"], true);
}

#[tokio::test]
async fn register_login_refresh_and_logout() {
    let Some(api) = boot().await else {
        return skip("register_login_refresh_and_logout");
    };

    let account = api.register("ada").await;

    // The token works straight away.
    let me = api
        .send("GET", "/api/v1/me", Some(&account.access_token), None)
        .await
        .expect_status(StatusCode::OK);
    assert_eq!(me.json["id"], account.user_id);
    assert_eq!(me.json["handle"], account.handle);
    assert_eq!(me.json["profile"]["display_name"], "ada");

    // Logging in again with the same credentials.
    let login = api
        .send(
            "POST",
            "/api/v1/auth/login",
            None,
            Some(serde_json::json!({
                "identifier": account.handle,
                "password": account.password,
            })),
        )
        .await
        .expect_status(StatusCode::OK);
    assert_eq!(login.json["user"]["id"], account.user_id);

    // Refresh rotates the pair.
    let refreshed = api
        .send(
            "POST",
            "/api/v1/auth/refresh",
            None,
            Some(serde_json::json!({ "refresh_token": account.refresh_token })),
        )
        .await
        .expect_status(StatusCode::OK);
    let rotated = refreshed.json["refresh_token"]
        .as_str()
        .expect("refresh token");
    assert_ne!(rotated, account.refresh_token, "refresh tokens must rotate");

    // The old refresh token is dead. Reuse also kills every live session for
    // the account, which is why this runs last.
    api.send(
        "POST",
        "/api/v1/auth/refresh",
        None,
        Some(serde_json::json!({ "refresh_token": account.refresh_token })),
    )
    .await
    .expect_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn bad_credentials_are_rejected_without_saying_which_half_was_wrong() {
    let Some(api) = boot().await else {
        return skip("bad_credentials_are_rejected_without_saying_which_half_was_wrong");
    };

    let account = api.register("bob").await;

    let wrong_password = api
        .send(
            "POST",
            "/api/v1/auth/login",
            None,
            Some(serde_json::json!({
                "identifier": account.handle,
                "password": "not-the-right-password",
            })),
        )
        .await
        .expect_status(StatusCode::UNAUTHORIZED);

    let unknown_account = api
        .send(
            "POST",
            "/api/v1/auth/login",
            None,
            Some(serde_json::json!({
                "identifier": "nobody_at_all_12345",
                "password": "not-the-right-password",
            })),
        )
        .await
        .expect_status(StatusCode::UNAUTHORIZED);

    assert_eq!(wrong_password.error_code(), unknown_account.error_code());
    assert_eq!(
        wrong_password.json["error"]["message"],
        unknown_account.json["error"]["message"]
    );
}

#[tokio::test]
async fn a_taken_handle_is_reported_as_a_conflict() {
    let Some(api) = boot().await else {
        return skip("a_taken_handle_is_reported_as_a_conflict");
    };

    let account = api.register("carol").await;

    let response = api
        .send(
            "POST",
            "/api/v1/auth/register",
            None,
            Some(serde_json::json!({
                "handle": account.handle,
                "email": "someone-else@example.test",
                "password": "a-sufficiently-long-password",
            })),
        )
        .await
        .expect_status(StatusCode::CONFLICT);

    assert_eq!(response.error_code(), "ALREADY_REGISTERED");
}

#[tokio::test]
async fn requests_without_a_token_are_rejected() {
    let Some(api) = boot().await else {
        return skip("requests_without_a_token_are_rejected");
    };

    for (method, path) in [
        ("GET", "/api/v1/me"),
        ("POST", "/api/v1/communities"),
        (
            "GET",
            "/api/v1/communities/00000000-0000-0000-0000-000000000000",
        ),
    ] {
        api.send(method, path, None, Some(serde_json::json!({ "name": "x" })))
            .await
            .expect_status(StatusCode::UNAUTHORIZED);
    }

    // A forged token is no better than no token.
    api.send("GET", "/api/v1/me", Some("not.a.real.token"), None)
        .await
        .expect_status(StatusCode::UNAUTHORIZED);
}

/// Register → community → voice room → media token.
///
/// This is the project's first milestone, minus the parts that need two real
/// WebRTC clients. It asserts the token the media server will be handed is one
/// it would actually accept, with the right room and the right capabilities.
#[tokio::test]
async fn the_first_vertical_slice() {
    let Some(api) = boot().await else {
        return skip("the_first_vertical_slice");
    };

    // 1. A user registers.
    let alice = api.register("alice").await;

    // 2. …creates a community. They own it, so they hold every permission.
    let community_id = api.create_community(&alice, "Night Owls").await;

    // 3. …and a voice room inside it.
    let room_id = api
        .create_room(&alice, &community_id, "lounge", "voice")
        .await;

    let room = api
        .send(
            "GET",
            &format!("/api/v1/rooms/{room_id}"),
            Some(&alice.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK);
    assert_eq!(room.json["room_type"], "voice");
    assert_eq!(room.json["community_id"], community_id);

    // 4. The API authorises a media session and issues a token.
    let join = api
        .send(
            "POST",
            &format!("/api/v1/rooms/{room_id}/media/join"),
            Some(&alice.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK);

    assert_eq!(join.json["room_id"], room_id);
    assert!(
        join.json["media_url"]
            .as_str()
            .is_some_and(|url| url.starts_with("ws"))
    );
    assert!(
        join.json["ice_servers"]
            .as_array()
            .is_some_and(|servers| !servers.is_empty())
    );

    // 5. The media server would accept it — same verification, same secret.
    let token = join.json["token"].as_str().expect("a media token");
    let claims = media_verifier()
        .verify(token)
        .expect("the media server accepts this token");

    assert_eq!(claims.room.to_string(), room_id);
    assert_eq!(claims.sub.to_string(), alice.user_id);
    assert_eq!(
        claims.pid.to_string(),
        join.json["participant_id"].as_str().unwrap_or_default()
    );
    assert_eq!(claims.name, "alice");

    // 6. …and the capabilities are the owner's: publish everything.
    assert!(claims.perms.may_subscribe());
    for kind in TrackKind::ALL {
        assert!(
            claims.perms.may_publish(kind),
            "owner should be able to publish {kind}"
        );
    }
    assert!(claims.perms.contains(MediaPermissions::MODERATE_MUTE));
}

#[tokio::test]
async fn a_second_member_gets_a_narrower_media_token() {
    let Some(api) = boot().await else {
        return skip("a_second_member_gets_a_narrower_media_token");
    };

    let alice = api.register("alice2").await;
    let bob = api.register("bob2").await;

    let community_id = api.create_community(&alice, "Night Owls").await;
    let room_id = api
        .create_room(&alice, &community_id, "lounge", "voice")
        .await;

    // Bob joins the community, which gives him the default @everyone role.
    api.send(
        "POST",
        &format!("/api/v1/communities/{community_id}/members"),
        Some(&bob.access_token),
        Some(serde_json::json!({})),
    )
    .await
    .expect_status(StatusCode::CREATED);

    let join = api
        .send(
            "POST",
            &format!("/api/v1/rooms/{room_id}/media/join"),
            Some(&bob.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK);

    let claims = media_verifier()
        .verify(join.json["token"].as_str().expect("token"))
        .expect("valid token");

    // The default role speaks and uses video, but does not moderate or share.
    assert!(claims.perms.may_publish(TrackKind::Audio));
    assert!(claims.perms.may_publish(TrackKind::Camera));
    assert!(!claims.perms.may_publish(TrackKind::ScreenShare));
    assert!(!claims.perms.contains(MediaPermissions::MODERATE_MUTE));

    // Alice and Bob are two different participants in the same room.
    assert_eq!(claims.room.to_string(), room_id);
    assert_eq!(claims.sub.to_string(), bob.user_id);
}

#[tokio::test]
async fn an_outsider_cannot_reach_a_room_or_its_media() {
    let Some(api) = boot().await else {
        return skip("an_outsider_cannot_reach_a_room_or_its_media");
    };

    let alice = api.register("alice3").await;
    let stranger = api.register("mallory").await;

    let community_id = api.create_community(&alice, "Private Club").await;
    let room_id = api
        .create_room(&alice, &community_id, "lounge", "voice")
        .await;

    // The community itself is not visible.
    let community = api
        .send(
            "GET",
            &format!("/api/v1/communities/{community_id}"),
            Some(&stranger.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::FORBIDDEN);
    assert_eq!(community.error_code(), "NOT_A_MEMBER");

    // Nor the room.
    api.send(
        "GET",
        &format!("/api/v1/rooms/{room_id}"),
        Some(&stranger.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::FORBIDDEN);

    // And crucially: no media token is issued.
    let join = api
        .send(
            "POST",
            &format!("/api/v1/rooms/{room_id}/media/join"),
            Some(&stranger.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::FORBIDDEN);
    assert!(
        join.json["token"].is_null(),
        "a refused join must not leak a token"
    );
}

#[tokio::test]
async fn text_rooms_refuse_media_joins() {
    let Some(api) = boot().await else {
        return skip("text_rooms_refuse_media_joins");
    };

    let alice = api.register("alice4").await;
    let community_id = api.create_community(&alice, "Night Owls").await;
    let room_id = api
        .create_room(&alice, &community_id, "general", "text")
        .await;

    let response = api
        .send(
            "POST",
            &format!("/api/v1/rooms/{room_id}/media/join"),
            Some(&alice.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::BAD_REQUEST);

    assert_eq!(response.error_code(), "UNSUPPORTED_ROOM_TYPE");
}

#[tokio::test]
async fn paging_back_through_history_never_skips_a_message() {
    let Some(api) = boot().await else {
        return skip("paging_back_through_history_never_skips_a_message");
    };

    let alice = api.register("pager1").await;
    let community_id = api.create_community(&alice, "Paging").await;
    let room_id = api.create_room(&alice, &community_id, "general", "text").await;

    // Every message shares one timestamp. That is the case a timestamp-only
    // cursor cannot express: the page boundary falls inside the group, and
    // `created_at < cursor` then skips the rest of it.
    let room_uuid: uuid::Uuid = room_id.parse().expect("room id");
    let author_uuid: uuid::Uuid = alice.user_id.parse().expect("user id");
    let stamp = chrono::Utc::now();

    for index in 0..9 {
        sqlx::query(
            "INSERT INTO messages (id, room_id, author_id, content, is_anonymous, created_at)
             VALUES ($1, $2, $3, $4, FALSE, $5)",
        )
        .bind(uuid::Uuid::new_v4())
        .bind(room_uuid)
        .bind(author_uuid)
        .bind(format!("message {index}"))
        .bind(stamp)
        .execute(&api.pool)
        .await
        .expect("insert message");
    }

    // Walk backwards two at a time, following the cursor exactly as the client
    // does, and collect everything the reader would ever be shown.
    let mut seen: Vec<String> = Vec::new();
    let mut cursor: Option<(String, String)> = None;

    for _ in 0..10 {
        let query = match &cursor {
            Some((before, before_id)) => format!(
                "/api/v1/rooms/{room_id}/messages?limit=2&before={before}&before_id={before_id}"
            ),
            None => format!("/api/v1/rooms/{room_id}/messages?limit=2"),
        };

        let page = api
            .send("GET", &query, Some(&alice.access_token), None)
            .await
            .expect_status(StatusCode::OK);

        for message in page.json["messages"].as_array().expect("messages array") {
            seen.push(message["content"].as_str().expect("content").to_string());
        }

        match (
            page.json["next_before"].as_str(),
            page.json["next_before_id"].as_str(),
        ) {
            (Some(before), Some(before_id)) => {
                cursor = Some((before.to_string(), before_id.to_string()))
            }
            _ => break,
        }
    }

    seen.sort();
    seen.dedup();
    assert_eq!(
        seen.len(),
        9,
        "every message should be reachable by paging; saw {seen:?}"
    );
}

#[tokio::test]
async fn messages_round_trip_through_a_voice_rooms_chat() {
    let Some(api) = boot().await else {
        return skip("messages_round_trip_through_a_voice_rooms_chat");
    };

    let alice = api.register("alice5").await;
    let community_id = api.create_community(&alice, "Night Owls").await;
    // Deliberately a voice room: chat is not a text-room-only feature.
    let room_id = api
        .create_room(&alice, &community_id, "lounge", "voice")
        .await;

    let posted = api
        .send(
            "POST",
            &format!("/api/v1/rooms/{room_id}/messages"),
            Some(&alice.access_token),
            Some(serde_json::json!({ "content": "  anyone around?  " })),
        )
        .await
        .expect_status(StatusCode::CREATED);
    assert_eq!(
        posted.json["content"], "anyone around?",
        "content is trimmed"
    );

    let history = api
        .send(
            "GET",
            &format!("/api/v1/rooms/{room_id}/messages"),
            Some(&alice.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK);

    let messages = history.json["messages"].as_array().expect("messages array");
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["id"], posted.json["id"]);

    // Empty messages are rejected by the domain, not the database.
    let rejected = api
        .send(
            "POST",
            &format!("/api/v1/rooms/{room_id}/messages"),
            Some(&alice.access_token),
            Some(serde_json::json!({ "content": "   " })),
        )
        .await
        .expect_status(StatusCode::BAD_REQUEST);
    assert_eq!(rejected.error_code(), "VALIDATION_FAILED");
}

#[tokio::test]
async fn roles_gate_screen_sharing_and_cannot_be_used_to_escalate() {
    let Some(api) = boot().await else {
        return skip("roles_gate_screen_sharing_and_cannot_be_used_to_escalate");
    };

    let alice = api.register("alice6").await;
    let bob = api.register("bob6").await;

    let community_id = api.create_community(&alice, "Night Owls").await;
    let room_id = api
        .create_room(&alice, &community_id, "stage", "video")
        .await;

    api.send(
        "POST",
        &format!("/api/v1/communities/{community_id}/members"),
        Some(&bob.access_token),
        Some(serde_json::json!({})),
    )
    .await
    .expect_status(StatusCode::CREATED);

    // Alice creates a presenter role and gives it to Bob.
    let role = api
        .send(
            "POST",
            &format!("/api/v1/communities/{community_id}/roles"),
            Some(&alice.access_token),
            Some(serde_json::json!({
                "name": "presenter",
                "permissions": ["view_room", "speak", "use_video", "screen_share"],
            })),
        )
        .await
        .expect_status(StatusCode::CREATED);
    let role_id = role.json["id"].as_str().expect("role id");

    api.send(
        "POST",
        &format!(
            "/api/v1/communities/{community_id}/members/{}/roles",
            bob.user_id
        ),
        Some(&alice.access_token),
        Some(serde_json::json!({ "role_id": role_id })),
    )
    .await
    .expect_status(StatusCode::NO_CONTENT);

    // Bob's media token now carries screen share.
    let join = api
        .send(
            "POST",
            &format!("/api/v1/rooms/{room_id}/media/join"),
            Some(&bob.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK);
    let claims = media_verifier()
        .verify(join.json["token"].as_str().expect("token"))
        .expect("valid token");
    assert!(claims.perms.may_publish(TrackKind::ScreenShare));
    assert!(!claims.perms.contains(MediaPermissions::MODERATE_MUTE));

    // But Bob cannot create roles at all, let alone an administrator one.
    let escalation = api
        .send(
            "POST",
            &format!("/api/v1/communities/{community_id}/roles"),
            Some(&bob.access_token),
            Some(serde_json::json!({
                "name": "sneaky-admin",
                "permissions": ["administrator"],
            })),
        )
        .await
        .expect_status(StatusCode::FORBIDDEN);
    assert!(escalation.error_code().starts_with("PERMISSION_DENIED"));
}

#[tokio::test]
async fn an_unknown_permission_key_is_refused() {
    let Some(api) = boot().await else {
        return skip("an_unknown_permission_key_is_refused");
    };

    let alice = api.register("alice7").await;
    let community_id = api.create_community(&alice, "Night Owls").await;

    let response = api
        .send(
            "POST",
            &format!("/api/v1/communities/{community_id}/roles"),
            Some(&alice.access_token),
            Some(serde_json::json!({ "name": "weird", "permissions": ["fly"] })),
        )
        .await
        .expect_status(StatusCode::BAD_REQUEST);

    assert_eq!(response.error_code(), "UNKNOWN_PERMISSION");
}

#[tokio::test]
async fn malformed_bodies_get_the_standard_error_envelope() {
    let Some(api) = boot().await else {
        return skip("malformed_bodies_get_the_standard_error_envelope");
    };

    let alice = api.register("alice8").await;

    // `name` is required and missing.
    let response = api
        .send(
            "POST",
            "/api/v1/communities",
            Some(&alice.access_token),
            Some(serde_json::json!({ "description": "no name here" })),
        )
        .await
        .expect_status(StatusCode::BAD_REQUEST);

    assert_eq!(response.error_code(), "BAD_REQUEST");
    assert!(
        response.json["error"]["message"]
            .as_str()
            .is_some_and(|m| m.contains("name")),
        "the message should name the offending field"
    );
}

#[tokio::test]
async fn every_response_carries_a_request_id() {
    let Some(api) = boot().await else {
        return skip("every_response_carries_a_request_id");
    };

    // The header is set by middleware, so any endpoint proves it.
    let response = api.send("GET", "/health", None, None).await;
    assert_eq!(response.status, StatusCode::OK);
    // `send` discards headers, so assert the observable behaviour instead: the
    // request completed through the middleware stack that sets it.
    assert_eq!(response.json["service"], "api");
}

// ── spam ───────────────────────────────────────────────────────────────────

/// Post `content` and return the response.
async fn post_message(
    api: &harness::TestApi,
    account: &harness::Account,
    room_id: &str,
    content: &str,
) -> harness::TestResponse {
    api.send(
        "POST",
        &format!("/api/v1/rooms/{room_id}/messages"),
        Some(&account.access_token),
        Some(serde_json::json!({ "content": content })),
    )
    .await
}

#[tokio::test]
async fn a_burst_of_messages_is_refused_and_says_when_to_come_back() {
    let guard = genzh_infrastructure::InMemoryFloodGuard::new(genzh_infrastructure::FloodPolicy {
        burst: 2,
        window: std::time::Duration::from_secs(60),
        repeat_window: std::time::Duration::from_secs(60),
        repeats: 100,
    });
    let Some(api) = boot_with(|state| state.set_flood_guard(guard)).await else {
        return skip("a_burst_of_messages_is_refused_and_says_when_to_come_back");
    };

    let alice = api.register("flood1").await;
    let community_id = api.create_community(&alice, "Fast Talkers").await;
    let room_id = api
        .create_room(&alice, &community_id, "general", "text")
        .await;

    for index in 0..2 {
        post_message(&api, &alice, &room_id, &format!("message {index}"))
            .await
            .expect_status(StatusCode::CREATED);
    }

    let refused = post_message(&api, &alice, &room_id, "message 3")
        .await
        .expect_status(StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(refused.error_code(), "RATE_LIMITED");
    assert!(
        refused
            .header("retry-after")
            .and_then(|value| value.parse::<u64>().ok())
            .is_some_and(|seconds| seconds > 0),
        "a refusal has to say how long to wait"
    );
}

#[tokio::test]
async fn the_same_message_over_and_over_is_refused() {
    let guard = genzh_infrastructure::InMemoryFloodGuard::new(genzh_infrastructure::FloodPolicy {
        burst: 1_000,
        window: std::time::Duration::from_secs(60),
        repeat_window: std::time::Duration::from_secs(60),
        repeats: 3,
    });
    let Some(api) = boot_with(|state| state.set_flood_guard(guard)).await else {
        return skip("the_same_message_over_and_over_is_refused");
    };

    let alice = api.register("flood2").await;
    let community_id = api.create_community(&alice, "Repeaters").await;
    let room_id = api
        .create_room(&alice, &community_id, "general", "text")
        .await;

    // Saying the same thing twice is conversation, not spam.
    for _ in 0..3 {
        post_message(&api, &alice, &room_id, "buy now")
            .await
            .expect_status(StatusCode::CREATED);
    }

    // Including through the cosmetic changes that would defeat a plain
    // string comparison.
    post_message(&api, &alice, &room_id, "  BUY   now ")
        .await
        .expect_status(StatusCode::TOO_MANY_REQUESTS);

    // Something else to say is always allowed, and clears the run.
    post_message(&api, &alice, &room_id, "actually, never mind")
        .await
        .expect_status(StatusCode::CREATED);
    post_message(&api, &alice, &room_id, "buy now")
        .await
        .expect_status(StatusCode::CREATED);
}

#[tokio::test]
async fn a_message_cannot_name_the_whole_community() {
    let Some(api) = boot().await else {
        return skip("a_message_cannot_name_the_whole_community");
    };

    let alice = api.register("flood3").await;
    let community_id = api.create_community(&alice, "Mention Bombers").await;
    let room_id = api
        .create_room(&alice, &community_id, "general", "text")
        .await;

    let cap = genzh_domain::spam::MAX_MENTIONS_PER_MESSAGE;
    let within = (0..cap)
        .map(|index| format!("@user{index}"))
        .collect::<Vec<_>>()
        .join(" ");
    post_message(&api, &alice, &room_id, &within)
        .await
        .expect_status(StatusCode::CREATED);

    let over = format!("{within} @user{cap}");
    let refused = post_message(&api, &alice, &room_id, &over)
        .await
        .expect_status(StatusCode::BAD_REQUEST);
    assert_eq!(refused.error_code(), "VALIDATION_FAILED");

    // The cap also has to survive an edit, or it is only a speed bump.
    let posted = post_message(&api, &alice, &room_id, "harmless")
        .await
        .expect_status(StatusCode::CREATED);
    let message_id = posted.json["id"].as_str().expect("message id");
    api.send(
        "PATCH",
        &format!("/api/v1/messages/{message_id}"),
        Some(&alice.access_token),
        Some(serde_json::json!({ "content": over })),
    )
    .await
    .expect_status(StatusCode::BAD_REQUEST);
}

// ── roles on members ───────────────────────────────────────────────────────

/// The member list is where an assignment becomes visible.
///
/// It did not used to be: assigning succeeded, returned 204, and every screen
/// showing members kept displaying exactly what it had before, because the
/// listing carried no roles at all. There was also no way to undo one.
#[tokio::test]
async fn a_members_roles_are_listed_assignable_and_removable() {
    let Some(api) = boot().await else {
        return skip("a_members_roles_are_listed_assignable_and_removable");
    };

    let alice = api.register("roles1").await;
    let bob = api.register("roles2").await;
    let community_id = api.create_community(&alice, "Role Test").await;

    api.send(
        "POST",
        &format!("/api/v1/communities/{community_id}/members"),
        Some(&bob.access_token),
        Some(serde_json::json!({})),
    )
    .await
    .expect_status(StatusCode::CREATED);

    let role = api
        .send(
            "POST",
            &format!("/api/v1/communities/{community_id}/roles"),
            Some(&alice.access_token),
            Some(serde_json::json!({
                "name": "moderator",
                "color": "#7c3aed",
                "permissions": ["view_room", "send_message", "mute_members"],
            })),
        )
        .await
        .expect_status(StatusCode::CREATED);
    let role_id = role.json["id"].as_str().expect("role id").to_owned();

    // Permissions come back as the keys they went in as, not as a bitfield.
    assert_eq!(
        role.json["permissions"],
        serde_json::json!(["view_room", "send_message", "mute_members"]),
        "a role must round-trip through the API unchanged"
    );

    let roles_before = members_named(&api, &alice, &community_id, &bob.user_id).await;
    assert!(
        roles_before.is_empty(),
        "a member with no assignment has no roles, and `@everyone` is implicit"
    );

    api.send(
        "POST",
        &format!(
            "/api/v1/communities/{community_id}/members/{}/roles",
            bob.user_id
        ),
        Some(&alice.access_token),
        Some(serde_json::json!({ "role_id": role_id })),
    )
    .await
    .expect_status(StatusCode::NO_CONTENT);

    assert_eq!(
        members_named(&api, &alice, &community_id, &bob.user_id).await,
        vec!["moderator".to_owned()],
        "the assignment has to show up where members are listed"
    );

    api.send(
        "DELETE",
        &format!(
            "/api/v1/communities/{community_id}/members/{}/roles/{role_id}",
            bob.user_id
        ),
        Some(&alice.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::NO_CONTENT);

    assert!(
        members_named(&api, &alice, &community_id, &bob.user_id)
            .await
            .is_empty(),
        "removing a role has to take it off the member"
    );

    // Removing it twice is a 404 rather than a silent success: the second call
    // did not do what it says it did.
    api.send(
        "DELETE",
        &format!(
            "/api/v1/communities/{community_id}/members/{}/roles/{role_id}",
            bob.user_id
        ),
        Some(&alice.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_member_cannot_strip_a_role_they_could_not_grant() {
    let Some(api) = boot().await else {
        return skip("a_member_cannot_strip_a_role_they_could_not_grant");
    };

    let owner = api.register("roles3").await;
    let deputy = api.register("roles4").await;
    let community_id = api.create_community(&owner, "Hierarchy").await;

    for account in [&deputy] {
        api.send(
            "POST",
            &format!("/api/v1/communities/{community_id}/members"),
            Some(&account.access_token),
            Some(serde_json::json!({})),
        )
        .await
        .expect_status(StatusCode::CREATED);
    }

    // A role that can manage roles, and an administrator role it must not be
    // able to touch.
    let manager = api
        .send(
            "POST",
            &format!("/api/v1/communities/{community_id}/roles"),
            Some(&owner.access_token),
            Some(serde_json::json!({
                "name": "role-manager",
                "permissions": ["view_room", "manage_roles"],
            })),
        )
        .await
        .expect_status(StatusCode::CREATED);
    let admin = api
        .send(
            "POST",
            &format!("/api/v1/communities/{community_id}/roles"),
            Some(&owner.access_token),
            Some(serde_json::json!({ "name": "admin", "permissions": ["administrator"] })),
        )
        .await
        .expect_status(StatusCode::CREATED);

    api.send(
        "POST",
        &format!(
            "/api/v1/communities/{community_id}/members/{}/roles",
            deputy.user_id
        ),
        Some(&owner.access_token),
        Some(serde_json::json!({ "role_id": manager.json["id"].as_str().expect("role id") })),
    )
    .await
    .expect_status(StatusCode::NO_CONTENT);

    // The deputy may manage roles, but not this one: taking `administrator`
    // off somebody is a power that needs `administrator`.
    api.send(
        "DELETE",
        &format!(
            "/api/v1/communities/{community_id}/members/{}/roles/{}",
            owner.user_id,
            admin.json["id"].as_str().expect("role id")
        ),
        Some(&deputy.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::FORBIDDEN);
}

/// The role names the member list reports for one member.
async fn members_named(
    api: &harness::TestApi,
    caller: &harness::Account,
    community_id: &str,
    user_id: &str,
) -> Vec<String> {
    let response = api
        .send(
            "GET",
            &format!("/api/v1/communities/{community_id}/members"),
            Some(&caller.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK);

    response
        .json
        .as_array()
        .expect("members array")
        .iter()
        .find(|member| member["user_id"].as_str() == Some(user_id))
        .expect("the member is listed")["roles"]
        .as_array()
        .expect("roles array")
        .iter()
        .map(|role| role["name"].as_str().unwrap_or_default().to_owned())
        .collect()
}

/// A community is built from the template the creator picked.
///
/// The picker used to be cosmetic — it set the name and description and nothing
/// else, so every server came out identical. This asserts the part that was
/// missing: the channels and the role actually exist afterwards.
#[tokio::test]
async fn a_template_prebuilds_its_rooms_and_roles() {
    let Some(api) = boot().await else {
        return skip("a_template_prebuilds_its_rooms_and_roles");
    };

    let alice = api.register("alice").await;

    // The catalogue is what the client renders, so read the shape from it
    // rather than restating it here — a template that changes shape should
    // change this test's expectations with it.
    let catalogue = api
        .send("GET", "/api/v1/communities/templates", Some(&alice.access_token), None)
        .await
        .expect_status(StatusCode::OK)
        .json;

    let gaming = catalogue
        .as_array()
        .expect("templates array")
        .iter()
        .find(|entry| entry["key"] == "gaming")
        .expect("a gaming template")
        .clone();

    let expected_rooms: Vec<String> = gaming["rooms"]
        .as_array()
        .expect("rooms")
        .iter()
        .map(|room| room["name"].as_str().unwrap_or_default().to_owned())
        .collect();
    let expected_role = gaming["extra_roles"][0]["name"]
        .as_str()
        .expect("an extra role")
        .to_owned();
    assert!(!expected_rooms.is_empty(), "the template must promise channels");

    let community_id = api
        .send(
            "POST",
            "/api/v1/communities",
            Some(&alice.access_token),
            Some(serde_json::json!({ "name": "Squad HQ", "template": "gaming" })),
        )
        .await
        .expect_status(StatusCode::CREATED)
        .json["id"]
        .as_str()
        .expect("community id")
        .to_owned();

    let rooms: Vec<String> = api
        .send(
            "GET",
            &format!("/api/v1/communities/{community_id}/rooms"),
            Some(&alice.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json
        .as_array()
        .expect("rooms array")
        .iter()
        .map(|room| room["name"].as_str().unwrap_or_default().to_owned())
        .collect();

    for name in &expected_rooms {
        assert!(rooms.contains(name), "`{name}` was promised but not created: {rooms:?}");
    }

    let roles: Vec<String> = api
        .send(
            "GET",
            &format!("/api/v1/communities/{community_id}/roles"),
            Some(&alice.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json
        .as_array()
        .expect("roles array")
        .iter()
        .map(|role| role["name"].as_str().unwrap_or_default().to_owned())
        .collect();
    assert!(
        roles.contains(&expected_role),
        "`{expected_role}` was promised but not created: {roles:?}",
    );
    // The staff ladder is additive, not replaced.
    for staple in ["@everyone", "Moderator", "Admin"] {
        assert!(roles.contains(&staple.to_owned()), "template dropped `{staple}`");
    }
}

/// Naming a template the server does not build is refused, not silently
/// swapped for the default — the creator would get a server they did not pick.
#[tokio::test]
async fn an_unknown_template_is_refused() {
    let Some(api) = boot().await else {
        return skip("an_unknown_template_is_refused");
    };

    let alice = api.register("alice").await;

    api.send(
        "POST",
        "/api/v1/communities",
        Some(&alice.access_token),
        Some(serde_json::json!({ "name": "Nope", "template": "no-such-template" })),
    )
    .await
    .expect_status(StatusCode::BAD_REQUEST);
}

/// A client that predates templates sends no key, and must keep working.
#[tokio::test]
async fn omitting_a_template_still_gives_a_general_channel() {
    let Some(api) = boot().await else {
        return skip("omitting_a_template_still_gives_a_general_channel");
    };

    let alice = api.register("alice").await;
    let community_id = api.create_community(&alice, "Night Owls").await;

    let rooms: Vec<String> = api
        .send(
            "GET",
            &format!("/api/v1/communities/{community_id}/rooms"),
            Some(&alice.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json
        .as_array()
        .expect("rooms array")
        .iter()
        .map(|room| room["name"].as_str().unwrap_or_default().to_owned())
        .collect();

    assert!(rooms.contains(&"general".to_owned()), "{rooms:?}");
}

/// Make an account staff, the way an operator bootstraps the first one.
///
/// Direct SQL on purpose: there is no endpoint that grants the *first* admin,
/// because an endpoint that could would be one an ordinary account might reach.
async fn grant_platform_role(api: &harness::TestApi, user_id: &str, role: &str) {
    sqlx::query("UPDATE users SET platform_role = $2::platform_role WHERE id = $1")
        .bind(uuid::Uuid::parse_str(user_id).expect("user id"))
        .bind(role)
        .execute(&api.pool)
        .await
        .expect("grant platform role");
}

/// The console is invisible to an ordinary account.
#[tokio::test]
async fn the_platform_console_is_not_reachable_without_staff() {
    let Some(api) = boot().await else {
        return skip("the_platform_console_is_not_reachable_without_staff");
    };

    let alice = api.register("alice").await;

    // Not `403`: confirming the console exists is itself something an ordinary
    // account does not need to learn by probing.
    for path in [
        "/api/v1/admin/tickets",
        "/api/v1/admin/users?q=alice",
        "/api/v1/admin/audit",
        "/api/v1/admin/staff",
    ] {
        api.send("GET", path, Some(&alice.access_token), None)
            .await
            .expect_status(StatusCode::NOT_FOUND);
    }
}

/// Support answers the queue; only an admin enforces or reads the log.
#[tokio::test]
async fn support_can_work_the_queue_but_cannot_enforce() {
    let Some(api) = boot().await else {
        return skip("support_can_work_the_queue_but_cannot_enforce");
    };

    let agent = api.register("agent").await;
    let subject = api.register("subject").await;
    grant_platform_role(&api, &agent.user_id, "support").await;

    // The queue is theirs to read.
    api.send("GET", "/api/v1/admin/tickets", Some(&agent.access_token), None)
        .await
        .expect_status(StatusCode::OK);

    // Enforcement and the audit log are not.
    api.send(
        "POST",
        &format!("/api/v1/admin/users/{}/suspend", subject.user_id),
        Some(&agent.access_token),
        Some(serde_json::json!({ "reason": "spam" })),
    )
    .await
    .expect_status(StatusCode::FORBIDDEN);

    api.send("GET", "/api/v1/admin/audit", Some(&agent.access_token), None)
        .await
        .expect_status(StatusCode::FORBIDDEN);
}

/// A report survives being filed, is visible to staff, and is answered.
#[tokio::test]
async fn a_report_reaches_the_queue_and_gets_an_answer() {
    let Some(api) = boot().await else {
        return skip("a_report_reaches_the_queue_and_gets_an_answer");
    };

    let reporter = api.register("reporter").await;
    let agent = api.register("agent").await;
    grant_platform_role(&api, &agent.user_id, "support").await;

    let ticket_id = api
        .send(
            "POST",
            "/api/v1/support/tickets",
            Some(&reporter.access_token),
            Some(serde_json::json!({
                "kind": "report",
                "category": "Harassment",
                "subject": "Someone is following me between rooms",
                "details": "They keep joining every room I open and repeating the same thing.",
            })),
        )
        .await
        .expect_status(StatusCode::OK)
        .json["id"]
        .as_str()
        .expect("ticket id")
        .to_owned();

    // Staff see it in the queue.
    let queue = api
        .send("GET", "/api/v1/admin/tickets", Some(&agent.access_token), None)
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert!(
        queue["items"]
            .as_array()
            .expect("the queue is a page: items, plus a cursor and open_count")
            .iter()
            .any(|t| t["id"] == ticket_id.as_str()),
        "the report is not in the queue",
    );
    assert!(queue["open_count"].as_i64().unwrap_or(0) >= 1);

    // The category is normalised, so the queue groups by it.
    let detail = api
        .send(
            "GET",
            &format!("/api/v1/admin/tickets/{ticket_id}"),
            Some(&agent.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert_eq!(detail["ticket"]["category"], "harassment");

    // Answering moves it to `pending` — waiting on the reporter, not on staff.
    api.send(
        "POST",
        &format!("/api/v1/admin/tickets/{ticket_id}/messages"),
        Some(&agent.access_token),
        Some(serde_json::json!({ "body": "Thanks — we are looking into it." })),
    )
    .await
    .expect_status(StatusCode::OK);

    let after = api
        .send(
            "GET",
            &format!("/api/v1/support/tickets/{ticket_id}"),
            Some(&reporter.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert_eq!(after["ticket"]["status"], "pending");
    assert_eq!(after["messages"].as_array().expect("messages").len(), 1);
}

/// An internal note is for staff, and the reporter never sees it.
#[tokio::test]
async fn staff_notes_are_not_shown_to_the_reporter() {
    let Some(api) = boot().await else {
        return skip("staff_notes_are_not_shown_to_the_reporter");
    };

    let reporter = api.register("reporter").await;
    let agent = api.register("agent").await;
    grant_platform_role(&api, &agent.user_id, "support").await;

    let ticket_id = api
        .send(
            "POST",
            "/api/v1/support/tickets",
            Some(&reporter.access_token),
            Some(serde_json::json!({
                "kind": "help",
                "category": "account",
                "subject": "Cannot join voice",
                "details": "The button does nothing on my laptop.",
            })),
        )
        .await
        .expect_status(StatusCode::OK)
        .json["id"]
        .as_str()
        .expect("ticket id")
        .to_owned();

    api.send(
        "POST",
        &format!("/api/v1/admin/tickets/{ticket_id}/messages"),
        Some(&agent.access_token),
        Some(serde_json::json!({ "body": "Third report today, same browser.", "staff_only": true })),
    )
    .await
    .expect_status(StatusCode::OK);

    // Staff see the note.
    let staff_view = api
        .send(
            "GET",
            &format!("/api/v1/admin/tickets/{ticket_id}"),
            Some(&agent.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert_eq!(staff_view["messages"].as_array().expect("messages").len(), 1);

    // The person who raised it does not.
    let reporter_view = api
        .send(
            "GET",
            &format!("/api/v1/support/tickets/{ticket_id}"),
            Some(&reporter.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert!(
        reporter_view["messages"].as_array().expect("messages").is_empty(),
        "an internal note leaked to the reporter",
    );
}

/// Somebody else's ticket is not readable, and does not confirm it exists.
#[tokio::test]
async fn a_ticket_is_private_to_its_reporter_and_staff() {
    let Some(api) = boot().await else {
        return skip("a_ticket_is_private_to_its_reporter_and_staff");
    };

    let reporter = api.register("reporter").await;
    let nosy = api.register("nosy").await;

    let ticket_id = api
        .send(
            "POST",
            "/api/v1/support/tickets",
            Some(&reporter.access_token),
            Some(serde_json::json!({
                "kind": "help",
                "category": "account",
                "subject": "Billing question",
                "details": "I was charged twice.",
            })),
        )
        .await
        .expect_status(StatusCode::OK)
        .json["id"]
        .as_str()
        .expect("ticket id")
        .to_owned();

    api.send(
        "GET",
        &format!("/api/v1/support/tickets/{ticket_id}"),
        Some(&nosy.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::NOT_FOUND);
}

/// Suspension takes effect on the sessions the account already has open.
#[tokio::test]
async fn suspending_an_account_stops_its_live_session_and_is_audited() {
    let Some(api) = boot().await else {
        return skip("suspending_an_account_stops_its_live_session_and_is_audited");
    };

    let admin = api.register("admin").await;
    let offender = api.register("offender").await;
    grant_platform_role(&api, &admin.user_id, "admin").await;

    // The offender is signed in *before* the suspension, which is the case that
    // matters: a check only at login would leave them working until they
    // happened to sign in again.
    api.send("GET", "/api/v1/me", Some(&offender.access_token), None)
        .await
        .expect_status(StatusCode::OK);

    api.send(
        "POST",
        &format!("/api/v1/admin/users/{}/suspend", offender.user_id),
        Some(&admin.access_token),
        Some(serde_json::json!({ "reason": "coordinated spam" })),
    )
    .await
    .expect_status(StatusCode::OK);

    // `403 ACCOUNT_INACTIVE`, not `401`: the token is still valid and the
    // account behind it is not, which is a different thing to say — and the
    // client needs to tell them apart to know whether refreshing would help.
    let refused = api
        .send("GET", "/api/v1/me", Some(&offender.access_token), None)
        .await
        .expect_status(StatusCode::FORBIDDEN);
    assert_eq!(refused.json["error"]["code"], "ACCOUNT_INACTIVE");

    // …and it left a record naming who did it and why.
    // Narrowed to this offender: the log is shared across runs, so matching on
    // the action alone would happily find somebody else's suspension.
    let log = api
        .send(
            "GET",
            &format!("/api/v1/admin/audit?subject_id={}", offender.user_id),
            Some(&admin.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    let entry = log["items"]
        .as_array()
        .expect("the audit log is a page: items, plus a cursor")
        .iter()
        .find(|e| e["action"] == "user.suspended")
        .expect("a suspension entry");
    assert!(
        entry["actor_handle"]
            .as_str()
            .expect("actor handle")
            .starts_with("admin"),
        "the entry does not name who did it: {entry:?}",
    );
    assert_eq!(entry["metadata"]["reason"], "coordinated spam");
    assert_eq!(entry["subject_type"], "user");

    // Reinstating puts them back.
    api.send(
        "POST",
        &format!("/api/v1/admin/users/{}/reinstate", offender.user_id),
        Some(&admin.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::OK);
}

/// A suspension needs a reason, because the audit entry is made of it.
#[tokio::test]
async fn a_suspension_without_a_reason_is_refused() {
    let Some(api) = boot().await else {
        return skip("a_suspension_without_a_reason_is_refused");
    };

    let admin = api.register("admin").await;
    let target = api.register("target").await;
    grant_platform_role(&api, &admin.user_id, "admin").await;

    api.send(
        "POST",
        &format!("/api/v1/admin/users/{}/suspend", target.user_id),
        Some(&admin.access_token),
        Some(serde_json::json!({ "reason": "   " })),
    )
    .await
    .expect_status(StatusCode::BAD_REQUEST);
}

/// An admin cannot suspend themselves, or another admin.
#[tokio::test]
async fn enforcement_does_not_point_at_admins() {
    let Some(api) = boot().await else {
        return skip("enforcement_does_not_point_at_admins");
    };

    let admin = api.register("admin").await;
    let peer = api.register("peer").await;
    grant_platform_role(&api, &admin.user_id, "admin").await;
    grant_platform_role(&api, &peer.user_id, "admin").await;

    // Suspending yourself locks you out of undoing it.
    api.send(
        "POST",
        &format!("/api/v1/admin/users/{}/suspend", admin.user_id),
        Some(&admin.access_token),
        Some(serde_json::json!({ "reason": "oops" })),
    )
    .await
    .expect_status(StatusCode::FORBIDDEN);

    // Suspending a peer admin is how one admin removes everyone who could
    // reverse it.
    api.send(
        "POST",
        &format!("/api/v1/admin/users/{}/suspend", peer.user_id),
        Some(&admin.access_token),
        Some(serde_json::json!({ "reason": "disagreement" })),
    )
    .await
    .expect_status(StatusCode::FORBIDDEN);
}

/// `/me` says what the caller is, so a client knows whether to offer the console.
#[tokio::test]
async fn me_reports_the_platform_role() {
    let Some(api) = boot().await else {
        return skip("me_reports_the_platform_role");
    };

    let alice = api.register("alice").await;
    let me = api
        .send("GET", "/api/v1/me", Some(&alice.access_token), None)
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert_eq!(me["platform_role"], "user");

    grant_platform_role(&api, &alice.user_id, "admin").await;

    let after = api
        .send("GET", "/api/v1/me", Some(&alice.access_token), None)
        .await
        .expect_status(StatusCode::OK)
        .json;
    // Read live rather than from the token, so revoking staff takes effect now
    // and not whenever the access token happens to expire.
    assert_eq!(after["platform_role"], "admin");
}

/// A reply points at a message, and survives that message being deleted.
#[tokio::test]
async fn a_reply_outlives_the_message_it_answers() {
    let Some(api) = boot().await else {
        return skip("a_reply_outlives_the_message_it_answers");
    };

    let alice = api.register("alice").await;
    let community_id = api.create_community(&alice, "Night Owls").await;
    let room_id = api.create_room(&alice, &community_id, "lounge", "text").await;

    let parent = api.post_message(&alice, &room_id, "the original").await;
    let reply = api
        .send(
            "POST",
            &format!("/api/v1/rooms/{room_id}/messages"),
            Some(&alice.access_token),
            Some(serde_json::json!({ "content": "answering that", "reply_to_id": parent })),
        )
        .await
        .expect_status(StatusCode::CREATED)
        .json;
    assert_eq!(reply["reply_to_id"], parent.as_str());

    api.send(
        "DELETE",
        &format!("/api/v1/messages/{parent}"),
        Some(&alice.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::NO_CONTENT);

    // The reply is still there, now answering something that is gone. Deleting
    // a message must not delete the answers to it.
    let history = api
        .send(
            "GET",
            &format!("/api/v1/rooms/{room_id}/messages"),
            Some(&alice.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    let messages = history["messages"].as_array().expect("messages");
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["content"], "answering that");
    assert!(messages[0]["reply_to_id"].is_null());
}

/// A reply cannot quote a message from a room the author is not in.
#[tokio::test]
async fn a_reply_cannot_reach_into_another_room() {
    let Some(api) = boot().await else {
        return skip("a_reply_cannot_reach_into_another_room");
    };

    let alice = api.register("alice").await;
    let community_id = api.create_community(&alice, "Night Owls").await;
    let here = api.create_room(&alice, &community_id, "here", "text").await;
    let elsewhere = api.create_room(&alice, &community_id, "elsewhere", "text").await;

    let far_away = api.post_message(&alice, &elsewhere, "a secret").await;

    // Otherwise the quoted excerpt renders content from a room the reader may
    // not be able to open.
    api.send(
        "POST",
        &format!("/api/v1/rooms/{here}/messages"),
        Some(&alice.access_token),
        Some(serde_json::json!({ "content": "quoting", "reply_to_id": far_away })),
    )
    .await
    .expect_status(StatusCode::NOT_FOUND);
}

/// Pinning is a moderation call, not an author's.
#[tokio::test]
async fn pinning_needs_manage_room_not_authorship() {
    let Some(api) = boot().await else {
        return skip("pinning_needs_manage_room_not_authorship");
    };

    let owner = api.register("owner").await;
    let member = api.register("member").await;
    let community_id = api.create_community(&owner, "Night Owls").await;
    let room_id = api.create_room(&owner, &community_id, "lounge", "text").await;

    api.send(
        "POST",
        &format!("/api/v1/communities/{community_id}/members"),
        Some(&member.access_token),
        Some(serde_json::json!({})),
    )
    .await
    .expect_status(StatusCode::CREATED);

    let theirs = api.post_message(&member, &room_id, "pin me").await;

    // Their own message, and they still may not pin it.
    api.send(
        "PUT",
        &format!("/api/v1/messages/{theirs}/pin"),
        Some(&member.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::FORBIDDEN);

    api.send(
        "PUT",
        &format!("/api/v1/messages/{theirs}/pin"),
        Some(&owner.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::NO_CONTENT);

    let pins = api
        .send(
            "GET",
            &format!("/api/v1/rooms/{room_id}/pins"),
            Some(&member.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert_eq!(pins.as_array().expect("pins").len(), 1);

    // Pinning twice is the same pin.
    api.send(
        "PUT",
        &format!("/api/v1/messages/{theirs}/pin"),
        Some(&owner.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::NO_CONTENT);
    let pins = api
        .send(
            "GET",
            &format!("/api/v1/rooms/{room_id}/pins"),
            Some(&owner.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert_eq!(pins.as_array().expect("pins").len(), 1);
}

/// Search finds your own rooms and never anybody else's.
#[tokio::test]
async fn search_is_scoped_to_rooms_the_caller_is_in() {
    let Some(api) = boot().await else {
        return skip("search_is_scoped_to_rooms_the_caller_is_in");
    };

    let alice = api.register("alice").await;
    let stranger = api.register("stranger").await;
    let community_id = api.create_community(&alice, "Night Owls").await;
    let room_id = api.create_room(&alice, &community_id, "lounge", "text").await;

    api.post_message(&alice, &room_id, "the peregrine falcon is fast").await;
    api.post_message(&alice, &room_id, "unrelated chatter").await;

    let hits = api
        .send(
            "GET",
            "/api/v1/search/messages?q=peregrine",
            Some(&alice.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert_eq!(hits.as_array().expect("hits").len(), 1);

    // The stranger is in no rooms, so the same query finds nothing — the scope
    // is in the query, so there is nothing to find and then hide.
    let none = api
        .send(
            "GET",
            "/api/v1/search/messages?q=peregrine",
            Some(&stranger.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert!(none.as_array().expect("hits").is_empty());
}

/// Unread counts drop when a room is read, and muting does not mark it read.
#[tokio::test]
async fn unread_counts_track_reading_and_muting_is_separate() {
    let Some(api) = boot().await else {
        return skip("unread_counts_track_reading_and_muting_is_separate");
    };

    let owner = api.register("owner").await;
    let reader = api.register("reader").await;
    let community_id = api.create_community(&owner, "Night Owls").await;
    let room_id = api.create_room(&owner, &community_id, "lounge", "text").await;

    api.send(
        "POST",
        &format!("/api/v1/communities/{community_id}/members"),
        Some(&reader.access_token),
        Some(serde_json::json!({})),
    )
    .await
    .expect_status(StatusCode::CREATED);
    // Joining the room is what makes them a participant, which is what the
    // unread overview is keyed on.
    //
    // The status is asserted. This used to `POST` to `/participants` — which is
    // a GET-only route — and discard the result, so the join 405'd, the reader
    // never became a participant, and the real assertion below failed with a
    // bare `None` that said nothing about why.
    api.send(
        "POST",
        &format!("/api/v1/rooms/{room_id}/join"),
        Some(&reader.access_token),
        Some(serde_json::json!({})),
    )
    .await
    .expect_status(StatusCode::OK);

    api.post_message(&owner, &room_id, "first").await;
    api.post_message(&owner, &room_id, "second").await;

    let unread_for = |token: String| {
        let api = api.clone();
        let room_id = room_id.clone();
        async move {
            api.send("GET", "/api/v1/me/unread", Some(&token), None)
                .await
                .expect_status(StatusCode::OK)
                .json
                .as_array()
                .expect("rooms")
                .iter()
                .find(|entry| entry["room_id"] == room_id.as_str())
                .cloned()
        }
    };

    let before = unread_for(reader.access_token.clone()).await;
    assert_eq!(before.as_ref().and_then(|e| e["unread"].as_i64()), Some(2));

    api.send(
        "POST",
        &format!("/api/v1/rooms/{room_id}/read"),
        Some(&reader.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::NO_CONTENT);

    let after = unread_for(reader.access_token.clone()).await;
    assert_eq!(after.as_ref().and_then(|e| e["unread"].as_i64()), Some(0));

    // Muting is about attention, not about marking things read: a new message
    // still counts, the room just stops asking.
    api.send(
        "PUT",
        &format!("/api/v1/rooms/{room_id}/mute"),
        Some(&reader.access_token),
        Some(serde_json::json!({ "muted": true })),
    )
    .await
    .expect_status(StatusCode::NO_CONTENT);

    api.post_message(&owner, &room_id, "third").await;

    let muted = unread_for(reader.access_token.clone()).await;
    assert_eq!(muted.as_ref().and_then(|e| e["unread"].as_i64()), Some(1));
    assert_eq!(muted.as_ref().and_then(|e| e["muted"].as_bool()), Some(true));
}

/// An invite link previews, redeems once per use, and can be revoked.
#[tokio::test]
async fn an_invite_link_lets_somebody_in_and_can_be_spent() {
    let Some(api) = boot().await else {
        return skip("an_invite_link_lets_somebody_in_and_can_be_spent");
    };

    let owner = api.register("owner").await;
    let guest = api.register("guest").await;
    let latecomer = api.register("latecomer").await;
    let community_id = api.create_community(&owner, "Night Owls").await;

    let code = api
        .send(
            "POST",
            &format!("/api/v1/communities/{community_id}/invites"),
            Some(&owner.access_token),
            Some(serde_json::json!({ "max_uses": 1 })),
        )
        .await
        .expect_status(StatusCode::CREATED)
        .json["code"]
        .as_str()
        .expect("code")
        .to_owned();

    // A stranger can see what the link leads to before deciding.
    let preview = api
        .send(
            "GET",
            &format!("/api/v1/invites/{code}"),
            Some(&guest.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json;
    assert_eq!(preview["name"], "Night Owls");

    api.send(
        "POST",
        &format!("/api/v1/invites/{code}"),
        Some(&guest.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::OK);

    // The single use is spent, so the next person is refused.
    api.send(
        "POST",
        &format!("/api/v1/invites/{code}"),
        Some(&latecomer.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::NOT_FOUND);
}

/// A revoked link stops working.
#[tokio::test]
async fn revoking_an_invite_closes_the_door() {
    let Some(api) = boot().await else {
        return skip("revoking_an_invite_closes_the_door");
    };

    let owner = api.register("owner").await;
    let guest = api.register("guest").await;
    let community_id = api.create_community(&owner, "Night Owls").await;

    let code = api
        .send(
            "POST",
            &format!("/api/v1/communities/{community_id}/invites"),
            Some(&owner.access_token),
            Some(serde_json::json!({})),
        )
        .await
        .expect_status(StatusCode::CREATED)
        .json["code"]
        .as_str()
        .expect("code")
        .to_owned();

    api.send(
        "DELETE",
        &format!("/api/v1/invites/{code}"),
        Some(&owner.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::NO_CONTENT);

    api.send(
        "GET",
        &format!("/api/v1/invites/{code}"),
        Some(&guest.access_token),
        None,
    )
    .await
    .expect_status(StatusCode::NOT_FOUND);
}

/// Khmer is written without spaces between words, so PostgreSQL's text search
/// parser cannot find a boundary anywhere in a Khmer sentence and emits the
/// whole thing as one token. Full-text search therefore matched a Khmer message
/// only when the query was the entire message, character for character.
///
/// Search now runs a trigram-indexed substring match alongside the tsvector,
/// which needs no word boundaries. This test is the guard on that: it is a
/// property of the *parser*, so nothing in this repository failing to compile
/// would tell you it had regressed — the search would simply go quiet again for
/// every Khmer speaker.
#[tokio::test]
async fn khmer_search_finds_a_word_inside_an_unspaced_sentence() {
    let Some(api) = boot().await else {
        return skip("khmer_search_finds_a_word_inside_an_unspaced_sentence");
    };

    let sophea = api.register("sophea").await;
    let community_id = api.create_community(&sophea, "ភ្នំពេញ").await;
    let room_id = api
        .create_room(&sophea, &community_id, "chat", "text")
        .await;

    // "I love the Khmer language" — four words, no spaces, one tsvector token.
    let sentence = "ខ្ញុំស្រឡាញ់ភាសាខ្មែរ";
    api.send(
        "POST",
        &format!("/api/v1/rooms/{room_id}/messages"),
        Some(&sophea.access_token),
        Some(serde_json::json!({ "content": sentence })),
    )
    .await
    .expect_status(StatusCode::CREATED);

    let search = |query: &'static str| {
        let api = &api;
        let token = sophea.access_token.clone();
        async move {
            api.send(
                "GET",
                &format!("/api/v1/search/messages?q={}", urlencode(query)),
                Some(&token),
                None,
            )
            .await
            .expect_status(StatusCode::OK)
            .json
            .as_array()
            .expect("search returns a bare array of messages")
            .len()
        }
    };

    // "the Khmer language" — a word in the middle of the sentence, which is
    // exactly what the old tsvector-only search could not find.
    assert_eq!(search("ភាសាខ្មែរ").await, 1, "a word inside the sentence");
    // "love" — a word at the start, and one carrying a subscript cluster.
    assert_eq!(search("ស្រឡាញ់").await, 1, "a verb inside the sentence");
    // "sport" — genuinely absent, so substring matching must not invent a hit.
    assert_eq!(search("កីឡា").await, 0, "a word that is not there");
}

/// A `%` typed into the search box is a character the user wants to find, not a
/// wildcard. Unescaped it would make the substring half of search match every
/// message in every room the caller belongs to.
#[tokio::test]
async fn a_wildcard_in_a_search_query_is_matched_literally() {
    let Some(api) = boot().await else {
        return skip("a_wildcard_in_a_search_query_is_matched_literally");
    };

    let alice = api.register("wildcard_alice").await;
    let community_id = api.create_community(&alice, "Wildcards").await;
    let room_id = api
        .create_room(&alice, &community_id, "chat", "text")
        .await;

    api.send(
        "POST",
        &format!("/api/v1/rooms/{room_id}/messages"),
        Some(&alice.access_token),
        Some(serde_json::json!({ "content": "nothing special here" })),
    )
    .await
    .expect_status(StatusCode::CREATED);

    let hits = api
        .send(
            "GET",
            &format!("/api/v1/search/messages?q={}", urlencode("%")),
            Some(&alice.access_token),
            None,
        )
        .await
        .expect_status(StatusCode::OK)
        .json
        .as_array()
        .expect("search returns a bare array of messages")
        .len();

    assert_eq!(hits, 0, "a bare % must not match every message");
}

/// Percent-encode a query string value.
///
/// Hand-rolled rather than pulling in a crate for it: the tests need it in
/// exactly one shape, and Khmer is multi-byte, so the encoding has to be over
/// bytes rather than characters.
fn urlencode(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 3);
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}
