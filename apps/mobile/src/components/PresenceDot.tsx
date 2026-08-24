import React, { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { SPRING_CONTROL } from '../theme/motion';
import { Colors, Radius } from '../theme/tokens';

export type Presence = 'online' | 'idle' | 'busy' | 'offline';

const COLORS: Record<Presence, string> = {
  online: Colors.online,
  idle: Colors.idle,
  busy: Colors.dnd,
  offline: Colors.offline,
};

const LABELS: Record<Presence, string> = {
  online: 'Online',
  idle: 'Idle',
  busy: 'Do not disturb',
  offline: 'Offline',
};

/**
 * The status dot on an avatar.
 *
 * Sized and positioned by whatever wraps it, so the same dot works on a 28px
 * sidebar avatar and a 64px profile one.
 *
 * Coming online gets a halo that expands once and fades — presence arrives over
 * a socket while you are looking at the list, and without that beat somebody
 * turning green is a colour change nobody notices. Only `online` pulses; a dot
 * that animates in every state animates in none of them.
 */
export function PresenceDot({
  presence,
  size = 10,
  /** The colour the dot is punched out of — the surface behind the avatar. */
  ringColor = Colors.bg,
  style,
}: {
  presence: Presence;
  size?: number;
  ringColor?: string;
  style?: ViewStyle;
}) {
  const pop = useSharedValue(1);
  const halo = useSharedValue(0);

  useEffect(() => {
    pop.value = withSequence(withTiming(0.7, { duration: 0 }), withSpring(1, SPRING_CONTROL));

    if (presence !== 'online') {
      halo.value = 0;
      return;
    }

    halo.value = withRepeat(
      withTiming(1, {
        duration: 2200,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      false,
    );
  }, [presence, pop, halo]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: (1 - halo.value) * 0.55,
    transform: [{ scale: 1 + halo.value * 1.6 }],
  }));

  return (
    <View
      accessibilityLabel={LABELS[presence]}
      style={[{ width: size, height: size }, style]}
    >
      {presence === 'online' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            { borderRadius: Radius.full, backgroundColor: COLORS.online },
            haloStyle,
          ]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: Radius.full,
            backgroundColor: COLORS[presence],
            borderColor: ringColor,
          },
          dotStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    borderWidth: 2,
  },
  halo: {
    ...StyleSheet.absoluteFillObject,
  },
});
