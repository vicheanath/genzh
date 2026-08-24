import React, { useCallback, useEffect } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SHEET_DISMISS_RATIO,
  SHEET_DISMISS_VELOCITY,
  SPRING_GESTURE,
  SPRING_PANEL,
  TIMING_FAST,
} from '../theme/motion';
import { Colors, Radius, Spacing } from '../theme/tokens';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Which edge it comes from.
   *
   * `bottom` for something you glance at and dismiss — it lands next to the
   * thumb rather than across the whole screen. `start` for navigation, which is
   * where a back-and-forth between places belongs.
   */
  side?: 'bottom' | 'start';
  /** Cap the panel's height, as a fraction of the screen. Bottom sheets only. */
  maxHeightRatio?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}

const SCREEN = Dimensions.get('window');

/**
 * A panel that slides in from an edge, and that you can throw back out.
 *
 * The drag is the point. A bottom sheet you can only close with a button is a
 * dialog wearing a grabber: people put a thumb on it and pull, and if nothing
 * follows the finger the control feels broken. The pan runs entirely on the UI
 * thread, so the panel tracks the finger even while the JS thread is busy
 * rendering the list inside it — which is exactly when a sheet is opened.
 *
 * Distance *and* velocity decide the release, because a short sharp flick means
 * "go away" just as clearly as a slow drag past halfway.
 */
export function Sheet({
  open,
  onOpenChange,
  side = 'bottom',
  maxHeightRatio = 0.9,
  children,
  style,
}: SheetProps) {
  const insets = useSafeAreaInsets();

  // How far the panel is pushed off-screen, in pixels: 0 is fully open, and the
  // closed resting place is its own extent.
  const closedAt = side === 'bottom' ? SCREEN.height * maxHeightRatio : SCREEN.width * 0.85;
  const offset = useSharedValue(closedAt);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    offset.value = withSpring(open ? 0 : closedAt, SPRING_PANEL);
  }, [open, closedAt, offset]);

  const pan = Gesture.Pan()
    // A sheet full of scrollable content must not steal the scroll: the drag
    // only takes over once the finger has clearly committed downward.
    .activeOffsetY(side === 'bottom' ? [-1000, 12] : [-1000, 1000])
    .activeOffsetX(side === 'start' ? [-12, 1000] : [-1000, 1000])
    .onUpdate((event) => {
      const travel = side === 'bottom' ? event.translationY : -event.translationX;
      // Dragging the wrong way is resisted rather than blocked, so the panel
      // still acknowledges the finger instead of feeling dead.
      offset.value = travel > 0 ? travel : travel / 4;
    })
    .onEnd((event) => {
      const travel = side === 'bottom' ? event.translationY : -event.translationX;
      const speed = side === 'bottom' ? event.velocityY : -event.velocityX;

      if (travel > closedAt * SHEET_DISMISS_RATIO || speed > SHEET_DISMISS_VELOCITY) {
        // Carrying the finger's velocity into the spring is what makes a flick
        // feel like it was thrown rather than merely released.
        offset.value = withSpring(closedAt, { ...SPRING_GESTURE, velocity: speed }, () => {
          runOnJS(close)();
        });
        return;
      }

      offset.value = withSpring(0, { ...SPRING_GESTURE, velocity: speed });
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform:
      side === 'bottom'
        ? [{ translateY: offset.value }]
        : [{ translateX: -offset.value }],
  }));

  // The scrim lightens as the panel is dragged away, so the drag reads as
  // "leaving" the whole time rather than only at the moment it lets go.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, closedAt], [1, 0], 'clamp'),
  }));

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          {/* The scrim closes on tap, which is the gesture people reach for
              before they look for a close button. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              side === 'bottom' ? styles.bottom : styles.start,
              side === 'bottom'
                ? {
                    maxHeight: SCREEN.height * maxHeightRatio,
                    paddingBottom: Math.max(insets.bottom, Spacing.lg),
                  }
                : { paddingTop: insets.top, paddingBottom: insets.bottom },
              panelStyle,
              style,
            ]}
          >
            {side === 'bottom' && <Grabber offset={offset} closedAt={closedAt} />}
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

/**
 * The handle at the top of a bottom sheet.
 *
 * It widens as the sheet is pulled down — a small piece of feedback that says
 * the gesture registered before the sheet has moved far enough to be obvious.
 */
function Grabber({
  offset,
  closedAt,
}: {
  offset: SharedValue<number>;
  closedAt: number;
}) {
  const style = useAnimatedStyle(() => ({
    width: interpolate(offset.value, [0, closedAt * 0.3], [38, 54], 'clamp'),
    opacity: withTiming(offset.value > 2 ? 1 : 0.7, TIMING_FAST),
  }));

  return <Animated.View style={[styles.grabber, style]} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  bottom: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  start: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '85%',
    maxWidth: 340,
    backgroundColor: Colors.sunken,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  grabber: {
    alignSelf: 'center',
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.borderStrong,
    marginBottom: Spacing.sm,
  },
});
