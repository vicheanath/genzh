import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

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
 */
export function Meter({ value, label, variant = 'bar', tone = 'accent', style }: MeterProps) {
  const level = Math.min(1, Math.max(0, value));
  const color =
    tone === 'muted' ? Colors.borderStrong : tone === 'live' ? Colors.live : Colors.accent;

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
            <View
              key={index}
              style={[
                styles.segment,
                index / SEGMENTS < level && { backgroundColor: color },
              ]}
            />
          ))}
        </View>
      ) : (
        <View style={styles.track}>
          <View
            style={[styles.indicator, { width: `${level * 100}%`, backgroundColor: color }]}
          />
        </View>
      )}
    </View>
  );
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
    backgroundColor: Colors.surfaceActive,
  },
});
