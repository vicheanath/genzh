import React, { useCallback, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, MicOff, PhoneOff, Radio, Users } from 'lucide-react-native';

import { useVoice } from '../context/VoiceContext';
import { useTabBarHeight } from '../theme/layout';
import { SPRING_CONTROL, SPRING_PANEL } from '../theme/motion';
import { Radius, Spacing, type Palette } from '../theme/tokens';
import { useThemedStyles, useColors } from '../theme/ThemeContext';

import { CallControlButton } from './CallControlButton';

/** How close to the screen edge the bubble is allowed to rest. */
const MARGIN = Spacing.md;

/** A finger has to travel this far before it counts as a drag and not a tap. */
const DRAG_THRESHOLD = 6;

/**
 * The call, minimised.
 *
 * Mounted at the root so it survives navigation — the whole point of a call is
 * that it keeps running while you go and read something else. Which is also the
 * problem it used to have: it was pinned above the tab bar, so on any screen
 * where something important sat at the bottom, the call bar was parked on top
 * of it and there was nothing you could do about it.
 *
 * So it moves. Drag it anywhere, let go, and it settles where you left it —
 * with a fling carrying its own momentum and the screen edges as the only
 * limit. Tapping it opens the call.
 *
 * A tap and a drag are told apart by distance rather than by time: the pan
 * refuses to activate inside `DRAG_THRESHOLD`, so a stationary finger always
 * reaches the button underneath it, and a moving one always takes the bubble.
 */
