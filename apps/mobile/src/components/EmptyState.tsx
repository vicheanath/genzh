import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Button } from './Button';
import { Colors, Radius, Spacing } from '../theme/tokens';

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
  return (
    <View style={[styles.root, style]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="secondary" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    color: Colors.textSubtle,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 320,
  },
  action: {
    marginTop: Spacing.md,
  },
});
