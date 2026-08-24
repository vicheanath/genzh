import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check, Minus } from 'lucide-react-native';

import { SPRING_CONTROL, TIMING_FAST } from '../theme/motion';
import { Colors, Radius, Spacing } from '../theme/tokens';

export interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * A checkbox, optionally with a label and a line of help text beside it.
 *
 * The mark pops in on a spring while the box fills on a timing: the tick is the
 * part the eye follows, and giving it the overshoot makes checking something
 * feel like a decision landing rather than a colour swap.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  style,
}: CheckboxProps) {
  const on = checked === true;
  const mixed = checked === 'indeterminate';
  const marked = on || mixed;

  const fill = useSharedValue(marked ? 1 : 0);
  const pop = useSharedValue(marked ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(marked ? 1 : 0, TIMING_FAST);
    pop.value = withSpring(marked ? 1 : 0, SPRING_CONTROL);
  }, [marked, fill, pop]);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      fill.value,
      [0, 1],
      [Colors.surfaceMuted, Colors.accent],
    ),
    borderColor: interpolateColor(
      fill.value,
      [0, 1],
      [Colors.borderStrong, Colors.accent],
    ),
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: pop.value }],
  }));

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: mixed ? 'mixed' : on, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onCheckedChange(!on)}
      style={[styles.row, disabled && styles.disabled, style]}
    >
      <Animated.View style={[styles.box, boxStyle]}>
        <Animated.View style={markStyle}>
          {mixed ? (
            <Minus size={13} color={Colors.accentContrast} strokeWidth={3} />
          ) : (
            <Check size={13} color={Colors.accentContrast} strokeWidth={3} />
          )}
        </Animated.View>
      </Animated.View>

      {(label || description) && (
        <View style={styles.text}>
          {label ? <Text style={styles.label}>{label}</Text> : null}
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  text: {
    flex: 1,
  },
  label: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    color: Colors.textSubtle,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  disabled: {
    opacity: 0.5,
  },
});
