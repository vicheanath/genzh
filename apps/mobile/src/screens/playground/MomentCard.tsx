import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ChevronUp, Clock, Radio, Users } from 'lucide-react-native';
import { hueFor, type FeedRoom } from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { roomTypeIcon, roomTypeLabel } from '../../lib/roomTypes';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/ThemeContext';

/** How many faces fit on a card before the rest become a "+n". */
const FACES_SHOWN = 4;

/**
 * How long is left, as a phrase rather than a clock.
 *
 * A throwaway room's deadline is a mood, not an appointment: "12m left" tells
 * you to hurry, `00:11:47` tells you to watch a timer. Nothing here counts
 * seconds, so the caller can tick this once a minute.
 */
function remaining(expiresAt: string | null | undefined, now: number): string | null {
  if (!expiresAt) return null;

  const ms = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(ms) || ms <= 0) return 'ending';

  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'ends in <1m';
  if (minutes < 60) return `ends in ${minutes}m`;

  const hours = Math.round(minutes / 60);
  return `ends in ${hours}h`;
}

export interface MomentCardProps {
  room: FeedRoom;
  /** Exact page height, so one card is one swipe. */
  height: number;
  /** Room space to keep clear at the top for the status bar. */
  topInset: number;
  /** Room space to keep clear at the bottom for the tab bar. */
  bottomInset: number;
  /** Whether this is the card currently on screen. */
  active: boolean;
  /** Whether another card exists below this one. */
  hasNext: boolean;
  onJoin: () => void;
  onNext: () => void;
}

/**
 * One room, as one full-screen page of the feed.
 *
 * Everything on it answers a single question — would you walk into this room —
 * so it carries what a stranger needs to decide and nothing that only matters
 * once you are inside. The name, who is already there, how long it has left,
 * and one button.
 *
 * The ground is generated from the room's own name rather than picked or
 * uploaded: a throwaway room lives minutes, and asking whoever made it for
 * cover art would leave the feed grey.
 */
