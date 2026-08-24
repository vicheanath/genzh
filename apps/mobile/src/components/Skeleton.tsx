import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';

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
 * size. Spinners stay for actions, where there is no shape to promise.
 */
export function Skeleton({ width = '100%', height = 16, circle, style }: SkeletonProps) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          opacity: pulse,
          borderRadius: circle ? Radius.full : Radius.sm,
        },
        style,
      ]}
    />
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
        <View key={index} style={styles.row}>
          <Skeleton width={40} height={40} circle />
          <View style={styles.rowText}>
            <Skeleton width={`${[62, 48, 70, 55][index % 4]}%`} height={13} />
            <Skeleton width={`${[38, 30, 44, 34][index % 4]}%`} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: Colors.surfaceActive,
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
