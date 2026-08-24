import React, { useEffect } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { SPRING_CONTROL } from '../theme/motion';
import { Radius } from '../theme/tokens';
import { useColors } from '../theme/ThemeContext';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const THUMB = 20;
const TRAVEL = TRACK_WIDTH - THUMB - 6;

/**
 * An on/off toggle. Controlled via `checked` / `onCheckedChange`.
 *
 * The thumb springs rather than eases, and squashes slightly as it goes — the
 * small overshoot is what makes a toggle feel like a physical switch instead of
 * a rectangle changing colour. Both the travel and the track colour are
 * interpolated from one shared value on the UI thread, so the two can never
 * drift out of step even under load.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  style,
  accessibilityLabel,
}: SwitchProps) {
  const c = useColors();
  const progress = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(checked ? 1 : 0, SPRING_CONTROL);
  }, [checked, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [c.surfaceActive, c.accent],
    ),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [c.textMuted, c.accentContrast],
    ),
    transform: [
      { translateX: progress.value * TRAVEL },
      // Widest at the midpoint of the throw, back to a circle at either end.
      { scaleX: interpolate(progress.value, [0, 0.5, 1], [1, 1.15, 1]) },
    ],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      hitSlop={8}
      style={[disabled && styles.disabled, style]}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: Radius.full,
    padding: 3,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.full,
  },
  disabled: {
    opacity: 0.5,
  },
});
