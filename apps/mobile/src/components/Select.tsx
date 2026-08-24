import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Check, ChevronDown } from 'lucide-react-native';

import { SPRING_CONTROL } from '../theme/motion';

import { Sheet } from './Sheet';
import { Radius, Spacing, type Palette } from '../theme/tokens';
import { useThemedStyles, useColors } from '../theme/ThemeContext';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  style?: ViewStyle;
}

/**
 * A single-select control.
 *
 * The web app drops a popup under the trigger; a phone gets a bottom sheet
 * instead, which is where a list of choices belongs on a device held in one
 * hand. Generic over the option value so `onValueChange` hands back the union
 * type rather than a bare string.
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled,
  label,
  style,
}: SelectProps<T>) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  // The chevron flips while the sheet is up, so the trigger keeps saying which
  // way the control will go if you press it again.
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withSpring(open ? 1 : 0, SPRING_CONTROL);
  }, [open, spin]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 180}deg` }],
  }));

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.trigger, disabled && styles.disabled, style]}
      >
        <Text style={[styles.triggerText, !current && styles.placeholder]} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={16} color={c.textSubtle} />
        </Animated.View>
      </Pressable>

      <Sheet open={open} onOpenChange={setOpen}>
        {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}

        <ScrollView contentContainerStyle={styles.list}>
          {options.map((option, index) => {
            const selected = option.value === value;

            return (
              <AnimatedPressable
                key={option.value}
                entering={FadeIn.delay(index * 25).duration(160)}
                disabled={option.disabled}
                onPress={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                style={[styles.item, selected && styles.itemSelected, option.disabled && styles.disabled]}
              >
                <Text style={[styles.itemText, selected && styles.itemTextSelected]}>
                  {option.label}
                </Text>
                {selected && <Check size={16} color={c.accent} strokeWidth={3} />}
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  triggerText: {
    flex: 1,
    color: c.text,
    fontSize: 14,
    fontWeight: '600',
  },
  placeholder: {
    color: c.textDim,
  },
  sheetTitle: {
    color: c.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  itemSelected: {
    backgroundColor: c.accentSubtle,
  },
  itemText: {
    color: c.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  itemTextSelected: {
    color: c.text,
  },
  disabled: {
    opacity: 0.5,
  },
});
