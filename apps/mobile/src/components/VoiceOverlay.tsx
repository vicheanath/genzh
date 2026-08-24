import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Users,
  Video,
  VideoOff,
} from 'lucide-react-native';

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
    isCameraOn,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    leaveRoom,
  } = useVoice();

  const insets = useSafeAreaInsets();
  const bottomOffset = 64 + Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 16);

  const navigation = useNavigation<any>();

  if (status === 'idle') return null;

  const label =
    status === 'connected'
      ? audioAvailable
        ? isCameraOn
          ? 'Video call active'
          : 'Voice connected'
        : 'In room · audio off'
      : status === 'error'
        ? 'Could not connect'
        : 'Connecting…';

  return (
    <Animated.View
      entering={SlideInDown.duration(180)}
      exiting={SlideOutDown.duration(150)}
      style={[styles.container, { bottom: bottomOffset }]}
    >
      <View style={styles.row}>
        <Pressable
          accessibilityLabel="Open call screen"
          onPress={() => navigation.navigate('Call')}
          style={styles.info}
        >
          <View style={styles.indicatorRow}>
            <View style={styles.dotWrapper}>
              <Radio
                size={13}
                color={
                  status === 'error'
                    ? Colors.danger
                    : status === 'connected' && audioAvailable
                      ? isCameraOn
                        ? Colors.accent
                        : Colors.live
                      : Colors.idle
                }
              />
            </View>
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
        </Pressable>

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
            accessibilityLabel={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            onPress={() => void toggleCamera()}
            style={[styles.actionBtn, isCameraOn && styles.actionBtnCameraActive]}
          >
            {isCameraOn ? (
              <Video size={17} color={Colors.accent} />
            ) : (
              <VideoOff size={17} color={Colors.textDim} />
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

      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  dotWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
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
  actionBtnCameraActive: {
    backgroundColor: Colors.accentSubtle,
    borderColor: Colors.accent,
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
