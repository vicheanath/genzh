import { create } from 'zustand'

import type { Uuid } from './api'
import type { FriendTab } from '@/routes/FriendsRoute'
import type { SettingsTab } from '@/features/settings'

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

  // Device preferences.
  //
  // Persisted, because "which headset am I on" is not a per-session question.
  // An empty string means "whatever the system picks" — deliberately not null,
  // so a device that has since been unplugged degrades to the default rather
  // than failing an `exact` constraint.
  micDeviceId: string
  cameraDeviceId: string
  speakerDeviceId: string
  /** Playback gain for remote participants, 0–100. */
  outputVolume: number
  setDevicePreferences: (prefs: {
    micDeviceId?: string
    cameraDeviceId?: string
    speakerDeviceId?: string
    outputVolume?: number
  }) => void

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
const DEVICE_STORAGE_KEY = 'genzh_device_preferences'

interface DevicePreferences {
  micDeviceId: string
  cameraDeviceId: string
  speakerDeviceId: string
  outputVolume: number
}

const DEVICE_DEFAULTS: DevicePreferences = {
  micDeviceId: '',
  cameraDeviceId: '',
  speakerDeviceId: '',
  outputVolume: 100,
}

function getInitialDevices(): DevicePreferences {
  try {
    const raw = localStorage.getItem(DEVICE_STORAGE_KEY)
    if (raw) {
      return { ...DEVICE_DEFAULTS, ...(JSON.parse(raw) as Partial<DevicePreferences>) }
    }
  } catch {
    // Ignore storage parse errors
  }
  return DEVICE_DEFAULTS
}

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
const initialDevices = getInitialDevices()

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

  ...initialDevices,

  setDevicePreferences: (prefs) =>
    set((state) => {
      const next: DevicePreferences = {
        micDeviceId: prefs.micDeviceId ?? state.micDeviceId,
        cameraDeviceId: prefs.cameraDeviceId ?? state.cameraDeviceId,
        speakerDeviceId: prefs.speakerDeviceId ?? state.speakerDeviceId,
        outputVolume: prefs.outputVolume ?? state.outputVolume,
      }
      try {
        localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Storage access issues
      }
      return next
    }),

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
