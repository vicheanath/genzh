import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MessageSquare, Shield, UserPlus } from 'lucide-react-native';
import {
  ApiError,
  blocks as blocksApi,
  friends as friendsApi,
  rooms as roomsApi,
  users as usersApi,
} from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { useAppStore } from '../../lib/store';
import { useAsync } from '../../lib/useAsync';
import { usePresence } from '../../lib/usePresence';
import { Colors, Radius, Spacing } from '../../theme/tokens';

/**
 * Somebody's profile, as a bottom sheet.
 *
 * Mounted once at the root and driven by the store, exactly as the web app
 * mounts its profile dialog in the shell: a member row, a message author and a
 * friend row all open the same card by setting an id, rather than each screen
 * carrying its own copy.
 */
export function ProfileSheet() {
  const open = useAppStore((s) => s.profileOpen);
  const userId = useAppStore((s) => s.profileUserId);
  const closeProfile = useAppStore((s) => s.closeProfile);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeProfile()}>
      {userId ? <ProfileCard key={userId} userId={userId} onClose={closeProfile} /> : null}
    </Sheet>
  );
}

function ProfileCard({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { getToken, user } = useAuth();
  const navigation = useNavigation<any>();
  const toast = useToast();
  const confirm = useConfirm();
  const { isOnline } = usePresence();

  const profile = useAsync(
    async () => usersApi.get(await getToken(), userId),
    [getToken, userId],
  );
  const [busy, setBusy] = useState(false);

  const isSelf = userId === user?.id;

  async function handleOpenDM() {
    setBusy(true);
    try {
      const room = await roomsApi.openDM(await getToken(), userId);
      onClose();
      navigation.navigate('RoomChat', {
        roomId: room.id,
        roomName: profile.data?.display_name ?? room.name,
      });
    } catch (cause) {
      toast.error(
        'Could not start direct message',
        cause instanceof ApiError ? cause.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSendFriendRequest() {
    setBusy(true);
    try {
      await friendsApi.request(await getToken(), userId);
      toast.success('Friend request sent');
    } catch (cause) {
      toast.error(
        'Could not send request',
        cause instanceof ApiError ? cause.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleBlock() {
    const yes = await confirm({
      title: `Block ${profile.data?.display_name ?? 'this user'}?`,
      description: 'They will no longer be able to message you or send friend requests.',
      confirmLabel: 'Block',
      tone: 'danger',
    });
    if (!yes) return;

    setBusy(true);
    try {
      await blocksApi.block(await getToken(), userId);
      toast.success('User blocked', 'They can no longer message or interact with you.');
      onClose();
    } catch (cause) {
      toast.error('Could not block user', cause instanceof ApiError ? cause.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  if (profile.loading) return <SkeletonRows rows={2} />;

  const data = profile.data;
  const accent = data?.accent_color ?? Colors.accent;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.banner, { backgroundColor: accent }]} />

      <View style={styles.identity}>
        <View style={styles.avatarWrap}>
          <Avatar
            name={data?.display_name ?? '?'}
            url={data?.avatar_url}
            accent={data?.accent_color}
            size={72}
            presence={isOnline(userId) ? 'online' : 'offline'}
            ringColor={Colors.surface}
          />
        </View>
        <Text style={styles.name}>{data?.display_name ?? 'User profile'}</Text>
        <Text style={styles.handle}>@{data?.handle ?? userId.slice(0, 8)}</Text>
      </View>

      {data?.bio ? <Text style={styles.bio}>{data.bio}</Text> : null}

      <View style={styles.idCard}>
        <Text style={styles.idLabel}>User ID</Text>
        <TextInput style={styles.idValue} value={userId} editable={false} selectTextOnFocus />
      </View>

      {isSelf ? (
        <Text style={styles.selfNote}>
          This is you. Your profile and masked persona are edited in Settings.
        </Text>
      ) : (
        <View style={styles.actions}>
          <Button
            title="Send direct message"
            onPress={() => void handleOpenDM()}
            loading={busy}
            icon={<MessageSquare size={16} color={Colors.accentContrast} />}
          />

          <View style={styles.actionRow}>
            <Button
              title="Add friend"
              variant="secondary"
              style={styles.grow}
              disabled={busy}
              onPress={() => void handleSendFriendRequest()}
              icon={<UserPlus size={15} color={Colors.text} />}
            />
            <Button
              title="Block"
              variant="danger"
              disabled={busy}
              onPress={() => void handleBlock()}
              icon={<Shield size={15} color={Colors.danger} />}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: Spacing.lg,
  },
  banner: {
    height: 72,
    marginHorizontal: -0,
  },
  identity: {
    alignItems: 'center',
    marginTop: -36,
    paddingHorizontal: Spacing.xl,
  },
  avatarWrap: {
    borderRadius: Radius.full,
    borderWidth: 4,
    borderColor: Colors.surface,
    marginBottom: Spacing.sm,
  },
  name: {
    color: Colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  handle: {
    color: Colors.textSubtle,
    fontSize: 13,
    marginTop: 1,
  },
  bio: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  idCard: {
    margin: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.sunken,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 2,
  },
  idLabel: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
  },
  idValue: {
    color: Colors.accentText,
    fontFamily: 'monospace',
    fontSize: 12,
    padding: 0,
  },
  actions: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  grow: {
    flex: 1,
  },
  selfNote: {
    color: Colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
});
