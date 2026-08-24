import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { SPRING_PANEL } from '../theme/motion';
import { Colors, Radius, Spacing } from '../theme/tokens';

export interface ProgressProps {
  /** 0–100. */
  value: number;
  label?: string;
  /** Shows the percentage on the trailing side of the label row. */
  showValue?: boolean;
  /** `accent` for the app's own work, `live` for something happening in a room. */
  tone?: 'accent' | 'live';
  size?: 'sm' | 'md';
  /** Paint the fill in an arbitrary colour — a poll option's own hue. */
  color?: string;
  style?: ViewStyle;
}

/**
 * A determinate bar — a poll result, an upload, a quota.
 *
 * The fill springs to each new value. That matters most where this is used
 * hardest: a poll bar that jumps has no way to show that a vote just landed,
 * while one that travels makes the change the thing you notice.
 */
export function Progress({
  value,
  label,
  showValue,
  tone = 'accent',
  size = 'md',
  color,
  style,
}: ProgressProps) {
  const fill = Math.min(100, Math.max(0, value));
  const progress = useSharedValue(fill);

  useEffect(() => {
    progress.value = withSpring(fill, SPRING_PANEL);
  }, [fill, progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return (
    <View style={[styles.root, style]}>
      {(label || showValue) && (
        <View style={styles.header}>
          {label ? (
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          ) : (
            <View style={styles.spacer} />
          )}
          {showValue ? <Text style={styles.value}>{Math.round(fill)}%</Text> : null}
        </View>
      )}

      <View style={[styles.track, size === 'sm' && styles.trackSm]}>
        <Animated.View
          style={[
            styles.indicator,
            { backgroundColor: color ?? (tone === 'live' ? Colors.live : Colors.accent) },
            barStyle,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  label: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: Colors.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceActive,
    overflow: 'hidden',
  },
  trackSm: {
    height: 6,
  },
  indicator: {
    height: '100%',
    borderRadius: Radius.full,
  },
});