export function MomentCard({
  room,
  height,
  topInset,
  bottomInset,
  active,
  hasNext,
  onJoin,
  onNext,
}: MomentCardProps) {
  const styles = useThemedStyles(makeStyles);

  // Ticks once a minute, and only for the card you are looking at — twenty
  // off-screen cards counting down is twenty timers for nothing.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [active]);

  // Hued off the id rather than the name: a uuid spreads evenly over the wheel
  // where short names clump, and the room looks the same to everybody and after
  // a rename. Two neighbours still land on a similar hue now and then — the
  // content is what tells them apart.
  const hue = hueFor(room.id);
  const gradientId = `ground-${room.id}`;
  const Glyph = roomTypeIcon(room.room_type);
  const countdown = remaining(room.expires_at, now);
  const live = room.current_participants;

  const faces = room.faces.slice(0, FACES_SHOWN);
  const overflow = Math.max(0, live - faces.length);
  const hostName = room.host?.display_name ?? room.host?.handle ?? null;

  return (
    <View style={[styles.page, { height }]}>
      {/* The ground. An SVG gradient rather than a native gradient module:
          the room's hue is the only art a minutes-long room will ever have,
          and react-native-svg is already a dependency. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          {/* The id has to be the room's own. react-native-svg resolves
              `url(#…)` against a shared registry, so twenty cards all naming
              their gradient "ground" would every one of them paint with
              whichever card mounted first. */}
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0" stopColor={`hsl(${hue}, 62%, 26%)`} />
            <Stop offset="0.55" stopColor={`hsl(${(hue + 28) % 360}, 55%, 15%)`} />
            <Stop offset="1" stopColor="#0d0d0b" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>

      <View
        style={[
          styles.body,
          { paddingTop: topInset + Spacing.md, paddingBottom: bottomInset + Spacing.lg },
        ]}
      >
        {/* Only the two facts that change per card. The mode switch and the
            create button float above the whole feed instead, because they
            belong to the screen rather than to whichever room is under them. */}
        <View style={styles.top}>
          <View style={styles.chips}>
            {live > 0 && (
              <View style={[styles.chip, styles.liveChip]}>
                <Radio size={12} color="#0f1202" />
                <Text style={styles.liveChipText}>{live} live</Text>
              </View>
            )}
            {countdown && (
              <View style={styles.chip}>
                <Clock size={12} color="rgba(255,255,255,0.9)" />
                <Text style={styles.chipText}>{countdown}</Text>
              </View>
            )}
          </View>
        </View>

        <Animated.View
          key={room.id}
          entering={active ? FadeInDown.duration(320) : undefined}
          style={styles.middle}
        >
          <View style={styles.typeRow}>
            <Glyph size={16} color="rgba(255,255,255,0.92)" />
            <Text style={styles.typeText}>{roomTypeLabel(room.room_type)}</Text>
            {room.is_anonymous && <Text style={styles.typeText}>· anonymous</Text>}
          </View>

          <Text style={styles.name} numberOfLines={3}>
            {room.name}
          </Text>

          {room.topic ? (
            <Text style={styles.topic} numberOfLines={3}>
              {room.topic}
            </Text>
          ) : null}

          {hostName ? (
            <View style={styles.hostRow}>
              <Avatar
                name={hostName}
                url={room.host?.avatar_url}
                accent={room.host?.accent_color}
                size={24}
                ringColor="transparent"
              />
              <Text style={styles.hostText} numberOfLines={1}>
                started by {hostName}
              </Text>
            </View>
          ) : null}
        </Animated.View>

        <View style={styles.bottom}>
          {faces.length > 0 ? (
            <View style={styles.faces}>
              <View style={styles.faceStack}>
                {faces.map((person, index) => (
                  <View
                    key={person.id}
                    // Overlapped rather than spaced: a row of faces reads as a
                    // group, a row of separate avatars reads as a list.
                    style={[styles.face, index > 0 && styles.faceOverlapped]}
                  >
                    <Avatar
                      name={person.display_name || person.handle}
                      url={person.avatar_url}
                      accent={person.accent_color}
                      size={30}
                      ringColor="#0d0d0b"
                    />
                  </View>
                ))}
              </View>
              <Text style={styles.facesText} numberOfLines={1}>
                {overflow > 0 ? `+${overflow} more inside` : 'inside right now'}
              </Text>
            </View>
          ) : (
            <View style={styles.faces}>
              <Users size={15} color="rgba(255,255,255,0.72)" />
              <Text style={styles.facesText}>Empty — be the first one in</Text>
            </View>
          )}

          <Button title="Join the room" onPress={onJoin} size="lg" />

          {hasNext ? (
            <Animated.View entering={FadeIn.delay(500)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show the next room"
                onPress={onNext}
                style={styles.nextHint}
              >
                <ChevronUp size={14} color="rgba(255,255,255,0.66)" />
                <Text style={styles.nextHintText}>Swipe up for the next moment</Text>
              </Pressable>
            </Animated.View>
          ) : (
            <View style={styles.nextHint}>
              <Text style={styles.nextHintText}>That is everything happening right now</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (_c: Palette) =>
  StyleSheet.create({
    page: {
      width: '100%',
      overflow: 'hidden',
    },
    body: {
      flex: 1,
      paddingHorizontal: Spacing.lg,
      justifyContent: 'space-between',
    },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    chips: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flexShrink: 1,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(12, 12, 10, 0.5)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.18)',
    },
    chipText: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: 12,
      fontWeight: '700',
    },
    // The one thing on the card allowed to shout: whether anybody is in there.
    liveChip: {
      backgroundColor: '#bae310',
      borderColor: '#bae310',
    },
    liveChipText: {
      color: '#0f1202',
      fontSize: 12,
      fontWeight: '800',
    },
    middle: {
      gap: Spacing.md,
      paddingVertical: Spacing.xl,
    },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    typeText: {
      color: 'rgba(255,255,255,0.86)',
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.3,
      textTransform: 'lowercase',
    },
    name: {
      color: '#fff',
      fontSize: 38,
      lineHeight: 42,
      fontWeight: '800',
      letterSpacing: -0.8,
    },
    topic: {
      color: 'rgba(255,255,255,0.78)',
      fontSize: 16,
      lineHeight: 22,
    },
    hostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.xs,
    },
    hostText: {
      color: 'rgba(255,255,255,0.74)',
      fontSize: 13,
      fontWeight: '600',
      flexShrink: 1,
    },
    bottom: {
      gap: Spacing.md,
    },
    faces: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    faceStack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    face: {
      borderRadius: Radius.full,
    },
    faceOverlapped: {
      marginLeft: -10,
    },
    facesText: {
      color: 'rgba(255,255,255,0.74)',
      fontSize: 13,
      fontWeight: '600',
      flexShrink: 1,
    },
    nextHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingTop: Spacing.xs,
    },
    nextHintText: {
      color: 'rgba(255,255,255,0.66)',
      fontSize: 12,
      fontWeight: '600',
    },
  });
