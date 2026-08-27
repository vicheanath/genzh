import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Hand, MicOff, Video } from 'lucide-react-native';

import { Avatar } from '../../components/Avatar';
import { RTCView } from '../../lib/livekit/runtime';
import { SPRING_CONTROL } from '../../theme/motion';
import { Radius, Spacing, Stage, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { SpeakingWave } from './SpeakingWave';
import type { CallTile } from './useCallRoster';

export type TileVariant = 'solo' | 'grid' | 'strip';

/**
 * One person on the stage.
 *
 * The same tile in three sizes, because it was three near-copies before: the
 * grid, the spotlight's filmstrip and the one-on-one view each rebuilt the
 * avatar, the name and the mute badge slightly differently, and they had
 * drifted — one showed a green "live" mic pill, one showed nothing, one put the
 * name in a different colour.
 *
 * Speaking is the accent and a glow, never a green ring. That is the same
 * signature "this is active" carries everywhere else in the app, and the stage
 * borrowing a stock video-call green was the single loudest thing breaking it.
 */
export function ParticipantTile({
  member,
  variant = 'grid',
  pinned = false,
  onPress,
}: {
  member: CallTile;
  variant?: TileVariant;
  /** Marks the tile the spotlight is currently on. */
  pinned?: boolean;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const press = useSharedValue(0);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.02 }],
  }));

  const strip = variant === 'strip';
  const videoStream = member.cameraOn ? (member.cameraStream ?? null) : null;
  const showsVideo = Boolean(RTCView && videoStream);
  const avatarSize = strip ? 44 : variant === 'solo' ? 92 : 64;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${member.name}${member.isSelf ? ', you' : ''}${
        member.muted ? ', muted' : ''
      }`}
      accessibilityState={{ selected: pinned }}
      onPress={onPress}
      disabled={!onPress}
      onPressIn={() => {
        press.value = withSpring(1, SPRING_CONTROL);
      }}
      onPressOut={() => {
        press.value = withSpring(0, SPRING_CONTROL);
      }}
      style={[
        styles.tile,
        strip ? styles.tileStrip : styles.tileFull,
        showsVideo && styles.tileVideo,
        member.speaking && styles.tileSpeaking,
        pinned && !member.speaking && styles.tilePinned,
        pressStyle,
      ]}
    >
      {showsVideo ? (
        <webrtcModule.RTCView
          streamURL={(member.cameraStream as any).toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          // You expect your own camera to behave like a mirror.
          mirror={member.isSelf}
        />
      ) : (
        <View style={styles.avatarWrap}>
          <Avatar
            url={member.avatarUrl}
            name={member.name}
            speaking={member.speaking}
            size={avatarSize}
            ringColor={Stage.surface}
          />
          {/* Only where there is room under the avatar for it. On a grid tile
              the accent border and the avatar's own ring already say this, and
              a third signal would collide with the name pill. */}
          {member.speaking && variant === 'solo' ? (
            <View style={styles.wave}>
              <SpeakingWave />
            </View>
          ) : null}
        </View>
      )}

      {member.handRaised ? (
        <View style={[styles.handTag, strip && styles.handTagStrip]}>
          <Hand size={strip ? 9 : 11} color={c.textInverted} />
          {!strip ? <Text style={styles.handText}>Hand raised</Text> : null}
        </View>
      ) : null}

      {strip ? (
        <>
          <Text style={styles.stripName} numberOfLines={1}>
            {member.name}
          </Text>
          {member.muted ? (
            <View style={styles.stripMuteBadge}>
              <MicOff size={9} color="#fff" />
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.footer}>
          {/* Glass rather than a flat black pill: it has to stay readable over
              a camera feed as well as over the tile's own surface. */}
          <View style={styles.namePill}>
            <Text style={styles.nameText} numberOfLines={1}>
              {member.name}
              {member.isSelf ? ' (You)' : ''}
            </Text>
          </View>

          <View style={styles.statusRow}>
            {member.muted ? (
              <View style={styles.mutedPill}>
                <MicOff size={11} color="#fff" />
              </View>
            ) : null}
            {member.cameraOn ? (
              <View style={styles.cameraPill}>
                <Video size={11} color={c.accentText} />
              </View>
            ) : null}
          </View>
        </View>
      )}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  tile: {
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Stage.surface,
    borderWidth: 1,
    borderColor: Stage.border,
    // The lit top edge, rule 3 — the tiles read as objects under one lamp
    // rather than as flat swatches.
    borderTopColor: Stage.borderStrong,
  },
  tileFull: {
    flex: 1,
    minHeight: 140,
    borderRadius: Radius.xxl,
  },
  tileStrip: {
    width: 68,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.lg,
  },
  // A tile showing a camera is the camera: the feed goes edge to edge and the
  // name tag floats over it.
  tileVideo: {
    backgroundColor: '#000',
  },
  tileSpeaking: {
    borderColor: c.accent,
    borderTopColor: c.accent,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  tilePinned: {
    borderColor: Stage.borderStrong,
  },
  avatarWrap: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  wave: {
    position: 'absolute',
    bottom: -22,
  },
  footer: {
    position: 'absolute',
    left: Spacing.sm,
    right: Spacing.sm,
    bottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  namePill: {
    flexShrink: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Stage.glass,
    borderWidth: 1,
    borderColor: Stage.glassBorder,
  },
  nameText: {
    color: Stage.text,
    fontSize: 11,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mutedPill: {
    padding: 4,
    borderRadius: Radius.full,
    backgroundColor: c.danger,
  },
  cameraPill: {
    padding: 4,
    borderRadius: Radius.full,
    backgroundColor: c.accentSubtle,
  },
  handTag: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: c.warning,
  },
  handTagStrip: {
    top: 2,
    left: 2,
    right: undefined,
    padding: 3,
  },
  handText: {
    color: c.textInverted,
    fontSize: 10,
    fontWeight: '800',
  },
  stripName: {
    marginTop: 4,
    paddingHorizontal: 4,
    color: Stage.textSubtle,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  stripMuteBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 2,
    borderRadius: Radius.full,
    backgroundColor: c.danger,
  },
});
