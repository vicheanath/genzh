import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, Spacing } from '../theme/tokens';

export interface SpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  style?: ViewStyle;
}

/** A spinner, for an action with no shape to promise. */
export function Spinner({ size = 'small', color = Colors.accent, style }: SpinnerProps) {
  return <ActivityIndicator size={size} color={color} style={style} />;
}

/** A centred spinner filling the space it is given, with an optional caption. */
export function LoadingPanel({ label }: { label?: string }) {
  return (
    <View style={styles.panel}>
      <ActivityIndicator size="large" color={Colors.accent} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg,
  },
  label: {
    color: Colors.textSubtle,
    fontSize: 13,
    fontWeight: '600',
  },
});
