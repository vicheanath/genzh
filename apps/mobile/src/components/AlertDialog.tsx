import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Button } from './Button';
import { Radius, Spacing, type Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything that destroys data. */
  tone?: 'default' | 'danger';
  onConfirm?: () => void;
}

/**
 * A dialog that interrupts to ask something you cannot undo.
 *
 * Distinct from `Dialog` in the one way that matters: it has no dismiss path
 * other than the two buttons. There is no scrim press to cancel and no
 * `onRequestClose` shortcut — which is the entire reason to use it for "delete
 * this community" rather than a regular dialog with scarier words in it.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
}: AlertDialogProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      // Android's back button is the one dismissal that cannot be taken away;
      // it answers the same as Cancel rather than leaving the caller hanging.
      onRequestClose={() => onOpenChange(false)}
    >
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(140)}
        style={styles.backdrop}
      >
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(100)}
          style={styles.popup}
        >
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          {children}

          <View style={styles.actions}>
            <Button
              title={cancelLabel}
              variant="secondary"
              style={styles.action}
              onPress={() => onOpenChange(false)}
            />
            <Button
              title={confirmLabel}
              variant={tone === 'danger' ? 'danger' : 'primary'}
              style={styles.action}
              onPress={() => {
                onConfirm?.();
                onOpenChange(false);
              }}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  popup: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: c.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.xl,
  },
  title: {
    color: c.text,
    fontSize: 17,
    fontWeight: '800',
  },
  description: {
    color: c.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  action: {
    minWidth: 96,
  },
});
