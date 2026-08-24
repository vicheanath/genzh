import { StyleSheet } from 'react-native';

import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/ThemeContext';

/**
 * The shared look of a settings panel.
 *
 * The web app's tabs all pull from one `settings.module.css`; this is the same
 * idea, so a heading in Profile and a heading in Blocked cannot drift apart.
 */
export const makePanel = (c: Palette) =>
  StyleSheet.create({
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.lg,
  },
  title: {
    color: c.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  description: {
    color: c.textSubtle,
    fontSize: 13,
    lineHeight: 19,
    marginTop: -Spacing.md,
  },
  section: {
    backgroundColor: c.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sectionTitle: {
    color: c.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fieldLabel: {
    color: c.textMuted,
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
    backgroundColor: c.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.lg,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
  },
  toggleSubtitle: {
    color: c.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  previewCard: {
    backgroundColor: c.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: c.border,
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
    borderColor: c.surface,
    marginBottom: Spacing.sm,
  },
  previewName: {
    color: c.text,
    fontSize: 17,
    fontWeight: '800',
  },
  previewHandle: {
    color: c.textSubtle,
    fontSize: 13,
  },
  previewBio: {
    color: c.textMuted,
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
    borderColor: c.text,
  },
  keyValue: {
    gap: 2,
  },
  key: {
    color: c.textSubtle,
    fontSize: 12,
    fontWeight: '700',
  },
  value: {
    color: c.text,
    fontSize: 14,
    fontWeight: '600',
  },
  code: {
    color: c.accentText,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  emptyNote: {
    color: c.textDim,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
});

/** The shared settings-panel sheet for the active theme. */
export const usePanel = () => useThemedStyles(makePanel);
