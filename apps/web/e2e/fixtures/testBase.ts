import { test as base, expect, type Page } from '@playwright/test'
import {
  mockAdminStats,
  mockAuthConfig,
  mockCommunities,
  mockCommunityDetail,
  mockCommunityInvites,
  mockCommunityMembers,
  mockDiscovery,
  mockFriendUser,
  mockMessages,
  mockRooms,
  mockTokenResponse,
  mockUser,
} from './mockData'

export async function setupMockApi(page: Page) {
  // Mock Auth config
  await page.route(/\/api\/v1\/auth\/config$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        app_env: 'test',
        allow_password_signup: true,
        oauth_providers: { google: true, discord: true },
        // GIF search off, so the composer's GIF button is absent in tests: the
        // picker would otherwise reach for Tenor through an unmocked route.
        features: { gifs: false },
      }),
    })
  })

  // Mock Login
  await page.route(/\/api\/v1\/auth\/login$/, async (route) => {
    const postData = route.request().postDataJSON()
    if (postData?.identifier === 'wrong' || postData?.password === 'wrong') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'Invalid handle or password' },
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTokenResponse),
    })
  })

  // Mock Register
  await page.route(/\/api\/v1\/auth\/register$/, async (route) => {
    const postData = route.request().postDataJSON()
    if (postData?.handle === 'taken') {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'CONFLICT', message: 'Handle is already taken' },
        }),
      })
      return
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(mockTokenResponse),
    })
  })

  // Mock Me overview (BFF)
  await page.route(/\/api\/v1\/me\/overview$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        me: mockUser,
        communities: mockCommunities,
        rooms: mockRooms,
        friends: [mockFriendUser.id],
        online_friends: [mockFriendUser.id],
        pending_requests_count: 0,
        unread_notifications: 0,
        config: {
          app_env: 'test',
          allow_password_signup: true,
          oauth_providers: { google: true, discord: true },
        },
      }),
    })
  })

  // Mock Social overview
  await page.route(/\/api\/v1\/me\/social$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        friends: [mockFriendUser.id],
        online_friends: [mockFriendUser.id],
        incoming_requests: [],
        outgoing_requests: [],
        blocked: [],
      }),
    })
  })

  // Mock Current User
  await page.route(/\/api\/v1\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockUser),
    })
  })

  // Mock Unread Counts
  await page.route(/\/api\/v1\/me\/unread$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // Mock User Profiles lookup
  await page.route(/\/api\/v1\/users\/[^/]+$/, async (route) => {
    const url = route.request().url()
    if (url.includes(mockFriendUser.id)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: mockFriendUser.id,
          handle: mockFriendUser.handle,
          display_name: mockFriendUser.profile.display_name,
          bio: mockFriendUser.profile.bio,
          avatar_url: null,
          avatar_effect: null,
          accent_color: '#ec4899',
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: mockUser.id,
        handle: mockUser.handle,
        display_name: mockUser.profile.display_name,
        bio: mockUser.profile.bio,
        avatar_url: null,
        avatar_effect: null,
        accent_color: '#3b82f6',
      }),
    })
  })

  // Mock Community Overview (BFF)
  await page.route(/\/api\/v1\/communities\/[^/]+\/overview$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        community: mockCommunities[0],
        rooms: mockRooms,
        members: mockCommunityMembers,
        roles: mockCommunityDetail.roles,
      }),
    })
  })

  // Mock Community Room session (BFF)
  await page.route(/\/api\/v1\/rooms\/[^/]+\/session$/, async (route) => {
    const url = route.request().url()
    const isVoice = url.includes(mockRooms[1].id)
    const room = isVoice ? mockRooms[1] : mockRooms[0]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        room,
        participants: [
          {
            room_id: room.id,
            user_id: mockUser.id,
            role: 'owner',
            is_muted: false,
            is_anonymous: false,
            joined_at: '2026-01-01T00:00:00Z',
            last_seen_at: '2026-01-01T00:00:00Z',
          },
        ],
        recent_messages: {
          messages: mockMessages,
          next_before: null,
        },
        media_session: isVoice
          ? {
              room_id: room.id,
              participant_id: 'part_1',
              media_url: 'wss://media.genzh.local',
              token: 'media_token_1',
              expires_at: '2026-08-25T15:00:00Z',
              ice_servers: [],
            }
          : null,
      }),
    })
  })

  // Mock Communities list & creation & templates
  await page.route(/\/api\/v1\/communities\/templates$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'gaming', name: 'Gaming Hub', description: 'Gaming servers and rooms', icon: 'gamepad' },
      ]),
    })
  })

  await page.route(/\/api\/v1\/communities$/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const newComm = {
        id: 'comm_new_' + Date.now(),
        name: body?.name || 'New Community',
        description: body?.description || '',
        icon_url: null,
        owner_id: mockUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        your_permissions: ['administrator'],
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newComm),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCommunities),
    })
  })

  // Mock Community Detail
  await page.route(new RegExp(`/api/v1/communities/${mockCommunities[0].id}$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCommunityDetail),
    })
  })

  // Mock Community Rooms
  await page.route(new RegExp(`/api/v1/communities/${mockCommunities[0].id}/rooms`), async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const newRoom = {
        id: 'room_new_' + Date.now(),
        community_id: mockCommunities[0].id,
        name: body?.name || 'new-channel',
        topic: body?.topic || null,
        category: 'general',
        room_type: body?.type || 'text',
        visibility: 'public',
        status: 'active',
        is_anonymous: false,
        position: 10,
        max_participants: null,
        current_participants: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        your_permissions: ['send_message', 'view_room'],
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newRoom),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockRooms),
    })
  })

  // Mock Community Members
  await page.route(new RegExp(`/api/v1/communities/${mockCommunities[0].id}/members.*`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCommunityMembers),
    })
  })

  // Mock Community Roles
  await page.route(new RegExp(`/api/v1/communities/${mockCommunities[0].id}/roles`), async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const newRole = {
        id: 'role_new_' + Date.now(),
        community_id: mockCommunities[0].id,
        name: body?.name || 'New Role',
        color: body?.color || '#3b82f6',
        position: 3,
        is_default: false,
        permissions: body?.permissions || [],
        created_at: new Date().toISOString(),
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newRole),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCommunityDetail.roles),
    })
  })

  // Mock Community Invites
  await page.route(new RegExp(`/api/v1/communities/${mockCommunities[0].id}/invites`), async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'newinvitecode123',
          community_id: mockCommunities[0].id,
          created_by: mockUser.id,
          uses: 0,
          max_uses: null,
          expires_at: null,
          revoked_at: null,
          created_at: new Date().toISOString(),
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCommunityInvites),
    })
  })

  // Mock Join Community
  await page.route(new RegExp(`/api/v1/communities/.+/members$`), async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockCommunityMembers[0]),
      })
      return
    }
  })

  // Mock Invite preview & redeem
  await page.route(/\/api\/v1\/invites\/.+/, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ community_id: mockCommunities[0].id }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'devhangout',
        community_id: mockCommunities[0].id,
        name: mockCommunities[0].name,
        description: mockCommunities[0].description,
        icon_url: null,
        member_count: mockCommunities[0].member_count,
        expires_at: null,
        max_uses: 100,
        uses: 5,
      }),
    })
  })

  // Mock Discovery & Recommendations
  await page.route(/\/api\/v1\/discovery\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        trending: [],
        live_now: [],
        categories: ['tech', 'gaming', 'music', 'art'],
        rooms: mockRooms,
      }),
    })
  })
  await page.route(/\/api\/v1\/recommendations\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // Mock My Rooms (DMs & private rooms)
  await page.route(/\/api\/v1\/rooms\/mine$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // Mock Room Detail
  // The negative lookahead keeps this from shadowing `/rooms/mine` above —
  // Playwright checks routes most-recently-registered first, so without it
  // every request for the mine list would match this handler instead and get
  // back a single room object rather than an array.
  await page.route(/\/api\/v1\/rooms\/(?!mine$)[^/]+$/, async (route) => {
    const url = route.request().url()
    const isVoice = url.includes(mockRooms[1].id)
    const room = isVoice ? mockRooms[1] : mockRooms[0]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(room),
    })
  })

  // Mock Room Join
  await page.route(/\/api\/v1\/rooms\/[^/]+\/join$/, async (route) => {
    const url = route.request().url()
    const isVoice = url.includes(mockRooms[1].id)
    const room = isVoice ? mockRooms[1] : mockRooms[0]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(room),
    })
  })

  // Mock Room Messages
  // The GET history call always carries a `?limit=...` query string, so the
  // pattern can't anchor `messages$` — that anchor let this handler silently
  // never match a single GET request in the whole suite.
  await page.route(/\/api\/v1\/rooms\/[^/]+\/messages(\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const newMsg = {
        id: 'msg_new_' + Date.now(),
        room_id: mockRooms[0].id,
        author_id: mockUser.id,
        content: body?.content || '',
        created_at: new Date().toISOString(),
        edited_at: null,
        reactions: [],
        pinned: false,
        reply_to_id: body?.reply_to_id ?? null,
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newMsg),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages: mockMessages,
        next_before: null,
      }),
    })
  })

  // Mock Pins & Search
  // Every room the chat screen opens asks what glyphs it may draw. Mocked as
  // empty rather than left unrouted, so a test failure is about the test and
  // not about a request that quietly went to the real network.
  await page.route(/\/api\/v1\/rooms\/[^/]+\/emojis$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  await page.route(/\/api\/v1\/rooms\/[^/]+\/pins$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
  await page.route(/\/api\/v1\/rooms\/[^/]+\/search/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ messages: [], total: 0 }),
    })
  })

  // Mock Friends endpoints
  await page.route(/\/api\/v1\/friends\/pending$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
  await page.route(/\/api\/v1\/friends\/sent$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
  await page.route(/\/api\/v1\/friends\/blocked$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
  await page.route(/\/api\/v1\/friends\/requests$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })
  await page.route(/\/api\/v1\/friends$/, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([mockFriendUser.id]),
    })
  })

  // Mock Notifications
  await page.route(/\/api\/v1\/notifications.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        notifications: [],
        unread: 0,
        next_before: undefined,
      }),
    })
  })

  // Mock Admin Console APIs
  await page.route(/\/api\/v1\/admin\/stats$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockAdminStats),
    })
  })
  await page.route(/\/api\/v1\/admin\/queue.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
  await page.route(/\/api\/v1\/admin\/users.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([mockUser, mockFriendUser]),
    })
  })
  await page.route(/\/api\/v1\/admin\/communities.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCommunities),
    })
  })
  await page.route(/\/api\/v1\/admin\/live.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
  await page.route(/\/api\/v1\/admin\/broadcasts.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
  await page.route(/\/api\/v1\/admin\/features.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { key: 'voice_v2', enabled: true, description: 'Next-gen audio engine' },
        { key: 'screen_share', enabled: true, description: 'Screen sharing capabilities' },
      ]),
    })
  })
  await page.route(/\/api\/v1\/admin\/automod.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'rule_1', name: 'Anti-Spam Filter', enabled: true, action: 'block' },
      ]),
    })
  })
  await page.route(/\/api\/v1\/admin\/security.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ip_bans: [], blocked_domains: [] }),
    })
  })
  await page.route(/\/api\/v1\/admin\/health.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'healthy',
        uptime_seconds: 86400,
        memory_usage_mb: 256,
        active_connections: 42,
      }),
    })
  })
  await page.route(/\/api\/v1\/admin\/recommendations.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ coverage: '100%', total_recommended: 50 }),
    })
  })
  await page.route(/\/api\/v1\/admin\/audit.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'audit_1',
          action: 'user.login',
          actor_id: mockUser.id,
          created_at: '2026-08-25T12:00:00Z',
          target_type: 'user',
          target_id: mockUser.id,
        },
      ]),
    })
  })
}

export async function loginAsTestUser(page: Page) {
  await page.addInitScript(() => {
    const session = {
      accessToken: 'mock_access_token_jwt_string',
      refreshToken: 'mock_refresh_token_string',
      expiresAt: Date.now() + 3600 * 1000,
    }
    localStorage.setItem('genzh.session', JSON.stringify(session))
  })
}

export const test = base.extend<{
  authenticatedPage: Page
}>({
  authenticatedPage: async ({ page }, use) => {
    await setupMockApi(page)
    await loginAsTestUser(page)
    await use(page)
  },
})

export { expect }
