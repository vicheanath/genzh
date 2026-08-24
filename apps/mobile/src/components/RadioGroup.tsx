import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

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
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: option.disabled }}
            disabled={option.disabled}
            onPress={() => onValueChange(option.value)}
            style={[styles.row, selected && styles.rowSelected, option.disabled && styles.disabled]}
          >
            <View style={[styles.dot, selected && styles.dotSelected]}>
              {selected && <View style={styles.dotInner} />}
            </View>

            <View style={styles.text}>
              <Text style={styles.label}>{option.label}</Text>
              {option.description ? (
                <Text style={styles.description}>{option.description}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

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
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
  },
  rowSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dotSelected: {
    borderColor: Colors.accent,
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
