import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { communities as communitiesApi, rooms as roomsApi } from '@genzh/shared';

import { Callout } from '../../components/Callout';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SkeletonRows } from '../../components/Skeleton';
import { UserRow } from '../../components/UserRow';
import { useAuth } from '../../context/AuthContext';
import { useAppStore } from '../../lib/store';
import { useAsync } from '../../lib/useAsync';
import { usePresence } from '../../lib/usePresence';
import { useProfiles } from '../../lib/useProfiles';
import { Colors, Radius, Spacing } from '../../theme/tokens';

/**
 * Who is in a community, or who is in a room.
 *
 * One screen for both, as on the web: a community passes `communityId` and gets
 * members; a room passes `roomId` and gets participants. The rows are identical
 * and so is the sort.
 */
export function MemberListScreen({ route, navigation }: any) {
  const { communityId, roomId, title } = route.params ?? {};
  const { getToken, user } = useAuth();
  const { isOnline } = usePresence();
  const openProfile = useAppStore((s) => s.openProfile);

  const members = useAsync(async () => {
    const token = await getToken();
    if (communityId) {
      const list = await communitiesApi.members(token, communityId);
      return list.map((member) => ({
        user_id: member.user_id,
        nickname: member.nickname as string | undefined,
      }));
    }
    if (roomId) {
      const list = await roomsApi.participants(token, roomId);
      return list.map((participant) => ({
        user_id: participant.user_id,
        nickname: undefined as string | undefined,
      }));
    }
    return [];
  }, [getToken, communityId, roomId]);

  const lookup = useProfiles(members.data?.map((member) => member.user_id) ?? []);

  // Online first. A member list sorted by join order buries the people you can
  // actually talk to right now.
  const sorted = [...(members.data ?? [])].sort(
    (a, b) => Number(isOnline(b.user_id)) - Number(isOnline(a.user_id)),
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title={communityId ? 'Members' : 'Participants'}
        subtitle={title}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {members.loading ? <SkeletonRows rows={6} /> : null}
        {members.error ? <Callout tone="danger" text={members.error} /> : null}

        {!members.loading && sorted.length === 0 ? (
          <Text style={styles.message}>Nobody here yet.</Text>
        ) : null}

        {sorted.length > 0 ? (
          <Text style={styles.heading}>
            {communityId ? 'Members' : 'Participants'} — {sorted.length}
          </Text>
        ) : null}

        {sorted.map((member) => {
          const profile = lookup(member.user_id);
          const name = member.nickname ?? profile?.display_name ?? 'Loading…';

          return (
            <UserRow
              key={member.user_id}
              name={name}
              avatarUrl={profile?.avatar_url}
              accentColor={profile?.accent_color}
              presence={isOnline(member.user_id) ? 'online' : 'offline'}
              secondary={profile ? `@${profile.handle}` : undefined}
              tintName
              size="sm"
              onSelect={() => openProfile(member.user_id)}
              actions={
                member.user_id === user?.id ? (
                  <View style={styles.youTag}>
                    <Text style={styles.youText}>you</Text>
                  </View>
                ) : undefined
              }
            />
          );
        })}
      </ScrollView>
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
  },
  heading: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  message: {
    color: Colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.xxl,
  },
  youTag: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  youText: {
    color: Colors.textDim,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
