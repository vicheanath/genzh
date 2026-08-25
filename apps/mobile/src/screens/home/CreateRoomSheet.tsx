import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Lock, Sparkles } from 'lucide-react-native';
import { ApiError, useCreateStandaloneRoomMutation, type RoomType } from '@genzh/shared';

import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Sheet } from '../../components/Sheet';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { ROOM_CATEGORIES, ROOM_TYPES } from '../../lib/roomTypes';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

export interface CreateRoomSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** Where to go once the room exists. */
  onOpenRoom: (roomId: string, name: string, roomType: RoomType) => void;
}

/**
 * Start a standalone room — the playground's "moment", not a community channel.
 */
export function CreateRoomSheet({
  open,
  onClose,
  onCreated,
  onOpenRoom,
}: CreateRoomSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();
  const toast = useToast();
  const createMutation = useCreateStandaloneRoomMutation(token);

  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [selectedType, setSelectedType] = useState<RoomType>('text');
  const [category, setCategory] = useState('random');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setName('');
    setTopic('');
    setError(null);
    onClose();
  }

  async function handleCreate() {
    if (!name.trim()) return;

    setError(null);
    try {
      const room = await createMutation.mutateAsync({
        name: name.trim(),
        topic: topic.trim() || undefined,
        category,
        room_type: selectedType,
        is_anonymous: isAnonymous,
        duration_minutes: durationMinutes ? parseInt(durationMinutes, 10) : undefined,
      });

      toast.success(
        'Room created',
        isAnonymous ? 'Your anonymous identity is active.' : undefined,
      );
      onCreated?.();
      handleClose();
      onOpenRoom(room.id, room.name, room.room_type);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create room');
    }
  }


  return (
    <Sheet open={open} onOpenChange={(next) => !next && handleClose()}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.tag}>
          <Sparkles size={13} color={c.accent} />
          <Text style={styles.tagText}>Spontaneous social space</Text>
        </View>

        <Text style={styles.title}>Start a moment</Text>
        <Text style={styles.description}>
          Create an instant room to talk, debate, poll, or hang out with anyone anonymously.
        </Text>

        {error ? <Callout tone="danger" text={error} /> : null}

        <Input
          label="What’s happening?"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Unpopular opinions, Midnight talks…"
          maxLength={64}
        />

        <Input
          label="Topic (optional)"
          value={topic}
          onChangeText={setTopic}
          placeholder="A line about what this is for"
          maxLength={140}
        />

        <Text style={styles.label}>Experience type</Text>
        <View style={styles.typeGrid}>
          {ROOM_TYPES.map(({ type, label, icon: Icon }) => {
            const active = selectedType === type;
            return (
              <Pressable
                key={type}
                onPress={() => setSelectedType(type)}
                style={[styles.typeCard, active && styles.typeCardActive]}
              >
                <Icon size={18} color={active ? c.accent : c.textMuted} />
                <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Category</Text>
        <Select
          label="Category"
          value={category}
          onValueChange={setCategory}
          options={ROOM_CATEGORIES}
        />

        <Text style={styles.label}>Duration</Text>
        <Select
          label="Duration"
          value={durationMinutes}
          onValueChange={setDurationMinutes}
          options={[
            { value: '30', label: '30 minutes' },
            { value: '60', label: '1 hour' },
            { value: '180', label: '3 hours' },
            { value: '1440', label: '24 hours' },
          ]}
        />

        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <View style={styles.toggleTitleRow}>
              <Lock size={14} color={c.textMuted} />
              <Text style={styles.toggleTitle}>Anonymous identity</Text>
            </View>
            <Text style={styles.toggleDesc}>
              Mask real profiles with randomised aliases (e.g. NeonFox#4821).
            </Text>
          </View>
          <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
        </View>

        <View style={styles.footer}>
          <Button title="Cancel" variant="ghost" onPress={handleClose} style={styles.grow} />
          <Button
            title="Launch room"
            onPress={() => void handleCreate()}
            loading={createMutation.isPending}
            disabled={!name.trim()}
            style={styles.grow}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  content: {
    padding: Spacing.xl,
    paddingTop: Spacing.sm,
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
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  description: {
    color: c.textSubtle,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: Spacing.sm,
  },
  label: {
    color: c.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: Spacing.sm,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
  },
  typeCardActive: {
    borderColor: c.accent,
    backgroundColor: c.accentSubtle,
  },
  typeLabel: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  typeLabelActive: {
    color: c.text,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  toggleTitle: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
  },
  toggleDesc: {
    color: c.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  grow: {
    flex: 1,
  },
});
