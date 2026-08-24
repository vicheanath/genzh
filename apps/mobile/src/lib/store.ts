import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_ACCENT, type Uuid } from '@genzh/shared';

import type { SettingsTab } from '../features/settings/tabs';

export type FriendTab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

/**
 * The app's shared UI state.
 *
 * The web app keeps this in zustand. Rather than add a dependency to an Expo Go
 * bundle that has to stay installable, the same shape is backed by a ~40-line
 * external store below — the `useAppStore(selector)` call sites port across
 * unchanged.
 */
export interface AppState {
  // User settings screen
  userSettingsOpen: boolean;
  userSettingsTab: SettingsTab;
  openUserSettings: (tab?: SettingsTab) => void;
  closeUserSettings: () => void;

  // Add community sheet
  addCommunityOpen: boolean;
  openAddCommunity: () => void;
  closeAddCommunity: () => void;

  // Profile sheet
  profileUserId: Uuid | null;
  profileOpen: boolean;
  openProfile: (userId: Uuid) => void;
  closeProfile: () => void;

  // Friends screen tab
  friendsTab: FriendTab;
  setFriendsTab: (tab: FriendTab) => void;

  // Voice state
  isMuted: boolean;
  isDeafened: boolean;
  toggleMute: () => void;
  toggleDeafen: () => void;

  /** Playback gain for remote participants, 0–100. */
  outputVolume: number;
  /** Route audio through the loudspeaker rather than the earpiece. */
  speakerphone: boolean;
  setDevicePreferences: (prefs: {
    outputVolume?: number;
    speakerphone?: boolean;
  }) => void;

  // Anonymous persona
  anonymousAlias: string;
  anonymousAccent: string;
  anonymousAvatarSeed: string;
  isAnonymousByDefault: boolean;
  setAnonymousSettings: (settings: {
    alias?: string;
    accent?: string;
    avatarSeed?: string;
    isAnonymousByDefault?: boolean;
  }) => void;
}

const ANON_STORAGE_KEY = 'genzh_anonymous_settings';
const DEVICE_STORAGE_KEY = 'genzh_device_preferences';

/* ------------------------------------------------------------------ *
 * A minimal external store, in the shape zustand's `create` returns.
 * ------------------------------------------------------------------ */

type Listener = () => void;

function createStore<T>(init: (set: (partial: Partial<T>) => void) => T) {
  let state: T;
  const listeners = new Set<Listener>();

  const set = (partial: Partial<T>) => {
    state = { ...state, ...partial };
    listeners.forEach((listener) => listener());
  };

  state = init(set);

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  function useStore<S>(selector: (state: T) => S): S {
    return useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(state),
    );
  }

  useStore.getState = () => state;
  useStore.setState = set;
  useStore.subscribe = subscribe;

  return useStore;
}

export const useAppStore = createStore<AppState>((set) => ({
  userSettingsOpen: false,
  userSettingsTab: 'profile',
  openUserSettings: (tab: SettingsTab = 'profile') =>
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
  setFriendsTab: (tab: FriendTab) => set({ friendsTab: tab }),

  isMuted: false,
  isDeafened: false,
  toggleMute: () => set({ isMuted: !useAppStore.getState().isMuted }),
  toggleDeafen: () => set({ isDeafened: !useAppStore.getState().isDeafened }),

  outputVolume: 100,
  speakerphone: true,
  setDevicePreferences: (prefs) => {
    const current = useAppStore.getState();
    const next = {
      outputVolume: prefs.outputVolume ?? current.outputVolume,
      speakerphone: prefs.speakerphone ?? current.speakerphone,
    };
    set(next);
    void AsyncStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(next)).catch(() => {
      // A device without writable storage still gets the setting for this run.
    });
  },

  anonymousAlias: 'Anonymous Phantom',
  anonymousAccent: DEFAULT_ACCENT,
  anonymousAvatarSeed: '🎭',
  isAnonymousByDefault: false,

  setAnonymousSettings: (settings) => {
    const current = useAppStore.getState();
    const next = {
      anonymousAlias: settings.alias ?? current.anonymousAlias,
      anonymousAccent: settings.accent ?? current.anonymousAccent,
      anonymousAvatarSeed: settings.avatarSeed ?? current.anonymousAvatarSeed,
      isAnonymousByDefault:
        settings.isAnonymousByDefault ?? current.isAnonymousByDefault,
    };
    set(next);
    void AsyncStorage.setItem(
      ANON_STORAGE_KEY,
      JSON.stringify({
        alias: next.anonymousAlias,
        accent: next.anonymousAccent,
        avatarSeed: next.anonymousAvatarSeed,
        isAnonymousByDefault: next.isAnonymousByDefault,
      }),
    ).catch(() => {
      // As above.
    });
  },
}));

/**
 * Rehydrate the persisted slices.
 *
 * `AsyncStorage` has no synchronous read, so unlike the web store these cannot
 * be part of the initial state. The app calls this once at startup, before the
 * first screen renders, and the defaults stand in until it resolves.
 */
export async function hydrateAppStore(): Promise<void> {
  try {
    const [anonRaw, deviceRaw] = await Promise.all([
      AsyncStorage.getItem(ANON_STORAGE_KEY),
      AsyncStorage.getItem(DEVICE_STORAGE_KEY),
    ]);

    if (anonRaw) {
      const parsed = JSON.parse(anonRaw) as {
        alias?: string;
        accent?: string;
        avatarSeed?: string;
        isAnonymousByDefault?: boolean;
      };
      useAppStore.setState({
        anonymousAlias: parsed.alias ?? useAppStore.getState().anonymousAlias,
        anonymousAccent: parsed.accent ?? useAppStore.getState().anonymousAccent,
        anonymousAvatarSeed:
          parsed.avatarSeed ?? useAppStore.getState().anonymousAvatarSeed,
        isAnonymousByDefault:
          parsed.isAnonymousByDefault ?? useAppStore.getState().isAnonymousByDefault,
      });
    }

    if (deviceRaw) {
      const parsed = JSON.parse(deviceRaw) as {
        outputVolume?: number;
        speakerphone?: boolean;
      };
      useAppStore.setState({
        outputVolume: parsed.outputVolume ?? useAppStore.getState().outputVolume,
        speakerphone: parsed.speakerphone ?? useAppStore.getState().speakerphone,
      });
    }
  } catch {
    // Corrupt or unreadable storage: the defaults are already in place.
  }
}
