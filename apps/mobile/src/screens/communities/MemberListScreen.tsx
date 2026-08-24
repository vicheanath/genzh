import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCommunityMembersQuery, useRoomParticipantsQuery, rooms as roomsApi } from '@genzh/shared';

import { Callout } from '../../components/Callout';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SkeletonRows } from '../../components/Skeleton';
import { UserRow } from '../../components/UserRow';
import { useAuth } from '../../context/AuthContext';
import { useAppStore } from '../../lib/store';
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
  const { token, user } = useAuth();
  const { isOnline } = usePresence();
  const openProfile = useAppStore((s) => s.openProfile);

  // This screen is opened for a community *or* for a room, never both, so each
  // query is enabled only when its id is the one that arrived.
  const communityMembers = useCommunityMembersQuery(token, communityId ?? null);
  const roomParticipants = useRoomParticipantsQuery(token, communityId ? null : roomId);

  const members = useMemo(
    () =>
      communityId
        ? (communityMembers.data ?? []).map((member) => ({
            user_id: member.user_id,
            nickname: member.nickname as string | undefined,
          }))
        : (roomParticipants.data ?? []).map((participant) => ({
            user_id: participant.user_id,
            nickname: undefined as string | undefined,
          })),
    [communityId, communityMembers.data, roomParticipants.data],
  );

  const loading = communityId ? communityMembers.isLoading : roomParticipants.isLoading;
  const lookup = useProfiles(members.map((member) => member.user_id));

  // Online first. A member list sorted by join order buries the people you can
  // actually talk to right now.
  const sorted = [...members].sort(
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
        {loading ? <SkeletonRows rows={6} /> : null}
        {communityMembers.error || roomParticipants.error ? (
        <Callout tone="danger" text="Could not load the member list." />
      ) : null}

        {!loading && sorted.length === 0 ? (
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