export function VoiceOverlay() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const {
    status,
    error,
    capabilities,
    activeRoomName,
    members,
    muted,
    isCameraOn,
    toggleMute,
    leave,
  } = useVoice();

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Where the bubble is, in screen coordinates. Position lives in a transform
  // rather than in `left`/`top` so the drag runs entirely on the UI thread and
  // keeps up with the finger while JS is busy.
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const held = useSharedValue(0);
  // Measured, not assumed: the pill's width depends on the room's name.
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  // Two values, not one: `placed` is a strict flag the layout handler reads
  // synchronously, `appear` is the animation. Driving both off one number means
  // a fade that has not finished reads as "not yet positioned".
  const placed = useSharedValue(0);
  const appear = useSharedValue(0);

  // How far it may travel on each axis, given its measured size. Returned as a
  // pair rather than as a clamp function because `withDecay` wants the bounds
  // themselves — and one definition of "the edges" is the point.
  const boundsX = useCallback((): [number, number] => {
    'worklet';
    return [MARGIN, Math.max(MARGIN, screenWidth - width.value - MARGIN)];
  }, [screenWidth, width]);

  const boundsY = useCallback((): [number, number] => {
    'worklet';
    const min = insets.top + MARGIN;
    return [min, Math.max(min, screenHeight - insets.bottom - height.value - MARGIN)];
  }, [screenHeight, insets.top, insets.bottom, height]);

  const clamp = (value: number, [min, max]: [number, number]) => {
    'worklet';
    return Math.min(Math.max(value, min), max);
  };

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const layout = event.nativeEvent.layout;
      width.value = layout.width;
      height.value = layout.height;

      if (placed.value) return;
      // It starts where it always used to live — just above the tab bar — so
      // the first thing a user sees is the bar they already know, and moving it
      // is something they discover rather than something they must do.
      x.value = (screenWidth - layout.width) / 2;
      y.value = screenHeight - tabBarHeight - layout.height - Spacing.sm;
      placed.value = 1;
      appear.value = withSpring(1, SPRING_PANEL);
    },
    [screenWidth, screenHeight, tabBarHeight, width, height, x, y, placed, appear],
  );

  // A rotation changes every bound at once, so anything now off-screen is
  // walked back into view rather than being stranded past the edge.
  useEffect(() => {
    if (!placed.value) return;
    x.value = withSpring(clamp(x.value, boundsX()), SPRING_PANEL);
    y.value = withSpring(clamp(y.value, boundsY()), SPRING_PANEL);
  }, [screenWidth, screenHeight, boundsX, boundsY, x, y, placed]);

  const pan = Gesture.Pan()
    .minDistance(DRAG_THRESHOLD)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
      held.value = withSpring(1, SPRING_CONTROL);
    })
    .onUpdate((event) => {
      x.value = startX.value + event.translationX;
      y.value = startY.value + event.translationY;
    })
    .onEnd((event) => {
      // Thrown, not dropped: the flick carries on and the edges stop it, with
      // a little give at the boundary so hitting one does not feel like a wall.
      x.value = withDecay({
        velocity: event.velocityX,
        clamp: boundsX(),
        rubberBandEffect: true,
      });
      y.value = withDecay({
        velocity: event.velocityY,
        clamp: boundsY(),
        rubberBandEffect: true,
      });
    })
    // On finalize rather than on end, so a cancelled gesture — a call arriving,
    // the app backgrounding mid-drag — still puts the bubble back down.
    .onFinalize(() => {
      held.value = withSpring(0, SPRING_CONTROL);
    });

  const bubbleStyle = useAnimatedStyle(() => ({
    // Invisible until it has been measured, so it never flashes in the top-left
    // corner on its way to where it belongs — then it springs in from there.
    opacity: appear.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      // Lifts under the finger — the one cue that says "this is yours to move".
      { scale: 0.9 + appear.value * 0.1 + held.value * 0.04 },
    ],
  }));

  if (status === 'idle') return null;

  const label =
    status === 'connected'
      ? capabilities.audio
        ? isCameraOn
          ? 'On video'
          : 'Connected'
        : 'Audio off'
      : status === 'failed'
        ? 'Disconnected'
        : status === 'reconnecting'
          ? 'Reconnecting…'
          : 'Connecting…';

  const statusColor =
    status === 'failed'
      ? c.danger
      : status === 'connected' && capabilities.audio
        ? isCameraOn
          ? c.accent
          : c.live
        : c.idle;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={onLayout}
        style={[styles.bubble, bubbleStyle]}
      >
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open the call screen"
            accessibilityHint="Press and drag to move this anywhere on screen"
            onPress={() => navigation.navigate('Call')}
            style={styles.info}
          >
            <View style={styles.statusRow}>
              <Radio size={12} color={statusColor} />
              <Text style={styles.statusText} numberOfLines={1}>
                {label.toUpperCase()}
              </Text>
              {members.length > 0 ? (
                <>
                  <Users size={11} color={c.textDim} />
                  <Text style={styles.count}>{members.length + 1}</Text>
                </>
              ) : null}
            </View>

            <Text style={styles.roomName} numberOfLines={1}>
              {activeRoomName ?? 'Voice room'}
            </Text>
          </Pressable>

          {/* Only the two you reach for without looking. Camera and deafen are
              one tap away on the call screen, and every control kept here is
              width the bubble cannot use to get out of the way. */}
          <CallControlButton
            accessibilityLabel={muted ? 'Unmute your microphone' : 'Mute your microphone'}
            tone={muted ? 'danger' : 'off'}
            surface="page"
            size={36}
            onPress={toggleMute}
          >
            {(color) => (muted ? <MicOff size={17} color={color} /> : <Mic size={17} color={color} />)}
          </CallControlButton>

          <CallControlButton
            accessibilityLabel="Leave the call"
            tone="disconnect"
            surface="page"
            size={36}
            onPress={() => void leave()}
          >
            {(color) => <PhoneOff size={17} color={color} />}
          </CallControlButton>
        </View>

        {error ? (
          <Text style={styles.error} numberOfLines={2}>
            {error}
          </Text>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  bubble: {
    position: 'absolute',
    // Anchored to the origin and moved by transform — `left`/`top` would have
    // to cross to the JS thread on every frame of the drag.
    top: 0,
    left: 0,
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: c.surfaceRaised,
    borderWidth: 1,
    borderColor: c.borderStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  // Capped rather than flexible: the bubble sizes to its content, and content
  // that grows to the screen's width is a bubble that can no longer be moved
  // out of the way sideways.
  info: {
    maxWidth: 150,
    paddingVertical: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusText: {
    color: c.textSubtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  count: {
    color: c.textDim,
    fontSize: 10,
    fontWeight: '800',
  },
  roomName: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
  },
  error: {
    maxWidth: 240,
    color: c.danger,
    fontSize: 11,
  },
});
