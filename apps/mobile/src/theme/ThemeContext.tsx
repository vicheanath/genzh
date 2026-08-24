import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  Elevations,
  Palettes,
  type ElevationSet,
  type Palette,
  type ThemeName,
} from './tokens';

/**
 * What the user picked, which is not the same thing as what is on screen.
 *
 * `system` is a third state rather than a resolved value, exactly as it is in
 * the web's `useTheme`. Storing the *resolved* scheme instead would freeze the
 * app to whatever the OS happened to be at the moment of the tap, and it would
 * stop following the OS afterwards — which is the whole point of the option.
 */
export type ThemePreference = ThemeName | 'system';

const STORAGE_KEY = 'genzh_theme';

interface ThemeValue {
  /** What the user chose: 'light' | 'dark' | 'system'. */
  preference: ThemePreference;
  /** What is actually on screen right now — never 'system'. */
  scheme: ThemeName;
  colors: Palette;
  elevation: ElevationSet;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // `useColorScheme` re-renders on its own when the OS flips, so a 'system'
  // preference follows the OS live rather than only at launch.
  const systemScheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (saved === 'light' || saved === 'dark' || saved === 'system')) {
          setPreferenceState(saved);
        }
      } catch {
        // A theme is not worth failing a launch over — stay on 'system'.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Ignore storage write errors; the choice still applies this session.
    });
  }, []);

  // The app was dark-only before this existed, so an unknown OS preference
  // resolves to dark rather than to light.
  const scheme: ThemeName =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo<ThemeValue>(
    () => ({
      preference,
      scheme,
      colors: Palettes[scheme],
      elevation: Elevations[scheme],
      setPreference,
    }),
    [preference, scheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}

/**
 * A per-theme stylesheet.
 *
 * `StyleSheet.create` at module scope reads its colours once, at import — which
 * is why a dark-only app can get away with it and a themed one cannot. Moving
 * the call into the component fixes the colours but pays for a full
 * `StyleSheet.create` on every render of every list row, which is a lot of
 * garbage on a screen like the roster.
 *
 * So the factory stays at module scope (one stable identity per file) and the
 * result is cached per theme against it. Two calls total for the life of the
 * process — one the first time each theme is seen — no matter how many
 * components share the sheet or how often they re-render.
 *
 * Usage:
 *
 *     const makeStyles = (c: Palette) =>
 *       StyleSheet.create({ card: { backgroundColor: c.surface } });
 *
 *     function Card() {
 *       const styles = useThemedStyles(makeStyles);
 *     }
 *
 * The factory must not close over props or state — it is called once per theme
 * and the result is shared. Anything that varies per instance belongs in an
 * inline style array next to the sheet, which is what the call sites already
 * do for things like a participant's accent colour.
 */
type StyleFactory<T> = (colors: Palette, elevation: ElevationSet) => T;

const styleCache = new WeakMap<StyleFactory<unknown>, Partial<Record<ThemeName, unknown>>>();

export function useThemedStyles<T>(factory: StyleFactory<T>): T {
  const { scheme, colors, elevation } = useTheme();

  let perTheme = styleCache.get(factory as StyleFactory<unknown>);
  if (!perTheme) {
    perTheme = {};
    styleCache.set(factory as StyleFactory<unknown>, perTheme);
  }

  if (perTheme[scheme] === undefined) {
    perTheme[scheme] = factory(colors, elevation);
  }

  return perTheme[scheme] as T;
}

/** The palette on its own, for components that colour an icon or an SVG. */
export function useColors(): Palette {
  return useTheme().colors;
}
