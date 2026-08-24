import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

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
      {items.map((item) => {
        const on = value.includes(item.value);

        return (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => toggle(item.value)}
            style={[styles.item, on && styles.itemOn]}
          >
            {item.icon}
            {item.label ? (
              <Text style={[styles.label, on && styles.labelOn]}>{item.label}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

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
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
  },
  itemOn: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  labelOn: {
    color: Colors.accentText,
  },
});
