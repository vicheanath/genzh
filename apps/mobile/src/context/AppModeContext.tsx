import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'genzh_app_mode';

/**
 * Which half of the product you are in.
 *
 * The two are not features of one app that happen to sit in different tabs.
 * They are opposite promises, and the shell says which one you are being made:
 *
 * - `playground` — rooms you drop into and leave. Nothing here is yours, none
 *   of it is still around tomorrow, and the whole surface is a column you swipe
 *   until something looks fun.
 * - `servers` — communities you belong to. Channels, roles, history, people who
 *   are still there next week.
 *
 * Kept out of navigation state on purpose: the mode outlives any one screen
 * and survives a relaunch, which a navigator's own state does not.
 */
export type AppMode = 'playground' | 'servers';

/** Where a first-time launch lands. */
const DEFAULT_MODE: AppMode = 'playground';

interface AppModeValue {
  mode: AppMode;
  /** The other one, for a control that offers the switch. */
  other: AppMode;
  setMode: (next: AppMode) => void;
  toggleMode: () => void;
  /**
   * Whether the stored choice has been read yet.
   *
   * The shell waits on this rather than painting: launching into the feed and
   * then jumping to the community list a frame later is worse than a beat of
   * nothing.
   */
  ready: boolean;
}

const AppModeContext = createContext<AppModeValue | null>(null);

function isMode(value: unknown): value is AppMode {
  return value === 'playground' || value === 'servers';
}

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(DEFAULT_MODE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && isMode(saved)) setModeState(saved);
      } catch {
        // An unreadable preference is not worth failing a launch over — the
        // default mode is a perfectly good place to land.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // The switch still applies this session; only the memory of it is lost.
    });
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((current) => {
      const next: AppMode = current === 'playground' ? 'servers' : 'playground';
      void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<AppModeValue>(
    () => ({
      mode,
      other: mode === 'playground' ? 'servers' : 'playground',
      setMode,
      toggleMode,
      ready,
    }),
    [mode, setMode, toggleMode, ready],
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode(): AppModeValue {
  const ctx = useContext(AppModeContext);
  if (!ctx) throw new Error('useAppMode must be used inside an AppModeProvider');
  return ctx;
}

/** What each mode is called and promises, for the switch control. */
export const MODE_COPY: Record<AppMode, { label: string; tagline: string }> = {
  playground: { label: 'Playground', tagline: 'Rooms you leave' },
  servers: { label: 'Servers', tagline: 'Places you stay' },
};
