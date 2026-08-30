import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MonitorUp, Radio } from 'lucide-react-native';

import { useVoice } from '../../context/VoiceContext';
import { RTCView } from '../../lib/livekit/runtime';
import { useBottomInset } from '../../theme/layout';
import { Radius, Spacing, Stage, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { CallDock } from './CallDock';
import { CallHeader } from './CallHeader';
import { CallRoster } from './CallRoster';
import { ParticipantTile } from './ParticipantTile';
import { StageBackdrop } from './StageBackdrop';
import { useCallRoster } from './useCallRoster';

/** How long a reaction stays on screen after it is sent. */
const REACTION_MS = 2400;

/**
 * The call, full screen.
 *
 * Composition only: who is here comes from `useCallRoster`, what a person looks
 * like from `ParticipantTile`, and the controls from `CallDock`. What is left
 * is the two decisions this screen actually owns — grid or spotlight, and which
 * tile is pinned.
 *
 * The stage is its own environment, per `--stage-*`: darker than the app, warm
 * espresso rather than the cold slate this screen used to paint itself, with
 * the aurora behind the tiles. A call is a place you entered.
 */
export function CallScreen({ navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const bottomInset = useBottomInset();
  const {
    activeRoomName,
    status,
    error,
    muted,
    deafened,
    isCameraOn,
    isScreenSharing,
    handRaised,
    speakerphone,
    duration,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    toggleHandRaise,
    toggleSpeakerphone,
    switchCamera,
    capabilities,
    screenShareUnavailableReason,
    leave: leaveCall,
  } = useVoice();

  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [activeReaction, setActiveReaction] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [preferGrid, setPreferGrid] = useState<boolean | null>(null);

  const { tiles, spotlight, hasScreenShare, screenShare } = useCallRoster(pinnedId);

  // Leaving is a side effect, so it happens in an effect. Calling `goBack()`
  // straight from the render body — which is what this did — navigates while
  // React is still rendering, and the early `return null` it needed to do that
  // skipped the hooks below it, which is a crash the moment a call ends.
  useEffect(() => {
    if (status === 'idle') navigation.goBack();
  }, [status, navigation]);

  // Cleared on unmount, so a reaction sent as you hang up cannot set state on a
  // screen that is no longer there.
  useEffect(() => {
    if (!activeReaction) return;
    const timer = setTimeout(() => setActiveReaction(null), REACTION_MS);
    return () => clearTimeout(timer);
  }, [activeReaction]);

  const react = useCallback((emoji: string) => {
    setActiveReaction(emoji);
    setReactionsOpen(false);
  }, []);

  // Tapping a tile is "show me this person", which is a pin and a view change
  // together — doing only one of the two leaves the tap looking ignored.
  const spotlightOn = useCallback((id: string) => {
    setPinnedId(id);
    setPreferGrid(false);
  }, []);

  const leave = useCallback(async () => {
    await leaveCall();
    navigation.goBack();
  }, [leaveCall, navigation]);

  // Grid unless something is being presented, which is what a viewer wants in
  // both cases — until they say otherwise, and then their choice sticks.
  const gridView = preferGrid ?? !hasScreenShare;

  const sharedScreen = hasScreenShare ? (screenShare?.screenStream ?? null) : null;

  return (
    <View style={styles.root}>
      <StageBackdrop />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <CallHeader
          roomName={activeRoomName ?? 'Voice room'}
          status={status}
          duration={duration}
          headcount={tiles.length}
          onMinimize={() => navigation.goBack()}
          onOpenRoster={() => setRosterOpen(true)}
        />

        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {activeReaction ? (
          <Animated.View
            entering={FadeInUp.duration(280)}
            exiting={FadeOut.duration(280)}
            style={styles.reactionBubble}
            pointerEvents="none"
          >
            <Text style={styles.reactionEmoji}>{activeReaction}</Text>
          </Animated.View>
        ) : null}

        <View style={styles.stage}>
          {gridView ? (
            // Two or fewer people split the screen between them rather than
            // scrolling: a one-to-one call where each face gets half the
            // display is the whole point of it, and a list cannot do that
            // because its cells cannot take a share of the viewport's height.
            tiles.length <= 2 ? (
              <View style={styles.gridStack}>
                {tiles.map((member) => (
                  <ParticipantTile
                    key={member.id}
                    member={member}
                    variant="solo"
                    onPress={() => spotlightOn(member.id)}
                  />
                ))}
              </View>
            ) : (
              <FlatList
                data={tiles}
                keyExtractor={(member) => member.id}
                numColumns={2}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.gridContent}
                renderItem={({ item }) => (
                  <ParticipantTile
                    member={item}
                    variant="grid"
                    onPress={() => spotlightOn(item.id)}
                  />
                )}
              />
            )
          ) : (
            <View style={styles.spotlight}>
              <View style={styles.spotlightFrame}>
                <View style={styles.spotlightTag}>
                  {hasScreenShare ? (
                    <MonitorUp size={12} color={c.accentContrast} />
                  ) : (
                    <Radio size={12} color={c.accentContrast} />
                  )}
                  <Text style={styles.spotlightTagText}>
                    {hasScreenShare ? 'SCREEN' : 'SPOTLIGHT'}
                  </Text>
                </View>

                <Text style={styles.spotlightName} numberOfLines={1}>
                  {hasScreenShare
                    ? `${screenShare?.name ?? 'Someone'}${screenShare?.isSelf ? ' (you)' : ''} is presenting`
                    : (spotlight?.name ?? 'Nobody')}
                </Text>

                {RTCView && sharedScreen ? (
                  <View style={styles.screenSurface}>
                    <RTCView
                      streamURL={(sharedScreen as any).toURL()}
                      style={StyleSheet.absoluteFillObject}
                      // Contain, not cover: a shared screen cropped to fill the
                      // frame is a shared screen you cannot read.
                      objectFit="contain"
                    />
                  </View>
                ) : spotlight ? (
                  <ParticipantTile member={spotlight} variant="solo" />
                ) : null}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.strip}
                contentContainerStyle={styles.stripContent}
              >
                {tiles.map((member) => (
                  <ParticipantTile
                    key={member.id}
                    member={member}
                    variant="strip"
                    pinned={member.id === spotlight?.id}
                    onPress={() =>
                      setPinnedId((current) => (current === member.id ? null : member.id))
                    }
                  />
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <CallDock
          muted={muted}
          deafened={deafened}
          isCameraOn={isCameraOn}
          isScreenSharing={isScreenSharing}
          isHandRaised={handRaised}
          speakerphone={speakerphone}
          canShareScreen={capabilities.screenShare}
          screenShareUnavailableReason={screenShareUnavailableReason}
          gridView={gridView}
          reactionsOpen={reactionsOpen}
          bottomInset={bottomInset}
          onToggleMute={toggleMute}
          onToggleDeafen={toggleDeafen}
          onToggleCamera={() => void toggleCamera()}
          onToggleScreenShare={() => void toggleScreenShare()}
          onSwitchCamera={() => void switchCamera()}
          onToggleHandRaise={toggleHandRaise}
          onToggleSpeakerphone={toggleSpeakerphone}
          onToggleView={() => setPreferGrid(!gridView)}
          onToggleReactions={() => setReactionsOpen((open) => !open)}
          onReact={react}
          onLeave={() => void leave()}
        />
      </SafeAreaView>

      <CallRoster open={rosterOpen} onOpenChange={setRosterOpen} members={tiles} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Stage.bg,
  },
  safe: {
    flex: 1,
  },
  errorBar: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: c.dangerSubtle,
    borderWidth: 1,
    borderColor: c.danger,
  },
  errorText: {
    color: c.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  reactionBubble: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    zIndex: 20,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Stage.glass,
    borderWidth: 1,
    borderColor: Stage.glassBorder,
  },
  reactionEmoji: {
    fontSize: 64,
  },
  stage: {
    flex: 1,
  },
  gridContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  gridStack: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  gridRow: {
    gap: Spacing.sm,
  },
  spotlight: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  // The frame only clips and positions — whatever fills it brings its own
  // surface, so the spotlight never draws a border around a tile that has one.
  spotlightFrame: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: Radius.xxl,
  },
  screenSurface: {
    flex: 1,
    borderRadius: Radius.xxl,
    // Black behind a shared screen: `contain` letterboxes, and the bars should
    // read as the edge of the screen rather than as part of the app.
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: Stage.border,
    borderTopColor: Stage.borderStrong,
  },
  spotlightTag: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: c.accent,
  },
  spotlightTagText: {
    color: c.accentContrast,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  spotlightName: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 10,
    maxWidth: '55%',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Stage.glass,
    color: Stage.text,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  strip: {
    flexGrow: 0,
  },
  stripContent: {
    gap: Spacing.sm,
    paddingVertical: 2,
  },
});
