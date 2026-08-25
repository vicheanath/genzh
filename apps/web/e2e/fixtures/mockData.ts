export const mockUser = {
  id: 'usr_11111111-1111-1111-1111-111111111111',
  handle: 'testuser',
  email: 'testuser@genzh.app',
  platform_role: 'admin',
  profile: {
    user_id: 'usr_11111111-1111-1111-1111-111111111111',
    display_name: 'Test User',
    bio: 'Just hanging out on GenZH',
    avatar_url: null,
    avatar_effect: null,
    accent_color: '#3b82f6',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
}

export const mockFriendUser = {
  id: 'usr_22222222-2222-2222-2222-222222222222',
  handle: 'alice_friend',
  email: 'alice@genzh.app',
  platform_role: 'user',
  display_name: 'Alice Wonder',
  profile: {
    user_id: 'usr_22222222-2222-2222-2222-222222222222',
    display_name: 'Alice Wonder',
    bio: 'GenZH enthusiast',
    avatar_url: null,
    avatar_effect: null,
    accent_color: '#ec4899',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
}

export const mockAuthConfig = {
  allow_password_signup: true,
  oauth_providers: ['google', 'discord'],
}

export const mockTokenResponse = {
  access_token: 'mock_access_token_jwt_string',
  refresh_token: 'mock_refresh_token_string',
  expires_in: 3600,
  token_type: 'Bearer',
  user: mockUser,
}

export const mockCommunities = [
  {
    id: 'comm_11111111-1111-1111-1111-111111111111',
    name: 'Developers Hangout',
    description: 'A cozy place for coders and creators',
    icon_url: null,
    banner_url: null,
    owner_id: mockUser.id,
    is_public: true,
    member_count: 42,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    your_permissions: ['administrator', 'manage_community', 'manage_roles', 'manage_members', 'manage_room', 'send_message'],
  },
  {
    id: 'comm_22222222-2222-2222-2222-222222222222',
    name: 'Gaming Universe',
    description: 'Games, banter, and late night streams',
    icon_url: null,
    banner_url: null,
    owner_id: 'usr_33333333-3333-3333-3333-333333333333',
    is_public: true,
    member_count: 128,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    your_permissions: ['send_message', 'view_room'],
  },
]

export const mockCommunityDetail = {
  ...mockCommunities[0],
  roles: [
    {
      id: 'role_admin_1',
      name: 'Admin',
      color: '#ef4444',
      position: 1,
      permissions: ['administrator'],
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'role_member_1',
      name: 'Member',
      color: '#3b82f6',
      position: 2,
      permissions: ['send_message'],
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
}

export const mockRooms = [
  {
    id: 'room_text_11111111-1111-1111-1111-111111111111',
    community_id: mockCommunities[0].id,
    name: 'general',
    topic: 'General chatter and discussions',
    type: 'text',
    position: 0,
    category: null,
    is_private: false,
    created_at: '2026-01-01T00:00:00Z',
    your_permissions: ['send_message', 'view_room', 'manage_room'],
  },
  {
    id: 'room_voice_22222222-2222-2222-2222-222222222222',
    community_id: mockCommunities[0].id,
    name: 'Lounge Voice',
    topic: 'Drop in and speak',
    type: 'voice',
    position: 1,
    category: null,
    is_private: false,
    created_at: '2026-01-01T00:00:00Z',
    your_permissions: ['speak', 'use_video', 'view_room'],
  },
]

export const mockMessages = [
  {
    id: 'msg_11111111-1111-1111-1111-111111111111',
    room_id: mockRooms[0].id,
    author_id: mockUser.id,
    author: {
      id: mockUser.id,
      handle: mockUser.handle,
      display_name: mockUser.profile.display_name,
      avatar_url: null,
    },
    content: 'Hello everyone! Welcome to the Developers Hangout.',
    created_at: '2026-08-25T10:00:00Z',
    updated_at: null,
    reactions: [
      { emoji: '👋', count: 3, user_ids: [mockUser.id] },
    ],
    pinned: false,
    reply_to: null,
  },
  {
    id: 'msg_22222222-2222-2222-2222-222222222222',
    room_id: mockRooms[0].id,
    author_id: mockFriendUser.id,
    author: {
      id: mockFriendUser.id,
      handle: mockFriendUser.handle,
      display_name: mockFriendUser.profile.display_name,
      avatar_url: null,
    },
    content: 'Glad to be here! Let us build something cool.',
    created_at: '2026-08-25T10:05:00Z',
    updated_at: null,
    reactions: [],
    pinned: false,
    reply_to: null,
  },
]

export const mockCommunityMembers = [
  {
    user_id: mockUser.id,
    user: mockUser,
    role: 'owner',
    roles: ['role_admin_1'],
    nickname: null,
    joined_at: '2026-01-01T00:00:00Z',
  },
  {
    user_id: mockFriendUser.id,
    user: mockFriendUser,
    role: 'member',
    roles: ['role_member_1'],
    nickname: null,
    joined_at: '2026-01-02T00:00:00Z',
  },
]

export const mockCommunityInvites = [
  {
    code: 'devhangout',
    community_id: mockCommunities[0].id,
    inviter_id: mockUser.id,
    uses: 5,
    max_uses: 100,
    expires_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
]

export const mockAdminStats = {
  total_users: 1420,
  active_users: 850,
  suspended_users: 12,
  staff_users: 8,
  open_tickets: 3,
  resolved_tickets: 194,
  total_communities: 65,
  total_rooms: 310,
  total_audit_entries: 4120,
}

export const mockDiscovery = {
  categories: ['tech', 'gaming', 'music', 'art'],
  rooms: [
    {
      ...mockRooms[0],
      community_name: 'Developers Hangout',
      member_count: 42,
    },
  ],
}
