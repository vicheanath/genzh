import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCommunityDetailVM } from '@genzh/shared';

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
import { Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

/**
 * Server settings.
 *
 * The web app opens this as a dialog on a desktop and a screen on a phone; here
 * it is only ever a screen. The four panels and the permission gate are the
 * shared `community-settings` feature, so the two platforms cannot drift on who
 * is allowed to change what.
 */
export function CommunitySettingsScreen({ route, navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { communityId, communityName } = route.params ?? {};
  const { token, user } = useAuth();

  const [tab, setTab] = useState<CommunityTab>('overview');

  const vm = useCommunityDetailVM(token, communityId);

  if (vm.isLoading) return <LoadingPanel label="Loading settings" />;

  if (vm.error || !vm.community) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Server settings" onBack={() => navigation.goBack()} />
        <View style={styles.centre}>
          <Callout tone="danger" text="This server could not be loaded." />
        </View>
      </SafeAreaView>
    );
  }

  const abilities = abilitiesFor(vm.community, user?.id);

  if (!canOpenSettings(abilities)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Server settings"
          subtitle={vm.community.name}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.centre}>
          <Text style={styles.denied}>
            You do not have permission to manage {vm.community.name}.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Server settings"
        subtitle={communityName ?? vm.community.name}
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
                    color={tab === item.id ? c.text : c.textDim}
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
            community={vm.community}
            abilities={abilities}
            onUpdated={() => void vm.refetchCommunity()}
            onDeleted={() => navigation.navigate('Main')}
          />
        )}
        {tab === 'roles' && <RolesTab community={vm.community} abilities={abilities} />}
        {tab === 'members' && <MembersTab community={vm.community} abilities={abilities} />}
        {tab === 'channels' && <ChannelsTab community={vm.community} abilities={abilities} />}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: c.bg,
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
    color: c.textSubtle,
    fontSize: 14,
    textAlign: 'center',
  },
});
