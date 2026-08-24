import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Ban,
  Check,
  MessageSquare,
  MoreHorizontal,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native';
import {
  ApiError,
  formatRelative,
  useBlockedUsersVM,
  useFriendsVM,
  rooms as roomsApi,
  type Uuid,
} from '@genzh/shared';

import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { EmptyState } from '../../components/EmptyState';
import { Input } from '../../components/Input';
import { Menu } from '../../components/Menu';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SkeletonRows } from '../../components/Skeleton';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { UserRow } from '../../components/UserRow';
import { useConfirm } from '../../components/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { useAppStore, type FriendTab } from '../../lib/store';
import { usePresence } from '../../lib/usePresence';
import { useProfiles } from '../../lib/useProfiles';
import { Colors, Radius, Spacing } from '../../theme/tokens';

/**
 * Friends: online, all, pending both ways, blocked, and adding by user ID.
 *
 * This screen used to render a hardcoded Sophia and Marcus. Every list here is
 * now the real endpoint, and the Online tab filters on the presence set rather
 * than drawing a green dot on everybody.
 */
export function FriendsScreen({ navigation }: any) {
  const { token, getToken, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { isOnline } = usePresence();

  const tab = useAppStore((s) => s.friendsTab);
  const setTab = useAppStore((s) => s.setFriendsTab);
  const openProfile = useAppStore((s) => s.openProfile);

  const [search, setSearch] = useState('');
  const [addId, setAddId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<Uuid | null>(null);

  // Four hand-rolled fetches became two view models. The optimistic block list
  // below goes with them: the mutations invalidate their own caches, so the
  // list corrects itself instead of being patched by hand.
  const friendsVM = useFriendsVM(token);
  const blockedVM = useBlockedUsersVM(token);

  const blockedUsers = blockedVM.blockedUsers;

  const allIds = [
    ...friendsVM.friendIds,
    ...friendsVM.pendingRequests.map((r) => r.requester_id),
    ...friendsVM.sentRequests.map((r) => r.addressee_id),
    ...blockedUsers,
  ];
  const lookup = useProfiles(allIds);

  const refresh = friendsVM.refresh;

  async function openDM(friendId: Uuid) {
    try {
      const room = await roomsApi.openDM(await getToken(), friendId);
      navigation.navigate('RoomChat', {
        roomId: room.id,
        roomName: lookup(friendId)?.display_name ?? room.name,
      });
    } catch {
      toast.error('Could not start direct chat');
    }
  }

  async function sendRequest() {
    const id = addId.trim();
    if (!id) return;

    setError(null);
    setBusy(true);
    try {
      await friendsVM.sendFriendRequest(id);
      setAddId('');
      toast.success('Friend request sent');
      refresh();
      setTab('pending');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send request');
    } finally {
      setBusy(false);
    }
  }

  async function respond(requesterId: Uuid, accept: boolean) {
    try {
      if (accept) await friendsVM.acceptFriendRequest(requesterId);
      else await friendsVM.declineFriendRequest(requesterId);
      toast.success(accept ? 'Friend request accepted' : 'Friend request declined');
      refresh();
    } catch (cause) {
      toast.error(
        'Could not respond to request',
        cause instanceof ApiError ? cause.message : undefined,
      );
    }
  }

  async function removeFriend(friendId: Uuid) {
    const ok = await confirm({
      title: 'Remove this friend?',
      description:
        'You will both drop off each other’s friend list. Either of you can send a new request later.',
      confirmLabel: 'Remove friend',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await friendsVM.removeFriend(friendId);
      toast.success('Friend removed');
      refresh();
    } catch (cause) {
      toast.error('Could not remove friend', cause instanceof ApiError ? cause.message : undefined);
    }
  }

  async function blockUser(otherId: Uuid) {
    try {
      await blockedVM.blockUser(otherId);
      toast.success('User blocked', 'They can no longer message or interact with you.');
      refresh();
    } catch (cause) {
      toast.error('Could not block user', cause instanceof ApiError ? cause.message : undefined);
    }
  }

  async function unblockUser(otherId: Uuid) {
    try {
      await blockedVM.unblockUser(otherId);
      toast.success('User unblocked');
      refresh();
    } catch (cause) {
      toast.error('Could not unblock user', cause instanceof ApiError ? cause.message : undefined);
    }
  }

  // Both directions: a request you sent is as pending as one you received, and
  // the sender otherwise has no way to see theirs at all.
  const pendingCount = friendsVM.pendingRequests.length + friendsVM.sentRequests.length;

  const filteredFriends = friendsVM.friendIds.filter((friendId) => {
    if (tab === 'online' && !isOnline(friendId)) return false;
    if (!search) return true;

    const profile = lookup(friendId);
    const query = search.toLowerCase();
    return (
      profile?.display_name.toLowerCase().includes(query) ||
      profile?.handle.toLowerCase().includes(query) ||
      friendId.toLowerCase().includes(query)
    );
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Friends"
        below={
          <View style={styles.strip}>
            <Tabs
              value={tab}
              onValueChange={(next) => setTab(next as FriendTab)}
              scrollable
              items={[
                { value: 'online', label: 'Online' },
                { value: 'all', label: 'All', badge: friendsVM.friendIds.length || undefined },
                { value: 'pending', label: 'Pending', badge: pendingCount || undefined },
                { value: 'blocked', label: 'Blocked', badge: blockedUsers.length || undefined },
                { value: 'add', label: 'Add friend' },
              ]}
            />
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab !== 'add' && (
          <View style={styles.searchWrap}>
            <Search size={16} color={Colors.textDim} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search friends…"
              placeholderTextColor={Colors.textDim}
            />
          </View>
        )}

        {(tab === 'all' || tab === 'online') && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {tab === 'online' ? 'Online' : 'All friends'} — {filteredFriends.length}
            </Text>

            {friendsVM.isLoading ? <SkeletonRows rows={3} /> : null}

            {!friendsVM.isLoading && filteredFriends.length === 0 ? (
              <EmptyState
                icon={<Users size={28} color={Colors.textDim} />}
                title={search ? 'No matches' : 'No friends yet'}
                description={
                  search
                    ? `Nobody matched “${search}”.`
                    : 'Add someone by their user ID to start a conversation.'
                }
                actionLabel={search ? undefined : 'Add friend'}
                onAction={search ? undefined : () => setTab('add')}
              />
            ) : null}

            {filteredFriends.map((friendId) => {
              const profile = lookup(friendId);
              return (
                <UserRow
                  key={friendId}
                  name={profile?.display_name ?? 'Loading…'}
                  avatarUrl={profile?.avatar_url}
                  accentColor={profile?.accent_color}
                  presence={isOnline(friendId) ? 'online' : 'offline'}
                  secondary={`@${profile?.handle ?? friendId.slice(0, 8)}`}
                  onSelect={() => openProfile(friendId)}
                  actions={
                    <>
                      <Button
                        title=""
                        variant="ghost"
                        size="sm"
                        onPress={() => void openDM(friendId)}
                        icon={<MessageSquare size={17} color={Colors.textMuted} />}
                      />
                      <Button
                        title=""
                        variant="ghost"
                        size="sm"
                        onPress={() => setMenuFor(friendId)}
                        icon={<MoreHorizontal size={17} color={Colors.textMuted} />}
                      />
                    </>
                  }
                />
              );
            })}
          </View>
        )}

        {tab === 'pending' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Incoming — {friendsVM.pendingRequests.length}</Text>

            {friendsVM.isLoading ? <SkeletonRows rows={2} /> : null}

            {!friendsVM.isLoading && pendingCount === 0 ? (
              <EmptyState
                title="Nothing pending"
                description="No requests waiting, none awaiting a reply."
              />
            ) : null}

            {friendsVM.pendingRequests.map((request) => {
              const profile = lookup(request.requester_id);
              return (
                <UserRow
                  key={request.requester_id}
                  name={profile?.display_name ?? 'Loading…'}
                  avatarUrl={profile?.avatar_url}
                  accentColor={profile?.accent_color}
                  presence={isOnline(request.requester_id) ? 'online' : 'offline'}
                  secondary={`Wants to be friends · ${formatRelative(request.created_at)}`}
                  onSelect={() => openProfile(request.requester_id)}
                  actions={
                    <>
                      <Button
                        title=""
                        size="sm"
                        onPress={() => void respond(request.requester_id, true)}
                        icon={<Check size={16} color={Colors.accentContrast} />}
                      />
                      <Button
                        title=""
                        size="sm"
                        variant="ghost"
                        onPress={() => void respond(request.requester_id, false)}
                        icon={<X size={16} color={Colors.textMuted} />}
                      />
                    </>
                  }
                />
              );
            })}

            {friendsVM.sentRequests.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Sent — {friendsVM.sentRequests.length}</Text>
                {friendsVM.sentRequests.map((request) => {
                  const profile = lookup(request.addressee_id);
                  return (
                    <UserRow
                      key={request.addressee_id}
                      name={profile?.display_name ?? 'Loading…'}
                      avatarUrl={profile?.avatar_url}
                      accentColor={profile?.accent_color}
                      presence={isOnline(request.addressee_id) ? 'online' : 'offline'}
                      secondary={`Awaiting their reply · sent ${formatRelative(request.created_at)}`}
                      actions={
                        // Withdrawing is the same operation as unfriending: it
                        // deletes the row either way.
                        <Button
                          title="Cancel"
                          size="sm"
                          variant="ghost"
                          onPress={() => void removeFriend(request.addressee_id)}
                        />
                      }
                    />
                  );
                })}
              </>
            ) : null}
          </View>
        )}

        {tab === 'blocked' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Blocked — {blockedUsers.length}</Text>

            {blockedUsers.length === 0 ? (
              <EmptyState
                icon={<Ban size={28} color={Colors.textDim} />}
                title="Nobody blocked"
                description="People you block cannot message you or send friend requests."
              />
            ) : null}

            {blockedUsers.map((blockedId) => {
              const profile = lookup(blockedId);
              return (
                <UserRow
                  key={blockedId}
                  name={profile?.display_name ?? blockedId}
                  avatarUrl={profile?.avatar_url}
                  accentColor={profile?.accent_color}
                  secondary={`@${profile?.handle ?? blockedId.slice(0, 8)}`}
                  actions={
                    <Button
                      title="Unblock"
                      size="sm"
                      variant="secondary"
                      onPress={() => void unblockUser(blockedId)}
                    />
                  }
                />
              );
            })}
          </View>
        )}

        {tab === 'add' && (
          <View style={styles.section}>
            <Text style={styles.addTitle}>Add friend</Text>
            <Text style={styles.addDescription}>
              You can add friends using their unique genzh user ID.
            </Text>

            {error ? <Callout tone="danger" text={error} /> : null}

            <Input
              value={addId}
              onChangeText={setAddId}
              placeholder="Paste user ID (e.g. 6f1c7d2e-…)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title="Send friend request"
              onPress={() => void sendRequest()}
              loading={busy}
              disabled={!addId.trim()}
              icon={<UserPlus size={16} color={Colors.accentContrast} />}
            />

            {user ? (
              <View style={styles.myId}>
                <Text style={styles.myIdLabel}>Your user ID</Text>
                <TextInput
                  style={styles.myIdValue}
                  value={user.id}
                  editable={false}
                  selectTextOnFocus
                />
                <Text style={styles.myIdHint}>Long-press to select and copy.</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <Menu
        open={menuFor !== null}
        onOpenChange={(open) => !open && setMenuFor(null)}
        title={menuFor ? lookup(menuFor)?.display_name : undefined}
        items={[
          {
            key: 'message',
            label: 'Send message',
            icon: <MessageSquare size={17} color={Colors.textMuted} />,
            onPress: () => menuFor && void openDM(menuFor),
          },
          {
            key: 'remove',
            label: 'Remove friend',
            icon: <Trash2 size={17} color={Colors.textMuted} />,
            onPress: () => menuFor && void removeFriend(menuFor),
          },
          {
            key: 'block',
            label: 'Block user',
            tone: 'danger',
            separated: true,
            icon: <Shield size={17} color={Colors.danger} />,
            onPress: () => menuFor && void blockUser(menuFor),
          },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  strip: {
    paddingBottom: Spacing.xs,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.sunken,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  addTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  addDescription: {
    color: Colors.textSubtle,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  myId: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 2,
  },
  myIdLabel: {
    color: Colors.textSubtle,
    fontSize: 12,
    fontWeight: '700',
  },
  myIdValue: {
    color: Colors.accentText,
    fontFamily: 'monospace',
    fontSize: 12,
    padding: 0,
  },
  myIdHint: {
    color: Colors.textDim,
    fontSize: 11,
  },
});
