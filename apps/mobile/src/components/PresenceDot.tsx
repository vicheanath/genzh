import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Radius, type Palette } from '../theme/tokens';
import { useThemedStyles, useColors } from '../theme/ThemeContext';

export type Presence = 'online' | 'idle' | 'busy' | 'offline';

const makeCOLORS = (c: Palette): Record<Presence, string> =>
  ({
  online: c.online,
  idle: c.idle,
  busy: c.dnd,
  offline: c.offline,
});

const LABELS: Record<Presence, string> = {
  online: 'Online',
  idle: 'Idle',
  busy: 'Do not disturb',
  offline: 'Offline',
};

/**
 * The status dot on an avatar.
 *
 * Lightweight, high-performance static presence indicator that does not churn the JS/UI threads.
 */
export function PresenceDot({
  presence,
  size = 10,
  /** The colour the dot is punched out of — the surface behind the avatar. */
  ringColor: ringColorProp,
  style,
}: {
  presence: Presence;
  size?: number;
  ringColor?: string;
  style?: ViewStyle;
}) {
  const COLORS = useThemedStyles(makeCOLORS);
  const c = useColors();
  const ringColor = ringColorProp ?? c.bg;
  return (
    <View
      accessibilityLabel={LABELS[presence]}
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: Radius.full,
          backgroundColor: COLORS[presence],
          borderColor: ringColor,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    borderWidth: 2,
  },
});
