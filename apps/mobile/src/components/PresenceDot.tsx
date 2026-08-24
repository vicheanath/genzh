import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Colors, Radius } from '../theme/tokens';

export type Presence = 'online' | 'idle' | 'busy' | 'offline';

const COLORS: Record<Presence, string> = {
  online: Colors.online,
  idle: Colors.idle,
  busy: Colors.dnd,
  offline: Colors.offline,
};

const LABELS: Record<Presence, string> = {
  online: 'Online',
  idle: 'Idle',
  busy: 'Do not disturb',
  offline: 'Offline',
};

/**
 * The status dot on an avatar.
 *
 * Sized and positioned by whatever wraps it, not by itself, so the same dot
 * works on a 28px sidebar avatar and a 64px profile one.
 */
export function PresenceDot({
  presence,
  size = 10,
  /** The colour the dot is punched out of — the surface behind the avatar. */
  ringColor = Colors.bg,
  style,
}: {
  presence: Presence;
  size?: number;
  ringColor?: string;
  style?: ViewStyle;
}) {
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
