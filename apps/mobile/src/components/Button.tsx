import React from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';

import { Colors, Radius } from '../theme/tokens';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'subtle' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const getVariantStyle = () => {
    switch (variant) {
      case 'primary':
        return styles.btnPrimary;
      case 'secondary':
        return styles.btnSecondary;
      case 'subtle':
        return styles.btnSubtle;
      case 'danger':
        return styles.btnDanger;
      case 'ghost':
        return styles.btnGhost;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'primary':
        return styles.textPrimary;
      case 'secondary':
        return styles.textSecondary;
      case 'subtle':
        return styles.textSubtle;
      case 'danger':
        return styles.textDanger;
      case 'ghost':
        return styles.textGhost;
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case 'sm':
        return styles.sizeSm;
      case 'md':
        return styles.sizeMd;
      case 'lg':
        return styles.sizeLg;
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title || undefined}
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        getVariantStyle(),
        getSizeStyle(),
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? Colors.accentContrast : Colors.accent}
          size="small"
        />
      ) : (
        <>
          {icon}
          {title ? (
            <Text
              style={[
                styles.textBase,
                getTextStyle(),
                icon ? { marginLeft: 8 } : null,
                textStyle,
              ]}
            >
              {title}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnPrimary: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  btnSecondary: {
    backgroundColor: Colors.surface,
    borderColor: Colors.borderStrong,
  },
  btnSubtle: {
    backgroundColor: Colors.accentSubtle,
    borderColor: 'rgba(186, 227, 16, 0.25)',
  },
  btnDanger: {
    backgroundColor: Colors.dangerSubtle,
    borderColor: 'rgba(255, 77, 79, 0.3)',
  },
  btnGhost: {
    backgroundColor: 'transparent',
  },
  sizeSm: {
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  sizeMd: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  sizeLg: {
    paddingVertical: 15,
    paddingHorizontal: 26,
  },
  textBase: {
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  textPrimary: {
    color: Colors.accentContrast,
  },
  textSecondary: {
    color: Colors.text,
  },
  textSubtle: {
    color: Colors.accentText,
  },
  textDanger: {
    color: Colors.danger,
  },
  textGhost: {
    color: Colors.textMuted,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
