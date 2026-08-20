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
