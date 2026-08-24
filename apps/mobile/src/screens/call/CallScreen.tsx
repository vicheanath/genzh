import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutDown,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  Hand,
  Headphones,
  HeadphoneOff,
  LayoutGrid,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Radio,
  Share2,
  Smile,
  Sparkles,
  Users,
  Video,
  VideoOff,
  Volume2,
  Volume1,
  Maximize2,
  Minimize2,
  X,
  Check,
  UserCheck,
} from 'lucide-react-native';

import { useVoice, type VoiceParticipant } from '../../context/VoiceContext';
import { useAuth } from '../../context/AuthContext';
import { useProfiles } from '../../lib/useProfiles';
import { webrtcModule } from '../../lib/webrtc/MobileVoiceClient';
import { Avatar } from '../../components/Avatar';
import { Colors, Radius, Spacing } from '../../theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const QUICK_REACTIONS = ['❤️', '🔥', '👍', '👏', '🎉', '😂', '👋', '💯'];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;

  if (hrs > 0) {
    return `${hrs}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/** Animated voice audio wave indicator */
function AudioWaveform({ isSpeaking }: { isSpeaking: boolean }) {
  if (!isSpeaking) return null;
  return (
    <View style={styles.waveformContainer}>
      <View style={[styles.waveBar, styles.waveBar1]} />
      <View style={[styles.waveBar, styles.waveBar2]} />
      <View style={[styles.waveBar, styles.waveBar3]} />
      <View style={[styles.waveBar, styles.waveBar4]} />
    </View>
  );
}

export function CallScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    activeRoomName,
    status,
    audioAvailable,
    muted,
    deafened,
    isCameraOn,
    isScreenSharing,
    isHandRaised,
    speakerphone,
    callDuration,
    participants,
    screenSharingParticipant,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    toggleHandRaise,
    toggleSpeakerphone,
    leaveRoom,
  } = useVoice();

  const [showReactions, setShowReactions] = useState(false);
  const [activeReaction, setActiveReaction] = useState<string | null>(null);
  const [showRoster, setShowRoster] = useState(false);
  const [viewMode, setViewMode] = useState<'auto' | 'grid' | 'speaker'>('auto');
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);

  // Participant profile lookup
  const participantIds = useMemo(() => participants.map((p) => p.id), [participants]);
  const lookupProfile = useProfiles(participantIds);

  const allParticipants = useMemo(() => {
    const selfItem: VoiceParticipant = {
      id: user?.id ?? 'self',
      role: 'owner',
      muted,
      anonymous: false,
      isCameraOn,
      isScreenSharing,
      isHandRaised,
      isSpeaking: !muted && status === 'connected',
    };
    return [selfItem, ...participants];
  }, [user, muted, status, isCameraOn, isScreenSharing, isHandRaised, participants]);

  if (status === 'idle') {
    navigation.goBack();
    return null;
  }

  const triggerReaction = (emoji: string) => {
    setActiveReaction(emoji);
    setShowReactions(false);
    setTimeout(() => setActiveReaction(null), 2400);
  };

  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 16);
  const hasScreenShare = Boolean(screenSharingParticipant || isScreenSharing);

  // Identify spotlight participant
  const spotlightParticipant = useMemo(() => {
    if (pinnedParticipantId) {
      return allParticipants.find((p) => p.id === pinnedParticipantId) ?? allParticipants[0];
    }
    if (screenSharingParticipant) {
      return screenSharingParticipant;
    }
    const speakingRemote = participants.find((p) => p.isSpeaking);
    if (speakingRemote) return speakingRemote;
    return allParticipants[0];
  }, [pinnedParticipantId, screenSharingParticipant, participants, allParticipants]);

  const effectiveMode = viewMode === 'auto' ? (hasScreenShare ? 'speaker' : 'grid') : viewMode;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Top Header Bar ────────────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Minimize Button */}
        <Pressable
          accessibilityLabel="Minimize Call"
          onPress={() => navigation.goBack()}
          style={styles.headerCircleBtn}
        >
          <ChevronDown size={20} color="#ffffff" />
        </Pressable>

        {/* Center Room & Channel Info */}
        <View style={styles.headerCenter}>
          <Text style={styles.roomName} numberOfLines={1}>
            {activeRoomName ?? 'Voice Channel'}
          </Text>
          <View style={styles.headerMetaRow}>
            <View
              style={[
                styles.livePulseDot,
                status === 'connected' ? styles.liveDotConnected : styles.liveDotConnecting,
              ]}
            />
            <Text style={styles.durationBadge}>
              {status === 'connected' ? formatDuration(callDuration) : 'Connecting…'}
            </Text>
            <Text style={styles.metaDivider}>•</Text>

            {/* Clickable Participant Counter Pill */}
            <Pressable
              accessibilityLabel="View Participants"
              onPress={() => setShowRoster(true)}
              style={styles.participantPill}
            >
              <Users size={12} color={Colors.accentText} />
              <Text style={styles.participantCount}>{allParticipants.length}</Text>
            </Pressable>
          </View>
        </View>

        {/* Right Header Actions (View Mode Switch & Audio Output) */}
        <View style={styles.headerRightActions}>
          <Pressable
            accessibilityLabel="Switch View Mode"
            onPress={() =>
              setViewMode((current) =>
                current === 'auto' ? 'grid' : current === 'grid' ? 'speaker' : 'auto',
              )
            }
            style={[styles.headerCircleBtn, viewMode !== 'auto' && styles.headerCircleBtnActive]}
          >
            <LayoutGrid size={18} color={viewMode !== 'auto' ? Colors.accent : '#ffffff'} />
          </Pressable>

          <Pressable
            accessibilityLabel={speakerphone ? 'Switch to earpiece' : 'Switch to speakerphone'}
            onPress={toggleSpeakerphone}
            style={[styles.headerCircleBtn, speakerphone && styles.headerCircleBtnActive]}
          >
            {speakerphone ? (
              <Volume2 size={18} color={Colors.accent} />
            ) : (
              <Volume1 size={18} color="#ffffff" />
            )}
          </Pressable>
        </View>
      </View>

      {/* ── Floating Reaction Animation Overlay ───────────────────────── */}
      {activeReaction ? (
        <Animated.View
          entering={FadeInUp.duration(300)}
          exiting={FadeOut.duration(300)}
          style={styles.reactionBubbleOverlay}
          pointerEvents="none"
        >
          <Text style={styles.reactionBubbleEmoji}>{activeReaction}</Text>
        </Animated.View>
      ) : null}

      {/* ── Main Stage ────────────────────────────────────────────────── */}
      <View style={styles.stage}>
        {effectiveMode === 'speaker' ? (
          /* ── Spotlight / Presentation Stage ── */
          <View style={styles.spotlightContainer}>
            {/* Primary Spotlight Frame */}
            <View style={styles.spotlightFrame}>
              {/* Top Banner inside Spotlight */}
              <View style={styles.spotlightTopBar}>
                <View style={styles.liveTag}>
                  <Radio size={12} color="#ffffff" />
                  <Text style={styles.liveTagText}>
                    {hasScreenShare ? 'SCREEN' : 'SPOTLIGHT'}
                  </Text>
                </View>
                <Text style={styles.spotlightPresenterName} numberOfLines={1}>
                  {spotlightParticipant?.id === user?.id
                    ? 'You (Presenting)'
                    : lookupProfile(spotlightParticipant?.id ?? '')?.display_name ||
                      'Active Speaker'}
                </Text>
              </View>

              {/* Video Feed / Screen Share / Avatar */}
              {hasScreenShare && screenSharingParticipant?.stream && webrtcModule?.RTCView ? (
                <webrtcModule.RTCView
                  streamURL={screenSharingParticipant.stream.toURL()}
                  style={styles.spotlightRTC}
                  objectFit="contain"
                />
              ) : spotlightParticipant?.isCameraOn &&
                spotlightParticipant?.stream &&
                webrtcModule?.RTCView ? (
                <webrtcModule.RTCView
                  streamURL={spotlightParticipant.stream.toURL()}
                  style={styles.spotlightRTC}
                  objectFit="cover"
                  mirror={spotlightParticipant.id === user?.id}
                />
              ) : (
                <View style={styles.spotlightHeroAvatar}>
                  <Avatar
                    url={
                      spotlightParticipant?.id === user?.id
                        ? user?.profile?.avatar_url
                        : lookupProfile(spotlightParticipant?.id ?? '')?.avatar_url
                    }
                    name={
                      spotlightParticipant?.id === user?.id
                        ? user?.profile?.display_name || 'You'
                        : lookupProfile(spotlightParticipant?.id ?? '')?.display_name || 'Member'
                    }
                    speaking={spotlightParticipant?.isSpeaking}
                    size={96}
                  />
                  {spotlightParticipant?.isSpeaking ? (
                    <View style={styles.spotlightSpeakingWave}>
                      <AudioWaveform isSpeaking={true} />
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            {/* Bottom Horizontal Attendee Strip */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attendeeStripContent}
              style={styles.attendeeStrip}
            >
              {allParticipants.map((item) => {
                const isSelf = item.id === user?.id || item.id === 'self';
                const profile = !isSelf ? lookupProfile(item.id) : null;
                const displayName = isSelf
                  ? user?.profile?.display_name || user?.handle || 'You'
                  : profile?.display_name || 'Member';
                const avatarUrl = isSelf ? user?.profile?.avatar_url : profile?.avatar_url;
                const isSelected = item.id === spotlightParticipant?.id;

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setPinnedParticipantId(item.id === spotlightParticipant?.id ? null : item.id)}
                    style={[
                      styles.stripCard,
                      isSelected && styles.stripCardSelected,
                      item.isSpeaking && styles.stripCardSpeaking,
                    ]}
                  >
                    <Avatar
                      url={avatarUrl ?? null}
                      name={displayName}
                      speaking={item.isSpeaking}
                      size={44}
                    />
                    <Text style={styles.stripCardName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    {item.muted ? (
                      <View style={styles.miniMuteBadge}>
                        <MicOff size={9} color="#ffffff" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          /* ── Symmetrical Multi-Participant Grid ── */
          <FlatList
            data={allParticipants}
            keyExtractor={(item) => item.id}
            numColumns={allParticipants.length > 2 ? 2 : 1}
            key={allParticipants.length > 2 ? 'grid-2' : 'grid-1'}
            contentContainerStyle={styles.gridContent}
            renderItem={({ item }) => {
              const isSelf = item.id === user?.id || item.id === 'self';
              const profile = !isSelf ? lookupProfile(item.id) : null;
              const displayName = isSelf
                ? user?.profile?.display_name || user?.handle || 'You'
                : profile?.display_name || 'Member';
              const avatarUrl = isSelf ? user?.profile?.avatar_url : profile?.avatar_url;
              const isGrid = allParticipants.length > 2;

              return (
                <Pressable
                  onPress={() => {
                    setPinnedParticipantId(item.id);
                    setViewMode('speaker');
                  }}
                  style={[
                    styles.gridCard,
                    isGrid && styles.gridCardMulti,
                    item.isSpeaking && styles.gridCardSpeaking,
                  ]}
                >
                  {/* Video Stream or Avatar */}
                  {item.isCameraOn && item.stream && webrtcModule?.RTCView ? (
                    <webrtcModule.RTCView
                      streamURL={item.stream.toURL()}
                      style={StyleSheet.absoluteFillObject}
                      objectFit="cover"
                      mirror={isSelf}
                    />
                  ) : (
                    <View style={styles.gridAvatarCenter}>
                      <Avatar
                        url={avatarUrl ?? null}
                        name={displayName}
                        speaking={item.isSpeaking}
                        size={isGrid ? 64 : 92}
                      />
                      {item.isSpeaking ? (
                        <View style={styles.gridSpeakingGlow} pointerEvents="none" />
                      ) : null}
                    </View>
                  )}

                  {/* Top Status Badges */}
                  {item.isHandRaised ? (
                    <View style={styles.raisedHandTag}>
                      <Hand size={11} color="#ffffff" />
                      <Text style={styles.raisedHandText}>Hand Raised</Text>
                    </View>
                  ) : null}

                  {/* Audio Waveform on Card */}
                  {item.isSpeaking && !item.isCameraOn ? (
                    <View style={styles.gridWaveformBox}>
                      <AudioWaveform isSpeaking={true} />
                    </View>
                  ) : null}

                  {/* Bottom Bar overlay */}
                  <View style={styles.gridCardBottomBar}>
                    <View style={styles.namePill}>
                      <Text style={styles.namePillText} numberOfLines={1}>
                        {displayName} {isSelf ? '(You)' : ''}
                      </Text>
                    </View>

                    <View style={styles.statusIconsRow}>
                      {item.muted ? (
                        <View style={styles.statusMutedPill}>
                          <MicOff size={11} color="#ffffff" />
                        </View>
                      ) : (
                        <View style={styles.statusLivePill}>
                          <Mic size={11} color="#22c55e" />
                        </View>
                      )}
                      {item.isCameraOn ? (
                        <View style={styles.statusCameraPill}>
                          <Video size={11} color={Colors.accent} />
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {/* ── Quick Reactions Selector ──────────────────────────────────── */}
      {showReactions ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(150)}
          style={styles.reactionsFloatingDeck}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => triggerReaction(emoji)}
              style={styles.reactionDeckItem}
            >
              <Text style={styles.reactionDeckEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}

      {/* ── Bottom Control Deck ───────────────────────────────────────── */}
      <View style={[styles.dockContainer, { paddingBottom: bottomInset + 4 }]}>
        <View style={styles.dockRow}>
          {/* Reaction Button */}
          <Pressable
            accessibilityLabel="Send Reaction"
            onPress={() => setShowReactions((v) => !v)}
            style={[styles.dockCircleBtn, showReactions && styles.dockBtnActive]}
          >
            <Smile size={22} color={showReactions ? Colors.accent : '#ffffff'} />
          </Pressable>

          {/* Microphone Mute Button */}
          <Pressable
            accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}
            onPress={toggleMute}
            style={[styles.dockCircleBtn, muted && styles.dockBtnDanger]}
          >
            {muted ? (
              <MicOff size={22} color="#ffffff" />
            ) : (
              <Mic size={22} color="#ffffff" />
            )}
          </Pressable>

          {/* Camera Button */}
          <Pressable
            accessibilityLabel={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
            onPress={() => void toggleCamera()}
            style={[styles.dockCircleBtn, isCameraOn && styles.dockBtnAccent]}
          >
            {isCameraOn ? (
              <Video size={22} color="#ffffff" />
            ) : (
              <VideoOff size={22} color="rgba(255, 255, 255, 0.45)" />
            )}
          </Pressable>

          {/* Screen Share Button */}
          <Pressable
            accessibilityLabel={isScreenSharing ? 'Stop screen share' : 'Share screen'}
            onPress={() => void toggleScreenShare()}
            style={[styles.dockCircleBtn, isScreenSharing && styles.dockBtnAccent]}
          >
            {isScreenSharing ? (
              <MonitorX size={22} color="#ffffff" />
            ) : (
              <MonitorUp size={22} color="rgba(255, 255, 255, 0.45)" />
            )}
          </Pressable>

          {/* Hand Raise Button */}
          <Pressable
            accessibilityLabel={isHandRaised ? 'Lower hand' : 'Raise hand'}
            onPress={toggleHandRaise}
            style={[styles.dockCircleBtn, isHandRaised && styles.dockBtnAmber]}
          >
            <Hand size={22} color={isHandRaised ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'} />
          </Pressable>

          {/* Deafen Button */}
          <Pressable
            accessibilityLabel={deafened ? 'Undeafen' : 'Deafen'}
            onPress={toggleDeafen}
            style={[styles.dockCircleBtn, deafened && styles.dockBtnDanger]}
          >
            {deafened ? (
              <HeadphoneOff size={22} color="#ffffff" />
            ) : (
              <Headphones size={22} color="rgba(255, 255, 255, 0.45)" />
            )}
          </Pressable>

          {/* End Call Button */}
          <Pressable
            accessibilityLabel="End Call"
            onPress={async () => {
              await leaveRoom();
              navigation.goBack();
            }}
            style={styles.dockEndCallBtn}
          >
            <PhoneOff size={22} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      {/* ── Participant Roster Modal / Sheet ──────────────────────────── */}
      <Modal
        visible={showRoster}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRoster(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.rosterSheet, { paddingBottom: bottomInset + 16 }]}>
            {/* Roster Header */}
            <View style={styles.rosterHeader}>
              <View>
                <Text style={styles.rosterTitle}>In this Call</Text>
                <Text style={styles.rosterSubTitle}>{allParticipants.length} connected participants</Text>
              </View>
              <Pressable
                accessibilityLabel="Close Roster"
                onPress={() => setShowRoster(false)}
                style={styles.rosterCloseBtn}
              >
                <X size={20} color="#ffffff" />
              </Pressable>
            </View>

            {/* Member List */}
            <ScrollView style={styles.rosterList} showsVerticalScrollIndicator={false}>
              {allParticipants.map((item) => {
                const isSelf = item.id === user?.id || item.id === 'self';
                const profile = !isSelf ? lookupProfile(item.id) : null;
                const displayName = isSelf
                  ? user?.profile?.display_name || user?.handle || 'You'
                  : profile?.display_name || 'Member';
                const avatarUrl = isSelf ? user?.profile?.avatar_url : profile?.avatar_url;

                return (
                  <View key={item.id} style={styles.rosterRow}>
                    <Avatar
                      url={avatarUrl ?? null}
                      name={displayName}
                      speaking={item.isSpeaking}
                      size={42}
                    />
                    <View style={styles.rosterInfo}>
                      <Text style={styles.rosterName}>
                        {displayName} {isSelf ? '(You)' : ''}
                      </Text>
                      <Text style={styles.rosterRole}>
                        {item.role === 'owner' ? 'Channel Host' : 'Speaker'}
                      </Text>
                    </View>

                    <View style={styles.rosterActions}>
                      {item.isHandRaised ? (
                        <View style={styles.rosterHandBadge}>
                          <Hand size={14} color="#f59e0b" />
                        </View>
                      ) : null}
                      {item.isCameraOn ? (
                        <View style={styles.rosterBadge}>
                          <Video size={14} color={Colors.accent} />
                        </View>
                      ) : null}
                      {item.muted ? (
                        <View style={styles.rosterMutedBadge}>
                          <MicOff size={14} color="#ef4444" />
                        </View>
                      ) : (
                        <View style={styles.rosterActiveMicBadge}>
                          <Mic size={14} color="#22c55e" />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090b10',
  },

  // ── Header Bar ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCircleBtnActive: {
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Spacing.xs,
  },
  roomName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
  },
  liveDotConnected: {
    backgroundColor: '#22c55e',
  },
  liveDotConnecting: {
    backgroundColor: '#eab308',
  },
  durationBadge: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '700',
  },
  metaDivider: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 10,
  },
  participantPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accentSubtle,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  participantCount: {
    color: Colors.accentText,
    fontSize: 11,
    fontWeight: '800',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // ── Reaction Overlay ──
  reactionBubbleOverlay: {
    position: 'absolute',
    top: 130,
    alignSelf: 'center',
    zIndex: 99,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  reactionBubbleEmoji: {
    fontSize: 64,
  },

  // ── Stage ──
  stage: {
    flex: 1,
    marginTop: Spacing.xs,
  },

  // ── Spotlight Mode ──
  spotlightContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  spotlightFrame: {
    flex: 1,
    backgroundColor: '#111522',
    borderRadius: Radius.xxl,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    overflow: 'hidden',
    position: 'relative',
  },
  spotlightTopBar: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  liveTagText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  spotlightPresenterName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  spotlightRTC: {
    width: '100%',
    height: '100%',
  },
  spotlightHeroAvatar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  spotlightSpeakingWave: {
    marginTop: Spacing.sm,
  },

  // Attendee Strip
  attendeeStrip: {
    maxHeight: 82,
  },
  attendeeStripContent: {
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  stripCard: {
    width: 68,
    alignItems: 'center',
    position: 'relative',
    paddingVertical: 4,
    borderRadius: Radius.lg,
    backgroundColor: '#121622',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  stripCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  stripCardSpeaking: {
    borderColor: '#22c55e',
  },
  stripCardName: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  miniMuteBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ef4444',
    borderRadius: Radius.full,
    padding: 2,
  },

  // ── Grid Mode ──
  gridContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#121622',
    borderRadius: Radius.xxl,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    minHeight: 180,
    margin: 4,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCardMulti: {
    minHeight: 140,
  },
  gridCardSpeaking: {
    borderColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  gridAvatarCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gridSpeakingGlow: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: Radius.full,
    borderWidth: 3,
    borderColor: '#22c55e',
    transform: [{ scale: 1.2 }],
  },
  raisedHandTag: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: '#f59e0b',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  raisedHandText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  gridWaveformBox: {
    position: 'absolute',
    bottom: 42,
  },
  gridCardBottomBar: {
    position: 'absolute',
    bottom: Spacing.sm,
    left: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  namePill: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    maxWidth: '72%',
  },
  namePillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  statusIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusMutedPill: {
    backgroundColor: '#ef4444',
    padding: 4,
    borderRadius: Radius.full,
  },
  statusLivePill: {
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    padding: 4,
    borderRadius: Radius.full,
  },
  statusCameraPill: {
    backgroundColor: Colors.accentSubtle,
    padding: 4,
    borderRadius: Radius.full,
  },

  // ── Waveform Animation ──
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  waveBar: {
    width: 3,
    backgroundColor: '#22c55e',
    borderRadius: 2,
  },
  waveBar1: { height: 10 },
  waveBar2: { height: 16 },
  waveBar3: { height: 12 },
  waveBar4: { height: 8 },

  // ── Floating Reactions Deck ──
  reactionsFloatingDeck: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#161c2b',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  reactionDeckItem: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  reactionDeckEmoji: {
    fontSize: 24,
  },

  // ── Dock ──
  dockContainer: {
    backgroundColor: '#111520',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dockCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockBtnActive: {
    backgroundColor: Colors.accentSubtle,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  dockBtnAccent: {
    backgroundColor: Colors.accent,
  },
  dockBtnDanger: {
    backgroundColor: '#ef4444',
  },
  dockBtnAmber: {
    backgroundColor: '#f59e0b',
  },
  dockEndCallBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },

  // ── Participant Roster Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  rosterSheet: {
    backgroundColor: '#131826',
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.07)',
  },
  rosterTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  rosterSubTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  rosterCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rosterList: {
    marginVertical: Spacing.xs,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  rosterInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  rosterName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  rosterRole: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    marginTop: 2,
  },
  rosterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rosterHandBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    padding: 6,
    borderRadius: Radius.full,
  },
  rosterBadge: {
    backgroundColor: Colors.accentSubtle,
    padding: 6,
    borderRadius: Radius.full,
  },
  rosterMutedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: 6,
    borderRadius: Radius.full,
  },
  rosterActiveMicBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    padding: 6,
    borderRadius: Radius.full,
  },
});
