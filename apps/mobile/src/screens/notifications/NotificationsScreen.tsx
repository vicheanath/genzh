import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCheck } from 'lucide-react-native';

import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { NotificationList } from '../../features/notifications/NotificationList';
import { useNotifications } from '../../lib/useNotifications';
import { type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

/**
 * Notifications as a destination.
 *
 * A list that can run to dozens of rows, each with a preview, does not belong
 * in a panel hanging off a button — on a phone it gets its own tab, with the
 * room to scroll that implies.
 */
export function NotificationsScreen({ navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { unread, markAllRead } = useNotifications();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Activity"
        subtitle={unread > 0 ? `${unread} unread` : 'You are all caught up'}
        actions={
          unread > 0 ? (
            <Button
              title="Mark all read"
              size="sm"
              variant="ghost"
              onPress={() => void markAllRead()}
              icon={<CheckCheck size={15} color={c.textMuted} />}
            />
          ) : null
        }
      />

      <View style={styles.body}>
        <NotificationList
          onOpenRoom={(roomId) => navigation.navigate('RoomChat', { roomId })}
          onOpenFriends={() => navigation.navigate('FriendsTab')}
        />
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
  body: {
    flex: 1,
  },
});
