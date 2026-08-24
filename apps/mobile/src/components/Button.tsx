import React, { cloneElement, isValidElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { SPRING_CONTROL } from '../theme/motion';
import { Radius, type Palette, type ElevationSet } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  /** Omit for a button whose whole content is one icon — see `iconOnly`. */
  title?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /**
   * Square, for a button whose entire content is one icon. Inferred when there
   * is an icon and no title, so the common case does not have to say it twice.
   */
  iconOnly?: boolean;
  icon?: React.ReactNode;
  /** Required in practice for an icon-only button, which has no text to read. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * The button, matching `apps/web/src/components/Button`.
 *
 * Same five variants, same three sizes, same rule 1 (ink on lime) and rule 4
 * (controls are pills). What the web gets from CSS transitions and `:hover`,
 * this gets from one shared value per button: a phone has no hover, so the
 * hover colour is spent on the *press* instead, crossfaded rather than cut.
 *
 * Variants are looked up in a table rather than switched on, because a table is
 * one place to read what "danger" means — fill, ink, press colour and elevation
 * together — instead of three switch arms that have to be kept in step.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  iconOnly,
  icon,
  accessibilityLabel,
  style,
  textStyle,
}: ButtonProps) {
  const VARIANTS = useThemedStyles(makeVARIANTS);
  const press = useSharedValue(0);
  const inert = disabled || loading;

  const tone = VARIANTS[variant];
  const metrics = SIZES[size];
  const square = iconOnly ?? (!!icon && !title);

  const surfaceStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      press.value,
      [0, 1],
      [tone.background, tone.backgroundPressed],
    ),
    borderColor: interpolateColor(
      press.value,
      [0, 1],
      [tone.border, tone.borderPressed],
    ),
    transform: [{ scale: 1 - press.value * 0.04 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(press.value, [0, 1], [tone.foreground, tone.foregroundPressed]),
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title ?? undefined}
      accessibilityState={{ disabled: inert }}
      onPress={onPress}
      disabled={inert}
      // The smallest button is 32pt tall; the slop makes the tap target the
      // 44pt one a thumb actually needs without inflating the shape.
      hitSlop={8}
      onPressIn={() => {
        press.value = withSpring(1, SPRING_CONTROL);
      }}
      onPressOut={() => {
        press.value = withSpring(0, SPRING_CONTROL);
      }}
      style={[
        styles.base,
        tone.elevation,
        { height: metrics.height },
        square
          ? { width: metrics.height, paddingHorizontal: 0 }
          : { paddingHorizontal: metrics.paddingHorizontal },
        surfaceStyle,
        inert && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.foreground} size="small" />
      ) : (
        <>
          {/* The icon takes the variant's ink unless the caller named a colour,
              which is as close as RN gets to the web's `currentColor`. */}
          {tintIcon(icon, tone.foreground)}
          {title ? (
            <Animated.Text
              numberOfLines={1}
              style={[styles.label, { fontSize: metrics.fontSize }, labelStyle, textStyle]}
            >
              {title}
            </Animated.Text>
          ) : null}
        </>
      )}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * `currentColor`, by hand.
 *
 * An icon inside a button should be the same ink as the label — on the web that
 * is automatic, here the colour is a prop. Only fills it in when the caller left
 * it out, so a deliberately off-colour glyph (a live cyan phone, say) survives.
 */
function tintIcon(icon: React.ReactNode, color: string): React.ReactNode {
  if (!isValidElement<{ color?: string }>(icon)) return icon;
  if (icon.props.color) return icon;
  return cloneElement(icon, { color });
}

interface Tone {
  background: string;
  backgroundPressed: string;
  border: string;
  borderPressed: string;
  foreground: string;
  foregroundPressed: string;
  elevation?: ViewStyle;
}

const TRANSPARENT = 'transparent';
/* Interpolating *from* `transparent` walks through transparent black, which
   muddies a light wash on the way in. The zero-alpha white keeps the hue fixed
   and moves only the alpha, which is what the web's `background-color`
   transition does. */
const CLEAR_WHITE = 'rgba(255, 255, 255, 0)';

const makeVARIANTS = (c: Palette, e: ElevationSet): Record<ButtonVariant, Tone> =>
  ({
  /* Ink on lime — rule 1, and the single most recognisable thing on screen.
     `accentContrast` is a near-black. If this ever looks wrong, the fix is not
     to lighten the text. */
  primary: {
    background: c.accent,
    backgroundPressed: c.accentActive,
    border: c.accent,
    borderPressed: c.accentActive,
    foreground: c.accentContrast,
    foregroundPressed: c.accentContrast,
    elevation: e.sm,
  },
  secondary: {
    background: c.surface,
    backgroundPressed: c.surfaceHover,
    border: c.borderStrong,
    borderPressed: c.textSubtle,
    foreground: c.text,
    foregroundPressed: c.text,
    elevation: e.sm,
  },
  ghost: {
    background: CLEAR_WHITE,
    backgroundPressed: c.hover,
    border: TRANSPARENT,
    borderPressed: TRANSPARENT,
    foreground: c.textMuted,
    foregroundPressed: c.text,
  },
  subtle: {
    background: c.accentSubtle,
    backgroundPressed: c.accentSubtleHover,
    border: TRANSPARENT,
    borderPressed: TRANSPARENT,
    foreground: c.accentText,
    foregroundPressed: c.accentText,
  },
  /* Solid, as on the web: a destructive action is not a quiet one. */
  danger: {
    background: c.danger,
    backgroundPressed: c.dangerActive,
    border: c.danger,
    borderPressed: c.dangerActive,
    foreground: '#fff',
    foregroundPressed: '#fff',
    elevation: e.sm,
  },
});

/** Heights are the web's, converted at 16px/rem: 2 / 2.375 / 2.75rem. */
const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 32, paddingHorizontal: 12, fontSize: 14 },
  md: { height: 38, paddingHorizontal: 16, fontSize: 14 },
  lg: { height: 44, paddingHorizontal: 24, fontSize: 15 },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  disabled: {
    opacity: 0.45,
  },
});
