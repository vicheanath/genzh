import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Compass, Users } from 'lucide-react-native';

import { MODE_COPY, useAppMode, type AppMode } from '../context/AppModeContext';
import { Radius, Spacing, type Palette } from '../theme/tokens';
import { useThemedStyles, useColors } from '../theme/ThemeContext';

const MODE_ICON: Record<AppMode, typeof Compass> = {
  playground: Compass,
  servers: Users,
};

export interface ModeSwitchProps {
  /**
   * Draw for a dark photographic ground rather than a themed surface.
   *
   * The feed has no chrome behind it — the control floats over whatever colour
   * the current card happens to be — so on that screen it carries its own
   * scrim instead of borrowing a surface token that would vanish against half
   * the cards.
   */
  overlay?: boolean;
}

/**
 * The one control that crosses between the two halves of the app.
 *
 * It names where you would *go*, not where you are: the label is the other
 * mode. A segmented control showing both was the first shape this took, and it
 * read as a filter over one list rather than as a door out of one product into
 * another.
 */
export function ModeSwitch({ overlay = false }: ModeSwitchProps) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { other, setMode } = useAppMode();

  const Icon = MODE_ICON[other];
  const copy = MODE_COPY[other];
  const tint = overlay ? '#fff' : c.text;

  return (
    <Animated.View entering={FadeIn}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${copy.label} — ${copy.tagline}`}
        onPress={() => setMode(other)}
        style={({ pressed }) => [
          styles.pill,
          overlay ? styles.pillOverlay : styles.pillSurface,
          pressed && styles.pressed,
        ]}
      >
        <Icon size={15} color={tint} />
        <View>
          <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
            {copy.label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: 7,
      borderRadius: Radius.full,
      borderWidth: 1,
    },
    pillSurface: {
      backgroundColor: c.surfaceRaised,
      borderColor: c.border,
    },
    // Its own ground, because the feed behind it is a different colour on every
    // card and a themed surface would disappear into half of them.
    pillOverlay: {
      backgroundColor: 'rgba(12, 12, 10, 0.55)',
      borderColor: 'rgba(255, 255, 255, 0.22)',
    },
    pressed: {
      opacity: 0.7,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.1,
    },
  });
