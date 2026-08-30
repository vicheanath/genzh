import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Lock, Users } from 'lucide-react-native';
import type { Reason, Room, RoomType } from '@genzh/shared';

import { RecommendationReason } from '../../features/recommendations/RecommendationReason';
import { roomTypeIcon, roomTypeLabel } from '../../lib/roomTypes';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

export interface RoomCardProps {
  room: Room;
  onPress: (id: string, name: string, roomType: RoomType) => void;
  /**
   * Why this room was suggested, when it was suggested rather than found.
   *
   * Absent for the trending list, which is a popularity ranking and has nothing
   * personal to say about why you are looking at it.
   */
  reasons?: Reason[];
  /** Lifts the card for the "For you" rail, where it is the ranked thing. */
  highlighted?: boolean;
}

/**
 * One room, as a card.
 *
 * Extracted because the browse screen now draws two lists of rooms — the ranked
 * one and the trending one — and they were one copy-paste away from disagreeing
 * about what a room card is. The only difference between them is the reason
 * line and the border, both of which are props here.
 */
export function RoomCard({ room, onPress, reasons, highlighted }: RoomCardProps) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const Icon = roomTypeIcon(room.room_type);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${room.name}, ${roomTypeLabel(room.room_type)}, ${
        room.current_participants || 1
      } inside`}
      onPress={() => onPress(room.id, room.name, room.room_type)}
      style={({ pressed }) => [
        styles.card,
        highlighted && styles.highlighted,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.head}>
        <View style={styles.typeTag}>
          <Icon size={13} color={c.accent} />
          <Text style={styles.typeText}>{roomTypeLabel(room.room_type)}</Text>
        </View>
        <View style={styles.participants}>
          <Users size={12} color={c.textDim} />
          <Text style={styles.participantsText}>{room.current_participants || 1}</Text>
        </View>
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {room.name}
      </Text>
      <Text style={styles.topic} numberOfLines={2}>
        {room.topic || `Join this ${room.category} session and chat anonymously.`}
      </Text>

      {reasons ? <RecommendationReason reasons={reasons} /> : null}

      <View style={styles.footer}>
        <View style={styles.pill}>
          {room.is_anonymous ? <Lock size={11} color={c.textMuted} /> : null}
          <Text style={styles.pillText}>{room.is_anonymous ? 'Anonymous' : 'Public'}</Text>
        </View>
        <Text style={styles.enter}>Enter →</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      padding: Spacing.lg,
      gap: Spacing.sm,
    },
    highlighted: {
      borderColor: c.accentSubtleHover,
      backgroundColor: c.surfaceRaised,
    },
    pressed: {
      opacity: 0.75,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    typeTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      backgroundColor: c.accentSubtle,
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
    },
    typeText: {
      color: c.accentText,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    participants: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    participantsText: {
      color: c.textDim,
      fontSize: 12,
      fontWeight: '700',
    },
    name: {
      color: c.text,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    topic: {
      color: c.textSubtle,
      fontSize: 13,
      lineHeight: 18,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.xs,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      backgroundColor: c.surfaceMuted,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
    },
    pillText: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    enter: {
      color: c.accentText,
      fontSize: 13,
      fontWeight: '800',
    },
  });
