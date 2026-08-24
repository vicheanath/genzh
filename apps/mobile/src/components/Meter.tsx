import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { TIMING_FAST } from '../theme/motion';
import { Colors, Radius, Spacing } from '../theme/tokens';

export interface MeterProps {
  /** 0–1. */
  value: number;
  label?: string;
  /** Segmented, for a live signal like microphone input. */
  variant?: 'bar' | 'segments';
  /**
   * `muted` is for a gauge that is wired up but not currently reading
   * anything — a colourful level meter at rest claims a live signal.
   */
  tone?: 'accent' | 'live' | 'muted';
  style?: ViewStyle;
}

const SEGMENTS = 16;

/**
 * A reading, not a task.
 *
 * The distinction from `Progress` is the whole reason both exist: progress goes
 * one way and ends, a meter gauges something right now. Microphone level is the
 * app's case — it goes up and down forever and never completes.
 *
 * A short timing rather than a spring: a level meter that overshoots is lying
 * about how loud you were, and one that oscillates after you stop talking is
 * worse than one that snaps.
 */
export function Meter({ value, label, variant = 'bar', tone = 'accent', style }: MeterProps) {
  const level = Math.min(1, Math.max(0, value));
  const animated = useSharedValue(level);

  useEffect(() => {
    animated.value = withTiming(level, TIMING_FAST);
  }, [level, animated]);

  const color =
    tone === 'muted' ? Colors.borderStrong : tone === 'live' ? Colors.live : Colors.accent;

  const barStyle = useAnimatedStyle(() => ({
    width: `${animated.value * 100}%`,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(level * 100), min: 0, max: 100 }}
      style={[styles.root, style]}
    >
      {label ? <Text style={styles.label}>{label}</Text> : null}

      {variant === 'segments' ? (
        <View style={styles.segments}>
          {Array.from({ length: SEGMENTS }, (_, index) => (
            <Segment key={index} index={index} level={animated} color={color} />
          ))}
        </View>
      ) : (
        <View style={styles.track}>
          <Animated.View style={[styles.indicator, { backgroundColor: color }, barStyle]} />
        </View>
      )}
    </View>
  );
}

/**
 * One block of a segmented meter.
 *
 * Each segment decides for itself whether the level has reached it, on the UI
 * thread — so sixteen blocks light up from one shared value rather than from
 * sixteen React renders per frame.
 */
function Segment({
  index,
  level,
  color,
}: {
  index: number;
  level: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    backgroundColor: index / SEGMENTS < level.value ? color : Colors.surfaceActive,
  }));

  return <Animated.View style={[styles.segment, style]} />;
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.sm,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceActive,
    overflow: 'hidden',
  },
  indicator: {
    height: '100%',
    borderRadius: Radius.full,
  },
  segments: {
    flexDirection: 'row',
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 10,
    borderRadius: 2,
  },
});
