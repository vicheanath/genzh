import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import {
  ApiError,
  communities as communitiesApi,
  type CommunityWithPermissions,
} from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Input } from '../../components/Input';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/useConfirm';
import { useAuth } from '../../context/AuthContext';

import type { CommunityAbilities } from './tabs';
import { usePanel } from './styles';

/**
 * Who the server is: name, icon, description, and the two irreversible things.
 *
 * Deleting lives here rather than in the nav. A destructive action is not a
 * place to go — it belongs at the bottom of the page it destroys, behind a
 * heading that says so.
 */
export function OverviewTab({
  community,
  abilities,
  onUpdated,
  onDeleted,
}: {
  community: CommunityWithPermissions;
  abilities: CommunityAbilities;
  onUpdated?: () => void;
  onDeleted?: () => void;
}) {
  const panel = usePanel();
  const { getToken } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? '');
  const [iconUrl, setIconUrl] = useState(community.icon_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = abilities.community;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await communitiesApi.update(await getToken(), community.id, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        icon_url: iconUrl.trim() || undefined,
      });
      toast.success('Server settings saved');
      onUpdated?.();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save server settings');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${community.name}?`,
      description:
        'Every channel and every message in them goes with it. This cannot be undone.',
      confirmLabel: 'Delete community',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await communitiesApi.delete(await getToken(), community.id);
      toast.success('Server deleted');
      onDeleted?.();
    } catch (cause) {
      toast.error('Could not delete server', cause instanceof ApiError ? cause.message : undefined);
    }
  }

  return (
    <ScrollView contentContainerStyle={panel.content} keyboardShouldPersistTaps="handled">
      <Text style={panel.title}>Overview</Text>
      <Text style={panel.description}>
        {editable
          ? 'How this server introduces itself, and how people get in.'
          : 'How this server introduces itself. You do not have permission to change it.'}
      </Text>

      {error ? <Callout tone="danger" text={error} /> : null}

      <View style={panel.identity}>
        <Avatar name={name || community.name} url={iconUrl || community.icon_url} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={panel.identityName} numberOfLines={1}>
            {name || community.name}
          </Text>
          <Text style={panel.identityMeta}>
            Created {new Date(community.created_at).toLocaleDateString()}
          </Text>
        </View>
      </View>

      <View style={panel.card}>
        <Input
          label="Server name"
          value={name}
          onChangeText={setName}
          placeholder="Enter a server name"
          maxLength={64}
          editable={editable}
        />

        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="What is this server about?"
          multiline
          numberOfLines={3}
          editable={editable}
        />

        <Input
          label="Icon URL"
          value={iconUrl}
          onChangeText={setIconUrl}
          placeholder="https://example.com/icon.png"
          autoCapitalize="none"
          editable={editable}
        />

        {editable ? (
          <Button title="Save changes" onPress={() => void save()} loading={saving} />
        ) : null}
      </View>

      <View style={panel.card}>
        <Text style={panel.cardTitle}>Invite code</Text>
        {/* The id is the invite, so it is shown in full rather than truncated —
            a code you have to select carefully is a code people paste wrong. */}
        <TextInput
          style={panel.code}
          value={community.id}
          editable={false}
          selectTextOnFocus
          multiline
        />
        <Text style={panel.listHint}>Long-press to select and copy.</Text>
      </View>

      {abilities.isOwner ? (
        <View style={panel.danger}>
          <Text style={panel.dangerTitle}>Danger zone</Text>
          <Text style={panel.dangerText}>
            Deleting the server removes every channel, message and membership. It cannot be
            undone.
          </Text>
          <Button
            title="Delete server"
            variant="danger"
            onPress={() => void remove()}
            icon={<Trash2 size={15} />}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
