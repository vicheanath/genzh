import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Radius, type Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/ThemeContext';

/** Each bar's resting height, in points. They differ so the row is not a comb. */
const BARS = [9, 16, 12, 7] as const;

/**
 * The speaking indicator.
 *
 * It moves now. The previous version was four static bars called a waveform,
 * which is a picture of audio rather than a sign of it — on a tile where the
 * avatar is already still, nothing on screen said the person was talking.
 *
 * Lime, not green. "Active" is the accent everywhere else in the app, and the
 * stage is not the place to introduce a sixth meaning for a colour.
 */
export function SpeakingWave() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      {BARS.map((height, index) => (
        <Bar key={index} height={height} index={index} />
      ))}
    </View>
  );
}

function Bar({ height, index }: { height: number; index: number }) {
  const styles = useThemedStyles(makeStyles);
  const scale = useSharedValue(0.45);

  useEffect(() => {
    // Staggered rather than synchronised: four bars pulsing in step read as one
    // blinking block, which is the thing a level meter is meant not to look
    // like. `reduceMotion` leaves them still for anyone who asked for that.
    scale.value = withDelay(
      index * 110,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 320, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }),
          withTiming(0.45, { duration: 320, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System }),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      ),
    );
  }, [index, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));

  return <Animated.View style={[styles.bar, { height }, style]} />;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: c.accentSubtle,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: c.accent,
  },
});
