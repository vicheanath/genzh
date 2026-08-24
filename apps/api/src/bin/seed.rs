//! Database seeder for populating realistic users, communities, channels,
//! playground rooms, messages, reactions, and friendships.

use std::sync::Arc;

use genzh_auth::jwt::JwtService;
use genzh_auth::{AuthService, RegisterInput, UpdateProfile};
use genzh_community::{CommunityService, CreateCommunity};
use genzh_domain::room::{RoomType, RoomVisibility};
use genzh_domain::UserId;
use genzh_graph::SocialService;
use genzh_infrastructure::{PermissiveFloodGuard, PgConfig, connect};
use genzh_messaging::MessagingService;
use genzh_room::{CreateRoom, RoomService};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/social".to_string());

    println!("Connecting to database at: {}", database_url);
    let pg = PgConfig::new(&database_url);
    let pool = connect(&pg).await?;

    println!("Running database migrations...");
    sqlx::migrate!("../../migrations").run(&pool).await?;
    println!("✓ Migrations applied successfully.\n");

    let jwt = Arc::new(JwtService::new(
        b"dev-insecure-jwt-secret-at-least-32-bytes-long",
        "genzh.api",
        "genzh.web",
        86400,
        604800,
    ));

    let auth = AuthService::new(pool.clone(), jwt);
    let communities = CommunityService::new(pool.clone());
    let social = SocialService::new(pool.clone());
    let rooms = RoomService::new(pool.clone(), communities.clone(), social.clone());
    // Seeding writes a room's worth of history in a tight loop, which is
    // exactly what the flood guard exists to refuse — so it says so, rather
    // than reaching for a constructor that quietly leaves the guard out.
    let messaging = MessagingService::new(
        pool.clone(),
        rooms.clone(),
        PermissiveFloodGuard::new(),
    );

    println!("--- 1. Seeding Users ---");
    let test_users = [
        ("vichea", "vichea@genzh.social", "Vichea", "Building the future of anonymous social playgrounds.", Some("#5865f2")),
        ("alex_coder", "alex@genzh.social", "Alex Rivera", "Rustacean & Systems Engineer. Compiling the universe.", Some("#57f287")),
        ("sarah_pixel", "sarah@genzh.social", "Sarah Chen", "Game designer, pixel artist & late-night gamer.", Some("#eb459e")),
        ("neon_sam", "sam@genzh.social", "Samira Khan", "Music producer & DJ. Lo-Fi beats enthusiast.", Some("#fee75c")),
        ("kai_zen", "kai@genzh.social", "Kai Tanaka", "Philosophy, debates, and midnight coffee conversations.", Some("#06b6d4")),
        ("elena_art", "elena@genzh.social", "Elena Rostova", "Digital illustrator & 3D animator.", Some("#a855f7")),
        ("marcus_tech", "marcus@genzh.social", "Marcus Vance", "AI researcher & distributed systems tinkerer.", Some("#f97316")),
        ("chloe_beats", "chloe@genzh.social", "Chloe Miller", "Synthesizers and sound design.", Some("#3ba55d")),
        ("david_ai", "david@genzh.social", "David Kim", "Prompt engineering & machine learning explorer.", Some("#ed4245")),
    ];

    let mut user_ids: Vec<(String, UserId)> = Vec::new();

    for (handle, email, display_name, bio, color) in test_users {
        let user = match auth
            .register(
                RegisterInput {
                    handle: handle.to_string(),
                    email: email.to_string(),
                    password: "password123".to_string(),
                    display_name: Some(display_name.to_string()),
                },
                Default::default(),
            )
            .await
        {
            Ok(res) => {
                println!("  + Created user: @{} ({})", handle, display_name);
                res.0.user
            }
            Err(_) => {
                let existing = auth.find_by_identifier(handle).await?.expect("user exists");
                println!("  * Found existing user: @{} ({})", handle, display_name);
                existing
            }
        };

        // Update profile bio & accent color
        let _ = auth
            .update_profile(
                user.id,
                UpdateProfile {
                    bio: Some(bio),
                    accent_color: color,
                    ..Default::default()
                },
            )
            .await;

        user_ids.push((handle.to_string(), user.id));
    }

    let primary_user = user_ids[0].1;

    println!("\n--- 2. Seeding Friendships ---");
    for i in 1..user_ids.len() {
        let other_id = user_ids[i].1;
        let _ = social.request_friend(primary_user, other_id).await;
        if i % 2 == 1 {
            let _ = social.respond_to_request(other_id, primary_user, true).await;
            println!("  ✓ Friendship established: @vichea <-> @{}", user_ids[i].0);
        } else {
            println!("  ⌛ Pending friend request: @vichea -> @{}", user_ids[i].0);
        }
    }

    println!("\n--- 3. Seeding Communities & Channels ---");
    let community_configs = [
        (
            "Rustacean Hub",
            "The home of modern Rust programming, systems design, and performance.",
            vec![
                ("general", "General chat and hangout", RoomType::Text),
                ("rust-help", "Ask for help, lifetimes, and borrow checker tips", RoomType::Text),
                ("audio-lounge", "Voice lounge for pair programming", RoomType::Voice),
                ("demo-stage", "Live demos and talk presentations", RoomType::Stage),
            ],
        ),
        (
            "Pixel Realm",
            "Gaming, esports, speedrunning, and game design community.",
            vec![
                ("announcements", "News, tournaments, and events", RoomType::Text),
                ("lfg", "Looking for group / party finder", RoomType::Text),
                ("gaming-voice", "Voice chat while gaming", RoomType::Voice),
                ("game-night", "Party games and trivia", RoomType::Game),
            ],
        ),
        (
            "Midnight Lounge",
            "Late night conversations, chill vibes, lo-fi beats, and night owls.",
            vec![
                ("general", "Midnight conversations", RoomType::Text),
                ("chill-voice", "Open mic chill room", RoomType::Voice),
            ],
        ),
    ];

    for (comm_name, comm_desc, channels) in community_configs {
        let comm = match communities
            .create(
                primary_user,
                CreateCommunity {
                    name: comm_name.to_string(),
                    description: Some(comm_desc.to_string()),
                    icon_url: None,
                },
            )
            .await
        {
            Ok(c) => c,
            Err(_) => {
                let list = communities.list_for_user(primary_user).await?;
                list.into_iter().find(|c| c.name == comm_name).expect("community exists")
            }
        };

        println!("  + Community: {} ({})", comm.name, comm.id);

        // Add other users as members
        for (_, uid) in user_ids.iter().skip(1).take(5) {
            // Joining themselves, which is the same path the app uses — the
            // seed has no business reaching around the membership rules it is
            // meant to be producing realistic data for.
            let _ = communities.add_member(comm.id, *uid, *uid).await;
        }

        // Create channels
        for (ch_name, ch_topic, ch_type) in channels {
            let room = match rooms
                .create(
                    Some(comm.id),
                    primary_user,
                    CreateRoom {
                        community_id: Some(comm.id),
                        name: ch_name.to_string(),
                        topic: Some(ch_topic.to_string()),
                        category: Some("tech".to_string()),
                        room_type: ch_type,
                        visibility: Some(RoomVisibility::Public),
                        is_anonymous: false,
                        duration_minutes: None,
                        position: Some(0),
                        max_participants: None,
                        participant_ids: None,
                    },
                )
                .await
            {
                Ok(r) => r,
                Err(_) => continue,
            };

            println!("    - Channel: #{} ({:?})", room.name, room.room_type);

            // Seed sample messages
            let _ = messaging.post(room.id, primary_user, &format!("Welcome everyone to #{}!", room.name), false).await;
            if user_ids.len() > 1 {
                let msg = messaging.post(room.id, user_ids[1].1, "Hey! Happy to be here.", false).await?;
                let _ = messaging.react(msg.id, primary_user, "🔥").await;
                let _ = messaging.react(msg.id, user_ids[2].1, "👍").await;
            }
        }
    }

    println!("\n--- 4. Seeding Anonymous Playground Moments ---");
    let playground_moments = [
        (
            "Tabs vs Spaces: The Final Battle",
            "State your case and vote on code indentation. No mercy!",
            "debate",
            RoomType::Debate,
            true,
            8,
        ),
        (
            "Midnight Secrets & Tech Confessions",
            "Drop your anonymous confessions. What code did you push to prod at 2 AM?",
            "confession",
            RoomType::Confession,
            true,
            14,
        ),
        (
            "Who is still awake at 3 AM?",
            "Insomniacs, coders, and gamers hanging out anonymously.",
            "random",
            RoomType::Text,
            true,
            24,
        ),
        (
            "Late Night Lo-Fi Beats & Chill",
            "Jump in, mute your mic, listen to beats, and talk in chat.",
            "music",
            RoomType::Voice,
            true,
            19,
        ),
        (
            "Rust 2026: What are you building?",
            "Show off your side projects, crates, and backend tools.",
            "tech",
            RoomType::Text,
            false,
            12,
        ),
        (
            "Unpopular Gaming Opinions",
            "Which critically acclaimed game is secretly overrated?",
            "gaming",
            RoomType::Debate,
            true,
            16,
        ),
        (
            "Live Trivia & Word Quiz",
            "Fast-paced trivia party game.",
            "gaming",
            RoomType::Game,
            true,
            7,
        ),
    ];

    for (name, topic, category, room_type, is_anon, participant_count) in playground_moments {
        let room = rooms
            .create(
                None,
                primary_user,
                CreateRoom {
                    community_id: None,
                    name: name.to_string(),
                    topic: Some(topic.to_string()),
                    category: Some(category.to_string()),
                    room_type,
                    visibility: Some(RoomVisibility::Public),
                    is_anonymous: is_anon,
                    duration_minutes: Some(180),
                    position: None,
                    max_participants: Some(50),
                    participant_ids: None,
                },
            )
            .await?;

        // Seed participants and anonymous identities
        for i in 0..participant_count.min(user_ids.len()) {
            let uid = user_ids[i].1;
            // `join` picks the participant's role and mints the anonymous
            // identity when the room calls for one, so the seeded rooms end up
            // in the same state a real join would leave them in.
            let _ = rooms.join(room.id, uid).await;
        }

        println!("  ✨ Moment: {} [{} - {:?}] ({} participants)", room.name, category, room.room_type, participant_count);

        // Seed playful anonymous messages
        let anon_comments = [
            "Honestly, 4 spaces is the only civilized way to write code.",
            "Tabs allow each developer to customize their tab width. Change my mind!",
            "I once deleted production DB backup thinking it was staging... 😅",
            "This anonymous playground concept is so fun! No profile anxiety.",
            "Vibes in this room are immaculate.",
        ];

        for (idx, comment) in anon_comments.iter().enumerate() {
            let author = user_ids[idx % user_ids.len()].1;
            if let Ok(msg) = messaging.post(room.id, author, comment, is_anon).await {
                if idx % 2 == 0 {
                    let _ = messaging.react(msg.id, primary_user, "🔥").await;
                }
            }
        }
    }

    println!("\n==========================================================");
    println!("🎉 DATABASE SEED COMPLETED SUCCESSFULLY!");
    println!("==========================================================");
    println!("Test Accounts:");
    println!("  * Email: vichea@genzh.social    Password: password123");
    println!("  * Email: alex@genzh.social      Password: password123");
    println!("  * Email: sarah@genzh.social     Password: password123");
    println!("  * Email: sam@genzh.social       Password: password123");
    println!("  * Email: kai@genzh.social       Password: password123");
    println!("==========================================================");

    Ok(())
}
