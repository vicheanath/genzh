import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Radius } from '../theme/tokens';
import { useColors } from '../theme/ThemeContext';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'mint';

interface BadgeProps {
  text: string | number;
  tone?: BadgeTone;
  dot?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Badge({ text, tone = 'neutral', dot = false, style, textStyle }: BadgeProps) {
  const c = useColors();
  const getColors = () => {
    switch (tone) {
      case 'accent':
        return { bg: c.accentSubtle, text: c.accentText, border: 'rgba(186, 227, 16, 0.3)' };
      case 'success':
        return { bg: c.successSubtle, text: c.success, border: 'rgba(82, 196, 26, 0.3)' };
      case 'danger':
        return { bg: c.dangerSubtle, text: c.danger, border: 'rgba(255, 77, 79, 0.3)' };
      case 'mint':
        return { bg: c.liveSubtle, text: c.live, border: 'rgba(0, 210, 229, 0.3)' };
      default:
        return { bg: c.surfaceRaised, text: c.textMuted, border: c.border };
    }
  };

  const scheme = getColors();

  return (
    <View style={[styles.badge, { backgroundColor: scheme.bg, borderColor: scheme.border }, style]}>
      {dot && <View style={[styles.dot, { backgroundColor: scheme.text }]} />}
      <Text style={[styles.text, { color: scheme.text }, textStyle]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
