import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button } from './Button';
import { Radius, Spacing, type Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

/**
 * What a list says when it has nothing in it.
 *
 * Every list screen in the app needs one, and a bare "No results" tells the
 * reader nothing about what to do next — so the action is part of the shape
 * rather than something each screen bolts on.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    // An empty state usually replaces a spinner, so it fades in rather than
    // snapping — otherwise "loading" and "there is nothing here" look like the
    // same instant.
    <Animated.View entering={FadeIn.duration(240)} style={[styles.root, style]}>
      {icon ? (
        <Animated.View entering={FadeInDown.delay(60).duration(260)} style={styles.icon}>
          {icon}
        </Animated.View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="secondary" onPress={onAction} style={styles.action} />
      ) : null}
    </Animated.View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.sm,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    color: c.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    color: c.textSubtle,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 320,
  },
  action: {
    marginTop: Spacing.md,
  },
});
