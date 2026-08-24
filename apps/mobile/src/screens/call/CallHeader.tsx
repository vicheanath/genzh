import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, Users } from 'lucide-react-native';

import type { CallStatus } from '@genzh/shared';
import { Radius, Spacing, Stage, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

/** `mm:ss`, or `h:mm:ss` once a call has run past the hour. */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${pad(minutes)}:${pad(secs)}`;
}

/**
 * Where you are, and how to get out.
 *
 * Only three things: leave the call on screen, the room's name, and how many
 * people are in it. Everything that *does* something moved to the dock — a
 * header with two control clusters in it competes with the controls for
 * attention and loses, and the room name was being squeezed between them.
 */
export function CallHeader({
  roomName,
  status,
  duration,
  headcount,
  onMinimize,
  onOpenRoster,
}: {
  roomName: string;
  status: CallStatus;
  duration: number;
  headcount: number;
  onMinimize: () => void;
  onOpenRoster: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const connected = status === 'connected';

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Minimise the call and go back"
        onPress={onMinimize}
        style={styles.circleButton}
        hitSlop={8}
      >
        <ChevronDown size={20} color={Stage.text} />
      </Pressable>

      <View style={styles.center}>
        <Text style={styles.roomName} numberOfLines={1}>
          {roomName}
        </Text>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  status === 'failed'
                    ? c.danger
                    : connected
                      ? c.live
                      : c.warning,
              },
            ]}
          />
          <Text style={styles.metaText}>
            {status === 'failed'
              ? 'Connection lost'
              : status === 'reconnecting'
                ? 'Reconnecting…'
              : connected
                ? formatDuration(duration)
                : 'Connecting…'}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${headcount} in this call. Open the participant list`}
        onPress={onOpenRoster}
        style={styles.headcountPill}
        hitSlop={8}
      >
        <Users size={13} color={c.accentText} />
        <Text style={styles.headcountText}>{headcount}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Stage.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  roomName: {
    color: Stage.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
  },
  metaText: {
    color: Stage.textSubtle,
    fontSize: 12,
    fontWeight: '700',
    // Tabular-ish: the duration ticks once a second, and a proportional digit
    // makes the whole header twitch as it does.
    fontVariant: ['tabular-nums'],
  },
  headcountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: c.accentSubtle,
  },
  headcountText: {
    color: c.accentText,
    fontSize: 13,
    fontWeight: '800',
  },
});
