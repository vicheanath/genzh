import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AtSign, Bell, MessageSquare, UserPlus } from 'lucide-react-native';
import {
  formatRelative,
  type AppNotification,
  type NotificationKind,
} from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Spinner';
import { useNotifications } from '../../lib/useNotifications';
import { useProfiles } from '../../lib/useProfiles';
import { Colors, Radius, Spacing } from '../../theme/tokens';

const ICONS: Record<NotificationKind, typeof Bell> = {
  mention: AtSign,
  everyone: AtSign,
  direct_message: MessageSquare,
  friend_request: UserPlus,
  friend_accepted: UserPlus,
};

/** What the row says, given who caused it. */
function describe(kind: NotificationKind, actor: string): string {
  switch (kind) {
    case 'mention':
      return `${actor} mentioned you`;
    case 'everyone':
      return `${actor} notified everyone`;
    case 'direct_message':
      return `${actor} sent you a message`;
    case 'friend_request':
      return `${actor} wants to be friends`;
    case 'friend_accepted':
      return `${actor} accepted your friend request`;
  }
}

export interface NotificationListProps {
  /** Where a row goes when it is tapped. */
  onOpenRoom: (roomId: string) => void;
  onOpenFriends: () => void;
}

/**
 * The list of notifications, without any chrome around it.
 *
 * Kept separate from the screen for the same reason the web app splits it: the
 * rows are the same wherever they are shown, and only the container differs.
 */
export function NotificationList({ onOpenRoom, onOpenFriends }: NotificationListProps) {
  const { items, loading, markRead } = useNotifications();

  const actorIds = items.flatMap((item) => (item.actor_id ? [item.actor_id] : []));
  const lookup = useProfiles(actorIds);

  function open(item: AppNotification) {
    void markRead(item.id);
    if (item.room_id) {
      onOpenRoom(item.room_id);
    } else if (item.kind === 'friend_request' || item.kind === 'friend_accepted') {
      onOpenFriends();
    }
  }

  if (loading && items.length === 0) {
    return (
      <View style={styles.centre}>
        <Spinner size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.content}
      ListEmptyComponent={
        <EmptyState
          icon={<Bell size={28} color={Colors.textDim} />}
          title="Nothing yet"
          description="Mentions, direct messages and friend requests land here."
        />
      }
      renderItem={({ item }) => {
        const Icon = ICONS[item.kind];
        const profile = item.actor_id ? lookup(item.actor_id) : null;
        // A notification from an anonymous message carries no actor by design,
        // so it is described without naming anyone.
        const actor = profile?.display_name ?? 'Someone';

        return (
          <Pressable
            onPress={() => open(item)}
            style={({ pressed }) => [
              styles.item,
              !item.read_at && styles.itemUnread,
              pressed && styles.itemPressed,
            ]}
          >
            {profile ? (
              <Avatar
                name={profile.display_name}
                url={profile.avatar_url}
                accent={profile.accent_color}
                size={38}
                ringColor={Colors.surface}
              />
            ) : (
              <View style={styles.iconFallback}>
                <Icon size={17} color={Colors.accent} />
              </View>
            )}

            <View style={styles.body}>
              <Text style={styles.line}>{describe(item.kind, actor)}</Text>
              {item.preview ? (
                <Text style={styles.preview} numberOfLines={2}>
                  {item.preview}
                </Text>
              ) : null}
              <Text style={styles.when}>{formatRelative(item.created_at)}</Text>
            </View>

            {!item.read_at ? <View style={styles.dot} /> : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: Spacing.xxl * 2,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemUnread: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceRaised,
  },
  itemPressed: {
    backgroundColor: Colors.surfaceHover,
  },
  iconFallback: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  line: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  preview: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  when: {
    color: Colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    marginTop: 6,
  },
});
