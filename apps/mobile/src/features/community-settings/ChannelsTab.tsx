import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import {
  ApiError,
  useCommunityDetailVM,
  type CommunityWithPermissions,
  type RoomType,
  type Uuid,
} from '@genzh/shared';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { roomTypeIcon } from '../../lib/roomTypes';
import { useColors } from '../../theme/ThemeContext';

import { PanelList, PanelSkeleton } from './PanelList';
import type { CommunityAbilities } from './tabs';
import { usePanel } from './styles';

/**
 * What settings can create.
 *
 * The playful room types are made from the playground's create sheet, where the
 * thing being made is explained rather than listed in a dropdown.
 */
const CHANNEL_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'voice', label: 'Voice' },
  { value: 'video', label: 'Video' },
  { value: 'activity', label: 'Activity' },
] as const satisfies ReadonlyArray<{ value: RoomType; label: string }>;

export function ChannelsTab({
  community,
  abilities,
}: {
  community: CommunityWithPermissions;
  abilities: CommunityAbilities;
}) {
  const panel = usePanel();
  const c = useColors();
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const vm = useCommunityDetailVM(token, community.id);

  const [name, setName] = useState('');
  const [type, setType] = useState<RoomType>('text');
  const [topic, setTopic] = useState('');

  async function create() {
    if (!name.trim()) return;

    try {
      await vm.createRoom({
        name: name.trim(),
        room_type: type,
        topic: topic.trim() || undefined,
      });
      setName('');
      setTopic('');
      toast.success('Channel created');
    } catch (cause) {
      toast.error(
        'Could not create channel',
        cause instanceof ApiError ? cause.message : undefined,
      );
    }
  }

  async function remove(roomId: Uuid, roomName: string) {
    const ok = await confirm({
      title: `Delete #${roomName}?`,
      description: 'Its messages go with it. This cannot be undone.',
      confirmLabel: 'Delete channel',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await vm.deleteRoom(roomId);
      toast.success('Channel deleted');
    } catch (cause) {
      toast.error(
        'Could not delete channel',
        cause instanceof ApiError ? cause.message : undefined,
      );
    }
  }


  return (
    <ScrollView contentContainerStyle={panel.content} keyboardShouldPersistTaps="handled">
      <Text style={panel.title}>Channels</Text>
      <Text style={panel.description}>
        Every conversation in this server lives in one of these.
      </Text>

      {abilities.rooms ? (
        <View style={panel.card}>
          <Text style={panel.cardTitle}>New channel</Text>

          <Input
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. general"
            maxLength={64}
          />

          <Text style={panel.fieldLabel}>Type</Text>
          <Select
            label="Channel type"
            value={type}
            onValueChange={(next) => setType(next as RoomType)}
            options={CHANNEL_TYPES}
          />

          <Input
            label="Topic"
            value={topic}
            onChangeText={setTopic}
            placeholder="What is this channel for? (optional)"
            maxLength={200}
          />

          <Button
            title="Create channel"
            onPress={() => void create()}
            loading={vm.isCreatingRoom}
            disabled={!name.trim()}
            icon={<Plus size={15} color={c.accentContrast} />}
          />
        </View>
      ) : null}

      <Text style={panel.listHeading}>
        {vm.rooms.length > 0
          ? `${vm.rooms.length} channel${vm.rooms.length === 1 ? '' : 's'}`
          : 'Channels'}
      </Text>

      {vm.error ? <Callout tone="danger" text="Could not load channels." /> : null}
      {vm.isLoading ? <PanelSkeleton rows={4} /> : null}

      <PanelList
        empty={!vm.isLoading && vm.rooms.length === 0}
        emptyText="No channels yet. The first one is usually #general."
      >
        {vm.rooms.map((room) => {
          const Icon = roomTypeIcon(room.room_type);
          return (
            <View key={room.id} style={panel.listItem}>
              <View style={panel.roomIcon}>
                <Icon size={16} color={c.textMuted} />
              </View>

              <View style={panel.listText}>
                <View style={panel.listLabelRow}>
                  <Text style={panel.listLabel} numberOfLines={1}>
                    {room.name}
                  </Text>
                  <Badge text={room.room_type.replace('_', ' ')} tone="mint" />
                </View>
                {room.topic ? (
                  <Text style={panel.listHint} numberOfLines={1}>
                    {room.topic}
                  </Text>
                ) : null}
              </View>

              {abilities.rooms ? (
                <Button
                  title=""
                  size="sm"
                  variant="ghost"
                  onPress={() => void remove(room.id, room.name)}
                  icon={<Trash2 size={16} color={c.textMuted} />}
                />
              ) : null}
            </View>
          );
        })}
      </PanelList>
    </ScrollView>
  );
}
