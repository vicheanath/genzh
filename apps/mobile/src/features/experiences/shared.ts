import { StyleSheet } from 'react-native';
import { messages as messagesApi, type RoomWithPermissions } from '@genzh/shared';

import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/ThemeContext';

/**
 * Publish an experience's state into the room's transcript.
 *
 * Every experience is a live card that only the people looking at it can see;
 * this is how a poll result or a debate standing becomes part of the room's
 * history. The socket echoes the stored message back, so nothing is appended
 * locally — posting once is enough.
 */
export async function postToChat(
  room: RoomWithPermissions,
  token: string,
  content: string,
): Promise<void> {
  await messagesApi.post(token, room.id, content, room.is_anonymous);
}

/** The shared look of an experience card. */
export const makeExp = (c: Palette) =>
  StyleSheet.create({
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: c.accentSubtle,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  tagText: {
    color: c.accentText,
    fontSize: 11,
    fontWeight: '800',
  },
  title: {
    color: c.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: c.textSubtle,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: {
    color: c.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  grow: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chipActive: {
    borderColor: c.accent,
    backgroundColor: c.accentSubtle,
  },
  chipText: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: c.accentText,
  },
  timer: {
    color: c.text,
    fontSize: 34,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
});

/** The shared experience-card sheet for the active theme. */
export const useExp = () => useThemedStyles(makeExp);
