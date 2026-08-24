import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';

import { Colors, Radius, Spacing } from '../theme/tokens';

export interface NumberFieldProps {
  value: number | null;
  onValueChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  /** Explanation under the control. */
  hint?: string;
  /** Unit shown inside the field — "min", "members", "sec". */
  suffix?: string;
  /** Text shown when the value is null — "No limit". */
  emptyLabel?: string;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * A number input with steppers.
 *
 * A bare numeric keyboard accepts `1e5`, `--3` and an empty string, so the
 * value is clamped here on every change rather than trusted from the field.
 * `null` is a real value — "no limit" on a room's capacity is not zero.
 */
export function NumberField({
  value,
  onValueChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  label,
  hint,
  suffix,
  emptyLabel,
  disabled,
  style,
}: NumberFieldProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  const nudge = (delta: number) => {
    onValueChange(clamp((value ?? min) + delta));
  };

  return (
    <View style={[styles.root, disabled && styles.disabled, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.group}>
        <Pressable
          accessibilityLabel="Decrease"
          disabled={disabled}
          onPress={() => nudge(-step)}
          style={styles.step}
          hitSlop={6}
        >
          <Minus size={16} color={Colors.textMuted} strokeWidth={2.5} />
        </Pressable>

        <View style={styles.field}>
          <TextInput
            style={styles.input}
            value={value === null ? '' : String(value)}
            placeholder={emptyLabel}
            placeholderTextColor={Colors.textDim}
            keyboardType="number-pad"
            editable={!disabled}
            onChangeText={(text) => {
              const digits = text.replace(/[^0-9]/g, '');
              if (digits === '') {
                onValueChange(null);
                return;
              }
              onValueChange(clamp(Number(digits)));
            }}
          />
          {suffix && value !== null ? <Text style={styles.suffix}>{suffix}</Text> : null}
        </View>

        <Pressable
          accessibilityLabel="Increase"
          disabled={disabled}
          onPress={() => nudge(step)}
          style={styles.step}
          hitSlop={6}
        >
          <Plus size={16} color={Colors.textMuted} strokeWidth={2.5} />
        </Pressable>
      </View>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
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
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    padding: 4,
  },
  step: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  input: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 40,
    padding: 0,
  },
  suffix: {
    color: Colors.textSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    color: Colors.textDim,
    fontSize: 12,
    lineHeight: 16,
  },
  disabled: {
    opacity: 0.5,
  },
});
