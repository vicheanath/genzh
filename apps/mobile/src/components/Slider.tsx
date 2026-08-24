import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { SPRING_CONTROL } from '../theme/motion';
import { Colors, Radius, Spacing } from '../theme/tokens';

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  /** Fired once at the end of a drag — for settings that hit the network. */
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  /** Renders the current value beside the label. */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  style?: ViewStyle;
}

const THUMB = 22;

/**
 * A single-value slider with an optional label and live value readout.
 *
 * The fill and the thumb are driven from a shared value on the UI thread, so
 * the control tracks the finger at display rate even while JS is busy — which,
 * for the playback-volume slider, is exactly when it is being dragged.
 *
 * `onValueChange` is only called when the *quantised* value actually changes,
 * not on every frame: a 0–100 slider crossing a step fires about a hundred
 * times across its whole travel instead of once per frame, and each of those is
 * a React render.
 */
export function Slider({
  value,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  label,
  formatValue,
  disabled,
  style,
}: SliderProps) {
  const width = useSharedValue(0);
  const ratio = useSharedValue(fractionOf(value, min, max));
  const grabbed = useSharedValue(0);

  // Follow the prop while the finger is off the control. During a drag the
  // gesture owns the position, or a late render would yank the thumb back —
  // and this runs in an effect rather than in render because reading a shared
  // value while rendering is exactly the tearing Reanimated warns about.
  const externalRatio = fractionOf(value, min, max);
  useEffect(() => {
    if (grabbed.value === 0) ratio.value = externalRatio;
  }, [externalRatio, grabbed, ratio]);

  const emit = useCallback(
    (next: number) => {
      if (next !== value) onValueChange(next);
    },
    [onValueChange, value],
  );

  const commit = useCallback(
    (next: number) => onValueCommit?.(next),
    [onValueCommit],
  );

  const quantise = (fraction: number) => {
    'worklet';
    const raw = min + fraction * (max - min);
    const stepped = Math.round((raw - min) / step) * step + min;
    return Math.min(max, Math.max(min, stepped));
  };

  const apply = (x: number) => {
    'worklet';
    if (width.value <= 0) return;
    ratio.value = Math.min(1, Math.max(0, x / width.value));
    runOnJS(emit)(quantise(ratio.value));
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    // A tap anywhere on the track jumps there, which is what people expect from
    // a volume bar and what a drag-only slider makes needlessly fiddly.
    .minDistance(0)
    .onBegin((event) => {
      grabbed.value = withSpring(1, SPRING_CONTROL);
      apply(event.x);
    })
    .onUpdate((event) => {
      apply(event.x);
    })
    .onFinalize(() => {
      grabbed.value = withSpring(0, SPRING_CONTROL);
      runOnJS(commit)(quantise(ratio.value));
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: ratio.value * width.value,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ratio.value * width.value - THUMB / 2 },
      // Grows under the thumb while held, so the finger covering it still
      // leaves something visible at its edges.
      { scale: 1 + grabbed.value * 0.25 },
    ],
  }));

  return (
    <View style={[styles.root, disabled && styles.disabled, style]}>
      {label !== undefined && (
        <View style={styles.header}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{formatValue ? formatValue(value) : String(value)}</Text>
        </View>
      )}

      <GestureDetector gesture={pan}>
        <View
          style={styles.control}
          onLayout={(event: LayoutChangeEvent) => {
            width.value = event.nativeEvent.layout.width;
          }}
        >
          <View style={styles.track}>
            <Animated.View style={[styles.indicator, fillStyle]} />
          </View>
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

function fractionOf(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: Colors.accentText,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  control: {
    height: THUMB + 14,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceActive,
    overflow: 'hidden',
  },
  indicator: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    borderWidth: 3,
    borderColor: Colors.bg,
  },
  disabled: {
    opacity: 0.5,
  },
});
