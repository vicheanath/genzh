import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { SPRING_CONTROL, TIMING_FAST } from '../theme/motion';
import { Colors, Radius, Spacing } from '../theme/tokens';

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<RadioOption<T>>;
  style?: ViewStyle;
}

/** One choice from a short, visible list. */
export function RadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  style,
}: RadioGroupProps<T>) {
  return (
    <View accessibilityRole="radiogroup" style={[styles.group, style]}>
      {options.map((option) => (
        <Radio
          key={option.value}
          option={option}
          selected={option.value === value}
          onPress={() => onValueChange(option.value)}
        />
      ))}
    </View>
  );
}

/**
 * One option.
 *
 * The inner dot springs in and the card's border crossfades — the card telling
 * you it is chosen and the dot telling you *what* was chosen, on two different
 * curves so neither hides the other.
 */
function Radio<T extends string>({
  option,
  selected,
  onPress,
}: {
  option: RadioOption<T>;
  selected: boolean;
  onPress: () => void;
}) {
  const on = useSharedValue(selected ? 1 : 0);
  const pop = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, TIMING_FAST);
    pop.value = withSpring(selected ? 1 : 0, SPRING_CONTROL);
  }, [selected, on, pop]);

  const cardStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [Colors.border, Colors.accent]),
    backgroundColor: interpolateColor(
      on.value,
      [0, 1],
      [Colors.surfaceMuted, Colors.accentSubtle],
    ),
  }));

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [Colors.borderStrong, Colors.accent]),
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: pop.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: option.disabled }}
      disabled={option.disabled}
      onPress={onPress}
      style={[styles.row, option.disabled && styles.disabled, cardStyle]}
    >
      <Animated.View style={[styles.dot, ringStyle]}>
        <Animated.View style={[styles.dotInner, dotStyle]} />
      </Animated.View>

      <View style={styles.text}>
        <Text style={styles.label}>{option.label}</Text>
        {option.description ? (
          <Text style={styles.description}>{option.description}</Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  group: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dotInner: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
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
