import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Crown, UserMinus, X } from 'lucide-react-native';
import {
  ApiError,
  communities as communitiesApi,
  useCommunityDetailVM,
  DEFAULT_ACCENT,
  type CommunityWithPermissions,
  type Uuid,
} from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Input } from '../../components/Input';
import { Menu } from '../../components/Menu';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { useAppStore } from '../../lib/store';
import { usePresence } from '../../lib/usePresence';
import { useProfiles } from '../../lib/useProfiles';
import { Colors, Spacing } from '../../theme/tokens';

import { PanelList, PanelSkeleton } from './PanelList';
import type { CommunityAbilities } from './tabs';
import { panel } from './styles';

export function MembersTab({
  community,
  abilities,
}: {
  community: CommunityWithPermissions;
  abilities: CommunityAbilities;
}) {
  const { token, getToken } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { isOnline } = usePresence();
  const openProfile = useAppStore((s) => s.openProfile);

  const vm = useCommunityDetailVM(token, community.id);

  // Only fetched when there is something to do with it. Someone who cannot
  // assign roles has no reason to pay for the list.

  const [search, setSearch] = useState('');
  const [assignFor, setAssignFor] = useState<Uuid | null>(null);
  const lookup = useProfiles(vm.members.map((member) => member.user_id));

  async function assignRole(userId: Uuid, roleId: Uuid) {
    try {
      await communitiesApi.assignRole(await getToken(), community.id, userId, roleId);
      // Reloading is the point: the assignment used to succeed silently and
      // leave the row exactly as it was, which is indistinguishable from having
      // done nothing at all.
      void vm.refetchMembers();
      toast.success('Role assigned');
    } catch (cause) {
      toast.error('Could not assign role', cause instanceof ApiError ? cause.message : undefined);
    }
  }

  async function removeRole(userId: Uuid, roleId: Uuid, roleName: string, name: string) {
    try {
      await communitiesApi.removeRole(await getToken(), community.id, userId, roleId);
      void vm.refetchMembers();
      toast.success(`${roleName} removed from ${name}`);
    } catch (cause) {
      toast.error('Could not remove role', cause instanceof ApiError ? cause.message : undefined);
    }
  }

  async function remove(userId: Uuid, name: string) {
    const ok = await confirm({
      title: `Remove ${name}?`,
      description: `They lose access to ${community.name} and every channel in it. They can be invited back.`,
      confirmLabel: 'Remove member',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await communitiesApi.leave(await getToken(), community.id, userId);
      void vm.refetchMembers();
      toast.success('Member removed');
    } catch (cause) {
      toast.error('Could not remove member', cause instanceof ApiError ? cause.message : undefined);
    }
  }

  /** Roles this member could still be given. */
  function assignable(userId: Uuid) {
    const held = new Set(
      vm.members
        .find((member) => member.user_id === userId)
        ?.roles.map((role) => role.id) ?? [],
    );
    return vm.roles.filter((role) => !role.is_default && !held.has(role.id));
  }

  const needle = search.trim().toLowerCase();
  const filtered = vm.members.filter((member) => {
    if (!needle) return true;
    const profile = lookup(member.user_id);
    return (
      profile?.display_name.toLowerCase().includes(needle) ||
      profile?.handle.toLowerCase().includes(needle) ||
      member.nickname?.toLowerCase().includes(needle)
    );
  });

  const total = vm.members.length;

  return (
    <ScrollView contentContainerStyle={panel.content} keyboardShouldPersistTaps="handled">
      <Text style={panel.title}>Members</Text>
      <Text style={panel.description}>
        {total === 0
          ? 'Nobody here yet.'
          : `${total} ${total === 1 ? 'person' : 'people'} in this server.`}
      </Text>

      {total > 0 ? (
        <Input
          label="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="Name or handle"
        />
      ) : null}

      {vm.error ? <Callout tone="danger" text="Could not load members." /> : null}
      {vm.isLoading ? <PanelSkeleton rows={4} /> : null}

      <PanelList
        empty={!vm.isLoading && filtered.length === 0}
        emptyText={needle ? `Nobody matches “${search.trim()}”.` : 'No members yet.'}
      >
        {filtered.map((member) => {
          const profile = lookup(member.user_id);
          const name = member.nickname ?? profile?.display_name ?? 'Loading…';
          const isOwner = member.user_id === community.owner_id;

          return (
            <View key={member.user_id} style={panel.listItem}>
              <Pressable onPress={() => openProfile(member.user_id)}>
                <Avatar
                  name={name}
                  url={profile?.avatar_url}
                  accent={profile?.accent_color}
                  size={36}
                  presence={isOnline(member.user_id) ? 'online' : 'offline'}
                  ringColor={Colors.surface}
                />
              </Pressable>

              <View style={panel.listText}>
                <View style={panel.listLabelRow}>
                  <Text style={panel.listLabel} numberOfLines={1}>
                    {name}
                  </Text>
                  {isOwner ? <Crown size={13} color={Colors.warning} /> : null}
                </View>
                <Text style={panel.listHint} numberOfLines={1}>
                  @{profile?.handle ?? member.user_id.slice(0, 8)}
                </Text>

                {member.roles.length > 0 ? (
                  <View style={panel.roleChips}>
                    {member.roles.map((role) => {
                      const tint = role.color ?? DEFAULT_ACCENT;
                      return (
                        <View key={role.id} style={[panel.roleChip, { borderColor: tint }]}>
                          <Text style={[panel.roleChipText, { color: tint }]}>{role.name}</Text>
                          {abilities.roles ? (
                            <Pressable
                              accessibilityLabel={`Remove ${role.name} from ${name}`}
                              hitSlop={6}
                              onPress={() =>
                                void removeRole(member.user_id, role.id, role.name, name)
                              }
                            >
                              <X size={11} color={tint} />
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <View style={panel.listActions}>
                {/* Only what they do not already hold, and never `@everyone`,
                    which is not assignable — offering either would be a menu
                    item whose only outcome is a no-op or an error. */}
                {abilities.roles && assignable(member.user_id).length > 0 ? (
                  <Button
                    title="Role"
                    size="sm"
                    variant="secondary"
                    onPress={() => setAssignFor(member.user_id)}
                  />
                ) : null}

                {/* The owner cannot be removed — the server would be left
                    without one, and the API refuses it anyway. */}
                {abilities.members && !isOwner ? (
                  <Button
                    title=""
                    size="sm"
                    variant="ghost"
                    onPress={() => void remove(member.user_id, name)}
                    icon={<UserMinus size={16} color={Colors.textMuted} />}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </PanelList>

      <Menu
        open={assignFor !== null}
        onOpenChange={(open) => !open && setAssignFor(null)}
        title="Assign a role"
        items={(assignFor ? assignable(assignFor) : []).map((role) => ({
          key: role.id,
          label: role.name,
          icon: (
            <View
              style={[styles.menuDot, { backgroundColor: role.color ?? DEFAULT_ACCENT }]}
            />
          ),
          onPress: () => assignFor && void assignRole(assignFor, role.id),
        }))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  menuDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.xs,
  },
});
