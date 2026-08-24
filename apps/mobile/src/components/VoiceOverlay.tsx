import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Radio, Users } from 'lucide-react-native';

import { useVoice } from '../context/VoiceContext';
import { VOICE_UNAVAILABLE_REASON } from '../lib/voiceSupport';
import { Colors, Radius, Spacing } from '../theme/tokens';

/**
 * The floating call bar.
 *
 * Mounted at the root so it survives navigation — the whole point of a call is
 * that it keeps running while you go and read something else.
 */
export function VoiceOverlay() {
  const {
    status,
    error,
    audioAvailable,
    activeRoomName,
    participants,
    muted,
    deafened,
    toggleMute,
    toggleDeafen,
    leaveRoom,
  } = useVoice();

  if (status === 'idle') return null;

  const label =
    status === 'connected'
      ? audioAvailable
        ? 'Voice connected'
        : 'In room · audio off'
      : status === 'error'
        ? 'Could not connect'
        : 'Connecting…';

  return (
    <Animated.View
      // The bar belongs to the call, not to the screen, so it slides in from
      // the edge it sits on and leaves the same way — it is arriving over the
      // app rather than being part of it.
      entering={SlideInDown.springify().damping(20).stiffness(220)}
      exiting={SlideOutDown.duration(180)}
      style={styles.container}
    >
      <View style={styles.row}>
        <View style={styles.info}>
          <View style={styles.indicatorRow}>
            <LiveDot
              live={status === 'connected' && audioAvailable}
              color={
                status === 'error'
                  ? Colors.danger
                  : status === 'connected' && audioAvailable
                    ? Colors.live
                    : Colors.idle
              }
            />
            <Text style={styles.statusText}>{label.toUpperCase()}</Text>

            {participants.length > 0 ? (
              <>
                <Users size={11} color={Colors.textDim} />
                <Text style={styles.count}>{participants.length + 1}</Text>
              </>
            ) : null}
          </View>

          <Text style={styles.roomName} numberOfLines={1}>
            {activeRoomName ?? 'Voice room'}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={muted ? 'Unmute' : 'Mute'}
            onPress={toggleMute}
            style={[styles.actionBtn, muted && styles.actionBtnActive]}
          >
            {muted ? (
              <MicOff size={17} color={Colors.danger} />
            ) : (
              <Mic size={17} color={Colors.text} />
            )}
          </Pressable>

          <Pressable
            accessibilityLabel={deafened ? 'Undeafen' : 'Deafen'}
            onPress={toggleDeafen}
            style={[styles.actionBtn, deafened && styles.actionBtnActive]}
          >
            {deafened ? (
              <HeadphoneOff size={17} color={Colors.danger} />
            ) : (
              <Headphones size={17} color={Colors.text} />
            )}
          </Pressable>

          <Pressable
            accessibilityLabel="Leave call"
            onPress={() => void leaveRoom()}
            style={styles.leaveBtn}
          >
            <PhoneOff size={17} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      {/* Said once, in the place the call actually is, rather than letting the
          bar imply audio that this build cannot carry. */}
      {status === 'connected' && !audioAvailable ? (
        <Text style={styles.note}>{VOICE_UNAVAILABLE_REASON}</Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Animated.View>
  );
}

/**
 * The transmission indicator.
 *
 * It breathes only while audio is actually flowing. A static icon cannot
 * distinguish "connected" from "in the room but silent", which is precisely the
 * distinction this build needs to make.
 */
function LiveDot({ live, color }: { live: boolean; color: string }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!live) {
      pulse.value = withTiming(1, { duration: 160 });
      return;
    }

    pulse.value = withRepeat(
      withTiming(0.45, {
        duration: 900,
        easing: Easing.inOut(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      true,
    );
  }, [live, pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={style}>
      <Radio size={13} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 68,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  info: {
    flex: 1,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusText: {
    color: Colors.textSubtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  count: {
    color: Colors.textDim,
    fontSize: 10,
    fontWeight: '800',
  },
  roomName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: Colors.dangerSubtle,
    borderColor: Colors.danger,
  },
  leaveBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    color: Colors.textDim,
    fontSize: 11,
    lineHeight: 15,
  },
  error: {
    color: Colors.danger,
    fontSize: 11,
  },
});
