import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Check, Minus } from 'lucide-react-native';

import { Colors, Radius, Spacing } from '../theme/tokens';

export interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  style?: ViewStyle;
}

/** A checkbox, optionally with a label and a line of help text beside it. */
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

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: mixed ? 'mixed' : on, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onCheckedChange(!on)}
      style={[styles.row, disabled && styles.disabled, style]}
    >
      <View style={[styles.box, (on || mixed) && styles.boxChecked]}>
        {mixed ? (
          <Minus size={13} color={Colors.accentContrast} strokeWidth={3} />
        ) : on ? (
          <Check size={13} color={Colors.accentContrast} strokeWidth={3} />
        ) : null}
      </View>

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
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
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
