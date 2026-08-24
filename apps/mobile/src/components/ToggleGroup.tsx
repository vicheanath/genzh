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

export interface ToggleItem<T extends string> {
  value: T;
  label?: string;
  icon?: React.ReactNode;
}

export interface ToggleGroupProps<T extends string> {
  value: T[];
  onValueChange: (value: T[]) => void;
  items: ReadonlyArray<ToggleItem<T>>;
  /** `single` clears the others on press; `multiple` accumulates. */
  mode?: 'single' | 'multiple';
  style?: ViewStyle;
}

/** A row of independently-pressed toggles, joined into one control. */
export function ToggleGroup<T extends string>({
  value,
  onValueChange,
  items,
  mode = 'multiple',
  style,
}: ToggleGroupProps<T>) {
  const toggle = (next: T) => {
    if (mode === 'single') {
      onValueChange(value.includes(next) ? [] : [next]);
      return;
    }
    onValueChange(
      value.includes(next) ? value.filter((item) => item !== next) : [...value, next],
    );
  };

  return (
    <View style={[styles.group, style]}>
      {items.map((item) => (
        <Toggle
          key={item.value}
          item={item}
          on={value.includes(item.value)}
          onPress={() => toggle(item.value)}
        />
      ))}
    </View>
  );
}

/**
 * One chip.
 *
 * Split out so each chip owns its own shared values: a category filter can hold
 * a dozen of these, and driving them from one parent would mean a React render
 * per chip on every press.
 */
function Toggle<T extends string>({
  item,
  on,
  onPress,
}: {
  item: ToggleItem<T>;
  on: boolean;
  onPress: () => void;
}) {
  const selected = useSharedValue(on ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    selected.value = withTiming(on ? 1 : 0, TIMING_FAST);
  }, [on, selected]);

  const chipStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      selected.value,
      [0, 1],
      [Colors.surfaceMuted, Colors.accentSubtle],
    ),
    borderColor: interpolateColor(
      selected.value,
      [0, 1],
      [Colors.border, Colors.accent],
    ),
    transform: [{ scale: 1 - press.value * 0.05 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(selected.value, [0, 1], [Colors.textMuted, Colors.accentText]),
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      onPressIn={() => {
        press.value = withSpring(1, SPRING_CONTROL);
      }}
      onPressOut={() => {
        press.value = withSpring(0, SPRING_CONTROL);
      }}
      style={[styles.item, chipStyle]}
    >
      {item.icon}
      {item.label ? (
        <Animated.Text style={[styles.label, labelStyle]}>{item.label}</Animated.Text>
      ) : null}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
