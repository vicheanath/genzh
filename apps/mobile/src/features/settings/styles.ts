import { StyleSheet } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme/tokens';

/**
 * The shared look of a settings panel.
 *
 * The web app's tabs all pull from one `settings.module.css`; this is the same
 * idea, so a heading in Profile and a heading in Blocked cannot drift apart.
 */
export const panel = StyleSheet.create({
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.lg,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  description: {
    color: Colors.textSubtle,
    fontSize: 13,
    lineHeight: 19,
    marginTop: -Spacing.md,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sectionTitle: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fieldLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  toggleSubtitle: {
    color: Colors.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  previewCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  previewBanner: {
    height: 64,
  },
  previewBody: {
    alignItems: 'center',
    padding: Spacing.lg,
    paddingTop: 0,
    gap: 2,
  },
  previewAvatarWrap: {
    marginTop: -32,
    borderRadius: Radius.full,
    borderWidth: 4,
    borderColor: Colors.surface,
    marginBottom: Spacing.sm,
  },
  previewName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  previewHandle: {
    color: Colors.textSubtle,
    fontSize: 13,
  },
  previewBio: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: Colors.text,
  },
  keyValue: {
    gap: 2,
  },
  key: {
    color: Colors.textSubtle,
    fontSize: 12,
    fontWeight: '700',
  },
  value: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  code: {
    color: Colors.accentText,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  emptyNote: {
    color: Colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
});
