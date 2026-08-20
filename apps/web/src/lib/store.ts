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

  // Anonymous Persona Settings
  anonymousAlias: string
  anonymousAccent: string
  anonymousAvatarSeed: string
  isAnonymousByDefault: boolean
  setAnonymousSettings: (settings: {
    alias?: string
    accent?: string
    avatarSeed?: string
    isAnonymousByDefault?: boolean
  }) => void
}

const ANON_STORAGE_KEY = 'genzh_anonymous_settings'

function getInitialAnonSettings() {
  try {
    const raw = localStorage.getItem(ANON_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw) as {
        alias?: string
        accent?: string
        avatarSeed?: string
        isAnonymousByDefault?: boolean
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return null
}

const initialAnon = getInitialAnonSettings()

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

  anonymousAlias: initialAnon?.alias ?? 'Anonymous Phantom',
  anonymousAccent: initialAnon?.accent ?? '#a855f7',
  anonymousAvatarSeed: initialAnon?.avatarSeed ?? '🎭',
  isAnonymousByDefault: initialAnon?.isAnonymousByDefault ?? false,

  setAnonymousSettings: (settings) =>
    set((state) => {
      const next = {
        alias: settings.alias !== undefined ? settings.alias : state.anonymousAlias,
        accent: settings.accent !== undefined ? settings.accent : state.anonymousAccent,
        avatarSeed:
          settings.avatarSeed !== undefined
            ? settings.avatarSeed
            : state.anonymousAvatarSeed,
        isAnonymousByDefault:
          settings.isAnonymousByDefault !== undefined
            ? settings.isAnonymousByDefault
            : state.isAnonymousByDefault,
      }
      try {
        localStorage.setItem(ANON_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Storage access issues
      }
      return {
        anonymousAlias: next.alias,
        anonymousAccent: next.accent,
        anonymousAvatarSeed: next.avatarSeed,
        isAnonymousByDefault: next.isAnonymousByDefault,
      }
    }),
}))
