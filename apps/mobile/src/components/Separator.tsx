import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Spacing, type Palette } from '../theme/tokens';
import { useThemedStyles, useColors } from '../theme/ThemeContext';

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  /** A word set into the rule — "Today", "New messages". */
  label?: string;
  /** Tint the rule and its label, for the unread divider. */
  tone?: 'default' | 'accent' | 'danger';
  style?: ViewStyle;
}

/** A rule between things, optionally with a label set into it. */
export function Separator({
  orientation = 'horizontal',
  label,
  tone = 'default',
  style,
}: SeparatorProps) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const color =
    tone === 'accent' ? c.accent : tone === 'danger' ? c.danger : c.border;

  if (orientation === 'vertical') {
    return <View style={[styles.vertical, { backgroundColor: color }, style]} />;
  }

  if (!label) {
    return <View style={[styles.horizontal, { backgroundColor: color }, style]} />;
  }

  return (
    <View style={[styles.labelled, style]}>
      <View style={[styles.horizontal, styles.flex, { backgroundColor: color }]} />
      <Text style={[styles.label, tone !== 'default' && { color }]}>{label}</Text>
      <View style={[styles.horizontal, styles.flex, { backgroundColor: color }]} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  horizontal: {
    height: StyleSheet.hairlineWidth * 2,
  },
  vertical: {
    width: StyleSheet.hairlineWidth * 2,
    alignSelf: 'stretch',
  },
  labelled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  flex: {
    flex: 1,
  },
  label: {
    color: c.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
