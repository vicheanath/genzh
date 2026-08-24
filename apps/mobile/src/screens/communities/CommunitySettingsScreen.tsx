import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { communities as communitiesApi } from '@genzh/shared';

import { Callout } from '../../components/Callout';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingPanel } from '../../components/Spinner';
import { Tabs } from '../../components/Tabs';
import { useAuth } from '../../context/AuthContext';
import { ChannelsTab } from '../../features/community-settings/ChannelsTab';
import { MembersTab } from '../../features/community-settings/MembersTab';
import { OverviewTab } from '../../features/community-settings/OverviewTab';
import { RolesTab } from '../../features/community-settings/RolesTab';
import {
  abilitiesFor,
  canOpenSettings,
  COMMUNITY_TABS,
  type CommunityTab,
} from '../../features/community-settings/tabs';
import { useAsync } from '../../lib/useAsync';
import { Colors, Spacing } from '../../theme/tokens';

/**
 * Server settings.
 *
 * The web app opens this as a dialog on a desktop and a screen on a phone; here
 * it is only ever a screen. The four panels and the permission gate are the
 * shared `community-settings` feature, so the two platforms cannot drift on who
 * is allowed to change what.
 */
export function CommunitySettingsScreen({ route, navigation }: any) {
  const { communityId, communityName } = route.params ?? {};
  const { getToken, user } = useAuth();

  const [tab, setTab] = useState<CommunityTab>('overview');

  const community = useAsync(
    async () => communitiesApi.get(await getToken(), communityId),
    [getToken, communityId],
  );

  if (community.loading) return <LoadingPanel label="Loading settings" />;

  if (community.error || !community.data) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Server settings" onBack={() => navigation.goBack()} />
        <View style={styles.centre}>
          <Callout tone="danger" text={community.error ?? 'This server could not be loaded.'} />
        </View>
      </SafeAreaView>
    );
  }

  const abilities = abilitiesFor(community.data, user?.id);

  if (!canOpenSettings(abilities)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Server settings"
          subtitle={community.data.name}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.centre}>
          <Text style={styles.denied}>
            You do not have permission to manage {community.data.name}.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Server settings"
        subtitle={communityName ?? community.data.name}
        onBack={() => navigation.goBack()}
        below={
          <View style={styles.strip}>
            <Tabs
              value={tab}
              onValueChange={setTab}
              scrollable
              items={COMMUNITY_TABS.map((item) => ({
                value: item.id,
                label: item.short,
                icon: (
                  <item.icon
                    size={14}
                    color={tab === item.id ? Colors.text : Colors.textDim}
                  />
                ),
              }))}
            />
          </View>
        }
      />

      <View style={styles.panel}>
        {tab === 'overview' && (
          <OverviewTab
            community={community.data}
            abilities={abilities}
            onUpdated={community.reload}
            onDeleted={() => navigation.navigate('Main')}
          />
        )}
        {tab === 'roles' && <RolesTab community={community.data} abilities={abilities} />}
        {tab === 'members' && <MembersTab community={community.data} abilities={abilities} />}
        {tab === 'channels' && <ChannelsTab community={community.data} abilities={abilities} />}
      </View>
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
  panel: {
    flex: 1,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  denied: {
    color: Colors.textSubtle,
    fontSize: 14,
    textAlign: 'center',
  },
});
