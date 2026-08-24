import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Spacing, type Palette } from '../theme/tokens';
import { useThemedStyles, useColors } from '../theme/ThemeContext';

export interface SpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  style?: ViewStyle;
}

/** A spinner, for an action with no shape to promise. */
export function Spinner({ size = 'small', color, style }: SpinnerProps) {
  const c = useColors();
  return <ActivityIndicator size={size} color={color ?? c.accent} style={style} />;
}

/** A centred spinner filling the space it is given, with an optional caption. */
export function LoadingPanel({ label }: { label?: string }) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  return (
    <View style={styles.panel}>
      <ActivityIndicator size="large" color={c.accent} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  panel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: c.bg,
  },
  label: {
    color: c.textSubtle,
    fontSize: 13,
    fontWeight: '600',
  },
});
