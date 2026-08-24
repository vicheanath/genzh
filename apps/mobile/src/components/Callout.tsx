import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react-native';

import { Colors, Radius, Spacing } from '../theme/tokens';

export interface CalloutProps {
  /** Matches the web component's vocabulary, so ports read the same. */
  tone?: 'info' | 'danger' | 'success' | 'warning';
  /** Alias for `tone`, kept for the screens that were written against it. */
  type?: 'info' | 'danger' | 'success' | 'warning';
  /** The message. `children` is accepted for a body with its own layout. */
  text?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
}

const TONES = {
  info: { color: Colors.accentText, background: Colors.accentSubtle, Icon: Info },
  danger: { color: Colors.danger, background: Colors.dangerSubtle, Icon: AlertCircle },
  success: { color: Colors.success, background: Colors.successSubtle, Icon: CheckCircle2 },
  warning: { color: Colors.warning, background: 'rgba(250, 173, 20, 0.16)', Icon: TriangleAlert },
} as const;

/** A boxed message: an error from a form, a note above a list. */
export function Callout({ tone, type, text, children, style }: CalloutProps) {
  const { color, background, Icon } = TONES[tone ?? type ?? 'info'];

  return (
    <View
      accessibilityRole={(tone ?? type) === 'danger' ? 'alert' : undefined}
      style={[styles.callout, { backgroundColor: background, borderColor: color }, style]}
    >
      <Icon size={18} color={color} />
      {text ? <Text style={[styles.text, { color }]}>{text}</Text> : null}
      {children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
});
