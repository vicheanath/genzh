import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ApiError, useBlockedUsersVM, type Uuid } from '@genzh/shared';

import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { UserRow } from '../../components/UserRow';
import { useAuth } from '../../context/AuthContext';
import { useProfiles } from '../../lib/useProfiles';

import { useSubmission } from './useSubmission';
import { panel } from './styles';

/** Blocked users cannot send you friend requests or reach you directly. */
export function BlockedTab() {
  const { token } = useAuth();
  const toast = useToast();
  const submit = useSubmission();
  const [userId, setUserId] = useState('');

  // The list is fetched, not accumulated: anyone blocked before this screen was
  // opened has to be here too, or there is no way to undo it. The local mirror
  // this used to keep alongside it is gone — the mutations invalidate the
  // query, so there is one list and it is always the server's.
  const blockedVM = useBlockedUsersVM(token);
  const current = blockedVM.blockedUsers;
  const lookup = useProfiles(current);

  async function handleBlock() {
    const targetId = userId.trim();
    if (!targetId) return;

    const done = await submit.run(async () => {
      await blockedVM.blockUser(targetId);
      return true;
    });
    if (!done) return;

    setUserId('');
    toast.success('User blocked', 'They can no longer reach you.');
  }

  async function handleUnblock(id: Uuid) {
    try {
      await blockedVM.unblockUser(id);
      toast.success('User unblocked');
    } catch (cause) {
      toast.error(
        'Could not unblock',
        cause instanceof ApiError ? cause.message : undefined,
      );
    }
  }

  return (
    <ScrollView contentContainerStyle={panel.content} keyboardShouldPersistTaps="handled">
      <Text style={panel.title}>Blocked users</Text>
      <Text style={panel.description}>
        Blocked users cannot send you friend requests or reach you directly.
      </Text>

      {submit.error ? <Callout tone="danger" text={submit.error} /> : null}
      {blockedVM.error ? (
        <Callout tone="danger" text="Could not load your blocked list." />
      ) : null}

      <View style={panel.section}>
        <Input
          label="User ID to block"
          value={userId}
          onChangeText={setUserId}
          placeholder="Paste a user ID…"
          autoCapitalize="none"
        />
        <Button
          title="Block"
          variant="danger"
          onPress={handleBlock}
          loading={submit.busy}
          disabled={!userId.trim()}
        />
      </View>

      <View style={panel.section}>
        <Text style={panel.sectionTitle}>Blocked</Text>

        {blockedVM.isLoading ? <Spinner /> : null}

        {!blockedVM.isLoading && current.length === 0 ? (
          <Text style={panel.emptyNote}>You haven’t blocked anyone.</Text>
        ) : null}

        {current.map((id) => {
          const profile = lookup(id);
          return (
            <UserRow
              key={id}
              name={profile?.display_name ?? id}
              avatarUrl={profile?.avatar_url}
              accentColor={profile?.accent_color}
              secondary={`@${profile?.handle ?? id.slice(0, 8)}`}
              size="sm"
              actions={
                <Button
                  title="Unblock"
                  size="sm"
                  variant="secondary"
                  onPress={() => void handleUnblock(id)}
                />
              }
            />
          );
        })}
      </View>
    </ScrollView>
  );
}
