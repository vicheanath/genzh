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
import { Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

/**
 * A playground room whose point is the experience rather than the transcript.
 *
 * The web app stacks the experience card above the chat in one column; a phone
 * has room for one at a time, so they are two tabs — and the chat tab pushes to
 * the real transcript screen rather than growing a second, worse copy of it.
 */
export function ExperienceRoomScreen({ route, navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
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
            icon={<Users size={18} color={c.textMuted} />}
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
                      color={tab === 'experience' ? c.accentContrast : c.textDim}
                    />
                  ),
                },
                {
                  value: 'chat',
                  label: 'Room chat',
                  icon: <MessageSquare size={14} color={c.textDim} />,
                },
              ]}
            />
          </View>
        }
      />

      <View style={styles.body}>
        {current.room_type === 'poll' && <PollExperience room={current} />}
        {current.room_type === 'debate' && <DebateExperience room={current} />}
        {(current.room_type === 'game' ||
          current.room_type === 'truth_or_dare' ||
          current.room_type === 'would_you_rather' ||
          current.room_type === 'hot_takes' ||
          current.room_type === 'trivia' ||
          current.room_type === 'guess_who') && <GameExperience room={current} />}
        {(current.room_type === 'confession' || current.room_type === 'anonymous_chat') && (
          <ConfessionExperience room={current} />
        )}
        {(current.room_type === 'quick_chat' ||
          current.room_type === 'random_chat' ||
          current.room_type === 'match_interest' ||
          current.room_type === 'friend_finder' ||
          current.room_type === 'topic_room') && <QuickChatExperience room={current} />}
        {current.room_type === 'activity' && <ActivityExperience room={current} />}
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
