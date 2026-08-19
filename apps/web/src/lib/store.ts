import { create } from 'zustand'

import type { Uuid } from './api'
import type { FriendTab } from '@/routes/FriendsRoute'
import type { SettingsTab } from '@/routes/UserSettingsModal'

interface AppState {
  // User settings modal
  userSettingsOpen: boolean
  userSettingsTab: SettingsTab
  openUserSettings: (tab?: SettingsTab) => void
  closeUserSettings: () => void

  // Add community modal
  addCommunityOpen: boolean
  openAddCommunity: () => void
  closeAddCommunity: () => void

  // Profile modal / card
  profileUserId: Uuid | null
  profileOpen: boolean
  openProfile: (userId: Uuid) => void
  closeProfile: () => void

  // Friends route tab
  friendsTab: FriendTab
  setFriendsTab: (tab: FriendTab) => void

  // Voice state
  isMuted: boolean
  isDeafened: boolean
  toggleMute: () => void
  toggleDeafen: () => void
}

export const useAppStore = create<AppState>((set) => ({
  userSettingsOpen: false,
  userSettingsTab: 'profile',
  openUserSettings: (tab = 'profile') =>
    set({ userSettingsOpen: true, userSettingsTab: tab }),
  closeUserSettings: () => set({ userSettingsOpen: false }),

  addCommunityOpen: false,
  openAddCommunity: () => set({ addCommunityOpen: true }),
  closeAddCommunity: () => set({ addCommunityOpen: false }),

  profileUserId: null,
  profileOpen: false,
  openProfile: (userId: Uuid) => set({ profileUserId: userId, profileOpen: true }),
  closeProfile: () => set({ profileOpen: false, profileUserId: null }),

  friendsTab: 'all',
  setFriendsTab: (tab) => set({ friendsTab: tab }),

  isMuted: false,
  isDeafened: false,
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleDeafen: () => set((state) => ({ isDeafened: !state.isDeafened })),
}))
