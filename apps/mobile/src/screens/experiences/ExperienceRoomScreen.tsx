import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageSquare, Sparkles, Users } from 'lucide-react-native';
import { useRoomQuery, rooms as roomsApi } from '@genzh/shared';

import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingPanel } from '../../components/Spinner';
import { Tabs } from '../../components/Tabs';
import { useAuth } from '../../context/AuthContext';
import { ActivityExperience } from '../../features/experiences/ActivityExperience';
import { ConfessionExperience } from '../../features/experiences/ConfessionExperience';
import { DebateExperience } from '../../features/experiences/DebateExperience';
import { GameExperience } from '../../features/experiences/GameExperience';
import { PollExperience } from '../../features/experiences/PollExperience';
import { QuickChatExperience } from '../../features/experiences/QuickChatExperience';
import { roomTypeLabel } from '../../lib/roomTypes';
import { Colors, Spacing } from '../../theme/tokens';

/**
 * A playground room whose point is the experience rather than the transcript.
 *
 * The web app stacks the experience card above the chat in one column; a phone
 * has room for one at a time, so they are two tabs — and the chat tab pushes to
 * the real transcript screen rather than growing a second, worse copy of it.
 */
export function ExperienceRoomScreen({ route, navigation }: any) {
  const { roomId, roomName } = route.params ?? {};
  const { token } = useAuth();
  const [tab, setTab] = useState<'experience' | 'chat'>('experience');

  const roomQuery = useRoomQuery(token, roomId);

  if (roomQuery.isLoading) return <LoadingPanel label="Opening room" />;

  if (roomQuery.error || !roomQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title={roomName ?? 'Room'} onBack={() => navigation.goBack()} />
        <View style={styles.centre}>
          <Callout tone="danger" text="This room could not be opened." />
        </View>
      </SafeAreaView>
    );
  }

  const current = roomQuery.data;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title={current.name}
        subtitle={`${roomTypeLabel(current.room_type)} · ${current.current_participants} here`}
        onBack={() => navigation.goBack()}
        actions={
          <Button
            title=""
            size="sm"
            variant="ghost"
            onPress={() =>
              navigation.navigate('MemberList', { roomId: current.id, title: current.name })
            }
            icon={<Users size={18} color={Colors.textMuted} />}
          />
        }
        below={
          <View style={styles.strip}>
            <Tabs
              value={tab}
              onValueChange={(next) => {
                if (next === 'chat') {
                  // The transcript is a screen of its own — pushing to it keeps
                  // one implementation of the composer, mentions and history.
                  navigation.navigate('RoomChat', {
                    roomId: current.id,
                    roomName: current.name,
                  });
                  return;
                }
                setTab(next);
              }}
              variant="pill"
              items={[
                {
                  value: 'experience',
                  label: 'Experience',
                  icon: (
                    <Sparkles
                      size={14}
                      color={tab === 'experience' ? Colors.accentContrast : Colors.textDim}
                    />
                  ),
                },
                {
                  value: 'chat',
                  label: 'Room chat',
                  icon: <MessageSquare size={14} color={Colors.textDim} />,
                },
              ]}
            />
          </View>
        }
      />

      <View style={styles.body}>
        {current.room_type === 'poll' && <PollExperience room={current} />}
        {current.room_type === 'debate' && <DebateExperience room={current} />}
        {current.room_type === 'game' && <GameExperience room={current} />}
        {current.room_type === 'confession' && <ConfessionExperience room={current} />}
        {current.room_type === 'quick_chat' && <QuickChatExperience room={current} />}
        {current.room_type === 'activity' && <ActivityExperience room={current} />}
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
    padding: Spacing.lg,
    paddingTop: 0,
  },
  body: {
    flex: 1,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
});
