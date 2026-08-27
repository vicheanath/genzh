import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Lock, User } from 'lucide-react-native';
import { rooms as roomsApi } from '@genzh/shared';

import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { Radius, Spacing, Stage, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

export interface PersonaToggleProps {
  roomId: string;
  isAnonymous: boolean;
  onToggle?: (isAnonymous: boolean) => void;
}

/**
 * Toggle between anonymous and real profile in a call.
 * Shows current persona with ability to switch.
 */
export function PersonaToggle({ roomId, isAnonymous, onToggle }: PersonaToggleProps) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token, getToken } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (loading) return;

    setLoading(true);
    try {
      const newAnonymous = !isAnonymous;
      await roomsApi.setPersona(await getToken(), roomId, newAnonymous);
      onToggle?.(newAnonymous);
      toast.success(
        newAnonymous ? 'Switched to anonymous' : 'Now showing your real profile',
      );
    } catch (err) {
      toast.error('Could not change profile type');
    } finally {
      setLoading(false);
    }
  }

  const Icon = isAnonymous ? Lock : User;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={`Toggle profile type: currently ${isAnonymous ? 'anonymous' : 'public'}`}
      accessibilityState={{ checked: isAnonymous }}
      onPress={() => void handleToggle()}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      disabled={loading}
    >
      <Icon size={16} color={Stage.text} />
      <Text style={styles.label}>{isAnonymous ? 'Anonymous' : 'You'}</Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 40,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.full,
      backgroundColor: Stage.control,
    },
    pressed: {
      opacity: 0.8,
    },
    label: {
      color: Stage.text,
      fontSize: 13,
      fontWeight: '600',
    },
  });
