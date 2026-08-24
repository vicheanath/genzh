import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, MoreHorizontal, Settings, Users } from 'lucide-react-native';
import {
  ApiError,
  communities as communitiesApi,
  rooms as roomsApi,
  type Room,
} from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Collapsible } from '../../components/Collapsible';
import { EmptyState } from '../../components/EmptyState';
import { Menu } from '../../components/Menu';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingPanel } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/useConfirm';
import { useAuth } from '../../context/AuthContext';
import {
  abilitiesFor,
  canOpenSettings,
} from '../../features/community-settings/tabs';
import { isExperienceRoom, roomTypeIcon } from '../../lib/roomTypes';
import { useAsync } from '../../lib/useAsync';
import { Colors, Radius, Spacing } from '../../theme/tokens';

/**
 * One community: its channels, grouped the way the sidebar groups them.
 *
 * The web app shows this as a permanent sidebar; here it is a screen, with the
 * same three affordances hanging off the header — members, settings (only for
 * people who can actually change something), and leaving.
 */
export function CommunityDetailScreen({ route, navigation }: any) {
  const { communityId, communityName, name } = route.params ?? {};
  const { getToken, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [menuOpen, setMenuOpen] = useState(false);

  const community = useAsync(
    async () => communitiesApi.get(await getToken(), communityId),
    [getToken, communityId],
  );
  const rooms = useAsync(
    async () => roomsApi.list(await getToken(), communityId),
    [getToken, communityId],
  );

  function openRoom(room: Room) {
    navigation.navigate(isExperienceRoom(room.room_type) ? 'ExperienceRoom' : 'RoomChat', {
      roomId: room.id,
      roomName: room.name,
      roomType: room.room_type,
    });
  }

  async function leave() {
    if (!user) return;

    const ok = await confirm({
      title: `Leave ${community.data?.name ?? 'this server'}?`,
      description: 'You lose access to its channels until somebody invites you back.',
      confirmLabel: 'Leave server',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await communitiesApi.leave(await getToken(), communityId, user.id);
      toast.success('Left the server');
      navigation.goBack();
    } catch (cause) {
      toast.error('Could not leave', cause instanceof ApiError ? cause.message : undefined);
    }
  }

  if (community.loading) return <LoadingPanel />;

  const data = community.data;
  const abilities = data ? abilitiesFor(data, user?.id) : null;

  // Channels arrive flat with a category on each. Grouping here matches the
  // sidebar and keeps a server with forty channels readable.
  const grouped = new Map<string, Room[]>();
  for (const room of rooms.data ?? []) {
    const key = room.category || 'general';
    grouped.set(key, [...(grouped.get(key) ?? []), room]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title={data?.name ?? communityName ?? name ?? 'Community'}
        subtitle={data?.description ?? undefined}
        onBack={() => navigation.goBack()}
        actions={
          <>
            <Button
              title=""
              size="sm"
              variant="ghost"
              onPress={() =>
                navigation.navigate('MemberList', {
                  communityId,
                  title: data?.name,
                })
              }
              icon={<Users size={18} color={Colors.textMuted} />}
            />
            <Button
              title=""
              size="sm"
              variant="ghost"
              onPress={() => setMenuOpen(true)}
              icon={<MoreHorizontal size={18} color={Colors.textMuted} />}
            />
          </>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={rooms.loading}
            tintColor={Colors.accent}
            onRefresh={() => {
              community.reload();
              rooms.reload();
            }}
          />
        }
      >
        {data ? (
          <View style={styles.identity}>
            <Avatar name={data.name} url={data.icon_url} size={56} />
            <View style={styles.identityText}>
              <Text style={styles.identityName} numberOfLines={1}>
                {data.name}
              </Text>
              <Text style={styles.identityMeta} numberOfLines={2}>
                {data.description ?? 'No description yet.'}
              </Text>
            </View>
          </View>
        ) : null}

        {community.error ? <Callout tone="danger" text={community.error} /> : null}
        {rooms.error ? <Callout tone="danger" text={rooms.error} /> : null}

        {!rooms.loading && (rooms.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No channels yet"
            description={
              abilities?.rooms
                ? 'Create the first one in server settings.'
                : 'An admin has not made any channels yet.'
            }
            actionLabel={abilities?.rooms ? 'Open settings' : undefined}
            onAction={
              abilities?.rooms
                ? () =>
                    navigation.navigate('CommunitySettings', {
                      communityId,
                      communityName: data?.name,
                    })
                : undefined
            }
          />
        ) : null}

        {[...grouped.entries()].map(([category, list]) => (
          <Collapsible key={category} title={category} section adornment={<Badge text={list.length} />}>
            {list.map((room) => {
              const Icon = roomTypeIcon(room.room_type);

              return (
                <Pressable
                  key={room.id}
                  onPress={() => openRoom(room)}
                  style={({ pressed }) => [styles.channel, pressed && styles.channelPressed]}
                >
                  <Icon size={16} color={Colors.textMuted} />
                  <View style={styles.channelText}>
                    <Text style={styles.channelName} numberOfLines={1}>
                      {room.name}
                    </Text>
                    {room.topic ? (
                      <Text style={styles.channelTopic} numberOfLines={1}>
                        {room.topic}
                      </Text>
                    ) : null}
                  </View>
                  {room.current_participants > 0 ? (
                    <Badge text={room.current_participants} tone="mint" />
                  ) : null}
                </Pressable>
              );
            })}
          </Collapsible>
        ))}
      </ScrollView>

      <Menu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={data?.name}
        items={[
          {
            key: 'members',
            label: 'View members',
            icon: <Users size={17} color={Colors.textMuted} />,
            onPress: () =>
              navigation.navigate('MemberList', { communityId, title: data?.name }),
          },
          ...(abilities && canOpenSettings(abilities)
            ? [
                {
                  key: 'settings',
                  label: 'Server settings',
                  icon: <Settings size={17} color={Colors.textMuted} />,
                  onPress: () =>
                    navigation.navigate('CommunitySettings', {
                      communityId,
                      communityName: data?.name,
                    }),
                },
              ]
            : []),
          {
            key: 'leave',
            label: 'Leave server',
            tone: 'danger' as const,
            separated: true,
            icon: <LogOut size={17} color={Colors.danger} />,
            onPress: () => void leave(),
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
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  identityText: {
    flex: 1,
  },
  identityName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  identityMeta: {
    color: Colors.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
  },
  channelPressed: {
    backgroundColor: Colors.hover,
  },
  channelText: {
    flex: 1,
  },
  channelName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  channelTopic: {
    color: Colors.textSubtle,
    fontSize: 12,
    marginTop: 1,
  },
});
