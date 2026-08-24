import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { SPRING_CONTROL } from '../theme/motion';
import { Radius, Stage, type Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';

/**
 * What a control is currently saying.
 *
 * `on` is the accent — the thing is doing something. `danger` is the muted or
 * deafened state, which is not an error but is a state you want to notice, so
 * it is a red wash rather than a red fill. `warning` is the raised hand.
 * `disconnect` is leaving, and is the only solid red in a call so that nothing
 * else can be mistaken for it.
 */
export type ControlTone = 'off' | 'on' | 'danger' | 'warning' | 'disconnect';

/**
 * Which ground the control sits on.
 *
 * `stage` is the full-screen call, which has its own dark environment. `page`
 * is the minimised call bar, which floats over ordinary app surfaces — a white
 * wash that reads as a control on the stage is nearly invisible there.
 */
export type ControlSurface = 'stage' | 'page';

export interface CallControlButtonProps {
  accessibilityLabel: string;
  tone?: ControlTone;
  surface?: ControlSurface;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  /** Given the resolved ink colour, so a control never restates the palette. */
  children: (color: string) => React.ReactNode;
}

/**
 * One circular call control.
 *
 * The web's `.controlBtn` and its three modifiers, as one component — shared by
 * the call dock and the minimised call bar, which had two separate sets of
 * hand-written state colours between them and disagreed about what "muted"
 * looked like. Neither moved when you touched it.
 */
export function CallControlButton({
  accessibilityLabel,
  tone = 'off',
  surface = 'stage',
  onPress,
  disabled = false,
  size = 46,
  children,
}: CallControlButtonProps) {
  const TONES = useThemedStyles(makeTONES);
  const styles = useThemedStyles(makeStyles);
  const press = useSharedValue(0);
  const { background, backgroundPressed, foreground } = TONES[surface][tone];

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(press.value, [0, 1], [background, backgroundPressed]),
    transform: [{ scale: 1 - press.value * 0.08 }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        press.value = withSpring(1, SPRING_CONTROL);
      }}
      onPressOut={() => {
        press.value = withSpring(0, SPRING_CONTROL);
      }}
      style={[
        styles.button,
        { width: size, height: size },
        tone === 'on' && styles.accentGlow,
        tone === 'disconnect' && styles.disconnectGlow,
        disabled && styles.disabled,
        style,
      ]}
    >
      {children(foreground)}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ToneStyle {
  background: string;
  backgroundPressed: string;
  foreground: string;
}

/* The three tones that do not depend on the ground: a lime fill, an amber fill
   and a solid red all carry their own contrast wherever they land. */
const makeSHARED = (c: Palette): Pick<Record<ControlTone, ToneStyle>, 'on' | 'warning' | 'disconnect'> =>
  ({
  on: {
    background: c.accent,
    backgroundPressed: c.accentActive,
    foreground: c.accentContrast,
  },
  warning: {
    background: c.warning,
    backgroundPressed: '#e09a0f',
    foreground: c.textInverted,
  },
  disconnect: {
    background: c.danger,
    backgroundPressed: c.dangerActive,
    foreground: '#fff',
  },
});

const makeTONES = (c: Palette): Record<ControlSurface, Record<ControlTone, ToneStyle>> =>
  ({
  stage: {
    ...makeSHARED(c),
    off: {
      background: Stage.control,
      backgroundPressed: Stage.controlPressed,
      // Off is legible, not disabled — the old dock dimmed these to 45% white,
      // which made "camera is off" look like "camera is unavailable".
      foreground: Stage.text,
    },
    danger: {
      background: c.dangerSubtle,
      backgroundPressed: 'rgba(255, 77, 79, 0.3)',
      foreground: c.danger,
    },
  },
  page: {
    ...makeSHARED(c),
    off: {
      background: c.surface,
      backgroundPressed: c.surfaceHover,
      foreground: c.text,
    },
    danger: {
      background: c.dangerSubtle,
      backgroundPressed: 'rgba(255, 77, 79, 0.3)',
      foreground: c.danger,
    },
  },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  button: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentGlow: {
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  disconnectGlow: {
    shadowColor: c.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  disabled: {
    opacity: 0.4,
  },
});
