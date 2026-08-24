import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut } from 'lucide-react-native';

import { Button } from '../../components/Button';
import { LoadingPanel } from '../../components/Spinner';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Tabs } from '../../components/Tabs';
import { useConfirm } from '../../components/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { AccountTab } from '../../features/settings/AccountTab';
import { AnonymousTab } from '../../features/settings/AnonymousTab';
import { BlockedTab } from '../../features/settings/BlockedTab';
import { DevicesTab } from '../../features/settings/DevicesTab';
import { ProfileTab } from '../../features/settings/ProfileTab';
import { ServerTab } from '../../features/settings/ServerTab';
import { SETTINGS_TABS, type SettingsTab } from '../../features/settings/tabs';
import { useAppStore } from '../../lib/store';
import { Colors, Spacing } from '../../theme/tokens';

/**
 * User settings.
 *
 * The web app puts this in a modal with a sidebar. A phone gets the same panels
 * behind a scrolling strip — same tab list, same order, driven by the same
 * `SETTINGS_TABS` data so the two cannot drift.
 */
export function SettingsScreen() {
  const { user, logout } = useAuth();
  const confirm = useConfirm();

  const storedTab = useAppStore((s) => s.userSettingsTab);
  const [tab, setTab] = useState<SettingsTab>(storedTab);

  if (!user) return <LoadingPanel />;

  async function handleSignOut() {
    const yes = await confirm({
      title: 'Sign out?',
      description: 'You will need your password to get back in.',
      confirmLabel: 'Sign out',
      tone: 'danger',
    });
    if (yes) await logout();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Settings"
        subtitle={`@${user.handle}`}
        below={
          <View style={styles.strip}>
            <Tabs
              value={tab}
              onValueChange={setTab}
              scrollable
              items={SETTINGS_TABS.map((item) => ({
                value: item.id,
                label: item.short,
                icon: <item.icon size={14} color={tab === item.id ? Colors.text : Colors.textDim} />,
              }))}
            />
          </View>
        }
      />

      <View style={styles.panel}>
        {tab === 'profile' && <ProfileTab user={user} />}
        {tab === 'anonymous' && <AnonymousTab user={user} />}
        {tab === 'account' && <AccountTab user={user} />}
        {tab === 'voice' && <DevicesTab />}
        {tab === 'blocked' && <BlockedTab />}
        {tab === 'server' && <ServerTab />}
      </View>

      <View style={styles.footer}>
        <Button
          title="Sign out"
          variant="danger"
          onPress={() => void handleSignOut()}
          icon={<LogOut size={16} />}
        />
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
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
