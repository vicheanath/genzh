import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Button } from './Button';
import { Colors, Radius, Spacing } from '../theme/tokens';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Label for the confirming action. Omit for an informational dialog. */
  confirmLabel?: string;
  onConfirm?: () => void;
  confirmLoading?: boolean;
  confirmVariant?: 'primary' | 'danger';
  cancelLabel?: string;
  /** Hide the cancel button — for a dialog whose only exit is acknowledging. */
  hideCancel?: boolean;
}

/**
 * A modal dialog: a titled card over a scrim, with its actions at the foot.
 *
 * The card scales up from just under full size while the scrim fades. Arriving
 * at a scale rather than appearing whole gives the dialog somewhere to come
 * from, which is what stops a modal reading as the screen being replaced.
 *
 * Content is scrollable so a long body — a role's permission list, say — cannot
 * push the buttons off a small screen.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  confirmLoading,
  confirmVariant = 'primary',
  cancelLabel = 'Cancel',
  hideCancel,
}: DialogProps) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => onOpenChange(false)}
    >
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(140)}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenChange(false)} />

        <Animated.View
          entering={ZoomIn.springify().damping(20).stiffness(240)}
          exiting={ZoomOut.duration(140)}
          style={styles.popup}
        >
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}

          {children ? (
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : null}

          <View style={styles.actions}>
            {!hideCancel && (
              <Button
                title={cancelLabel}
                variant="secondary"
                style={styles.action}
                onPress={() => onOpenChange(false)}
              />
            )}
            {confirmLabel ? (
              <Button
                title={confirmLabel}
                variant={confirmVariant}
                loading={confirmLoading}
                style={styles.action}
                onPress={() => onConfirm?.()}
              />
            ) : null}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.66)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  popup: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  description: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: Spacing.xs,
  },
  body: {
    marginTop: Spacing.lg,
    maxHeight: 380,
  },
  bodyContent: {
    gap: Spacing.md,
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
