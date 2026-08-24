import React from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { hueFor } from '@genzh/shared';

import { PresenceDot, type Presence } from './PresenceDot';
import { type Palette } from '../theme/tokens';
import { useThemedStyles, useColors } from '../theme/ThemeContext';

export interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  speaking?: boolean;
  /**
   * Presence, as the four states the app actually distinguishes.
   *
   * `online` is also accepted as a bare boolean, which is what most callers
   * have to hand — the presence set answers "is this id in it", not which of
   * four states it is in.
   */
  presence?: Presence;
  online?: boolean;
  accent?: string | null;
  /** The surface the avatar sits on, so the presence dot punches out of it. */
  ringColor?: string;
  style?: ViewStyle;
}

export function Avatar({
  name,
  url,
  size = 42,
  speaking = false,
  presence,
  online,
  accent,
  ringColor: ringColorProp,
  style,
}: AvatarProps) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const ringColor = ringColorProp ?? c.bg;
  const hue = hueFor(name || 'User');
  const bgColor = accent || `hsl(${hue}, 60%, 35%)`;
  const initial = (name || '?').charAt(0).toUpperCase();

  const resolved: Presence | null =
    presence ?? (online === undefined ? null : online ? 'online' : 'offline');

  return (
    <View style={[styles.wrapper, { width: size, height: size }, style]}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
          speaking && styles.speakingRing,
        ]}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          />
        ) : (
          <View
            style={[
              styles.fallback,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
            ]}
          >
            <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
          </View>
        )}
      </View>

      {resolved && (
        <PresenceDot
          presence={resolved}
          size={Math.max(10, size * 0.28)}
          ringColor={ringColor}
          style={styles.presenceDot}
        />
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  circle: {
    overflow: 'hidden',
  },
  speakingRing: {
    borderWidth: 2.5,
    borderColor: c.accent,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  image: {
    backgroundColor: c.surfaceRaised,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  presenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
});
