import { StyleSheet } from 'react-native';

import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/ThemeContext';

/** The shared look of a community-settings panel. */
export const makePanel = (c: Palette) =>
  StyleSheet.create({
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.md,
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
    marginTop: -Spacing.sm,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardTitle: {
    color: c.text,
    fontSize: 14,
    fontWeight: '800',
  },
  fieldLabel: {
    color: c.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  listHeading: {
    color: c.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.md,
  },
  listText: {
    flex: 1,
    gap: 2,
  },
  listLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  listLabel: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
  },
  listHint: {
    color: c.textSubtle,
    fontSize: 12,
  },
  listActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  empty: {
    color: c.textDim,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  identityName: {
    color: c.text,
    fontSize: 18,
    fontWeight: '800',
  },
  identityMeta: {
    color: c.textSubtle,
    fontSize: 12,
    marginTop: 2,
  },
  code: {
    color: c.accentText,
    fontFamily: 'monospace',
    fontSize: 12,
    padding: 0,
  },
  danger: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: c.danger,
    backgroundColor: c.dangerSubtle,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  dangerTitle: {
    color: c.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  dangerText: {
    color: c.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  roleDot: {
    width: 14,
    height: 14,
    borderRadius: Radius.full,
  },
  roleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  permission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.borderSubtle,
  },
  permissionText: {
    flex: 1,
  },
  permissionLabel: {
    color: c.text,
    fontSize: 13,
    fontWeight: '700',
  },
  permissionHint: {
    color: c.textSubtle,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  roomIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** The shared community-settings panel sheet for the active theme. */
export const usePanel = () => useThemedStyles(makePanel);
