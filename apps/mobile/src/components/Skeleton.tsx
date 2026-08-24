import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Colors, Radius, Spacing } from '../theme/tokens';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  circle?: boolean;
  style?: ViewStyle;
}

/**
 * A placeholder in the shape of the thing that is loading.
 *
 * Preferred over a spinner wherever the layout is known in advance: the screen
 * does not jump when the data lands, because the space was already the right
 * size.
 *
 * The sheen sweeps across rather than the whole block pulsing. A pulse is a
 * light going on and off, which reads as something broken; a sweep reads as
 * work in progress, and it has a direction — which is why every loading
 * surface people already trust uses one.
 */
export function Skeleton({ width = '100%', height = 16, circle, style }: SkeletonProps) {
  const [measured, setMeasured] = useState(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(1, {
        duration: 1150,
        easing: Easing.inOut(Easing.quad),
        // Somebody who has asked for less motion gets a still block rather than
        // a bar travelling across the screen every second.
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      false,
    );
  }, [sweep]);

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -measured + sweep.value * (measured * 2) }],
  }));

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width)}
      style={[
        styles.skeleton,
        { width, height, borderRadius: circle ? Radius.full : Radius.sm },
        style,
      ]}
    >
      {measured > 0 ? (
        <Animated.View
          style={[styles.sheen, { width: measured * 0.6 }, sheenStyle]}
        />
      ) : null}
    </View>
  );
}

/** A stand-in for a list of rows — a channel list, a member list. */
export function SkeletonText({ lines = 3, style }: { lines?: number; style?: ViewStyle }) {
  return (
    <View style={[styles.stack, style]}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          height={13}
          // Ragged widths read as text; identical bars read as a loading bug.
          width={`${[92, 74, 84, 63, 88][index % 5]}%`}
        />
      ))}
    </View>
  );
}

/** A stand-in for a list of people or rooms: an avatar and two lines. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.rows}>
      {Array.from({ length: rows }, (_, index) => (
        <Animated.View
          key={index}
          // Staggered so the placeholder list arrives the way the real one
          // will, rather than all at once and then all at once again.
          entering={FadeIn.delay(index * 60).duration(220)}
          style={styles.row}
        >
          <Skeleton width={40} height={40} circle />
          <View style={styles.rowText}>
            <Skeleton width={`${[62, 48, 70, 55][index % 4]}%`} height={13} />
            <Skeleton width={`${[38, 30, 44, 34][index % 4]}%`} height={11} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: Colors.surfaceActive,
    overflow: 'hidden',
  },
  sheen: {
    ...StyleSheet.absoluteFillObject,
    left: 0,
    backgroundColor: Colors.surfaceHover,
    opacity: 0.9,
  },
  stack: {
    gap: Spacing.sm,
  },
  rows: {
    gap: Spacing.lg,
    padding: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rowText: {
    flex: 1,
    gap: Spacing.sm,
  },
});
