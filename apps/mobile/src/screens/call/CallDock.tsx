import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import {
  Hand,
  HeadphoneOff,
  Headphones,
  LayoutGrid,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Smile,
  Video,
  VideoOff,
  Volume1,
  Volume2,
} from 'lucide-react-native';

import { CallControlButton } from '../../components/CallControlButton';
import { Radius, Spacing, Stage } from '../../theme/tokens';

const QUICK_REACTIONS = ['❤️', '🔥', '👍', '👏', '🎉', '😂', '👋', '💯'] as const;

export interface CallDockProps {
  muted: boolean;
  deafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  speakerphone: boolean;
  gridView: boolean;
  reactionsOpen: boolean;
  bottomInset: number;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleHandRaise: () => void;
  onToggleSpeakerphone: () => void;
  onToggleView: () => void;
  onToggleReactions: () => void;
  onReact: (emoji: string) => void;
  onLeave: () => void;
}

/**
 * The controls, as one dock.
 *
 * Two tiers rather than the old single row of seven equal circles. Seven 44pt
 * targets do not fit across a small phone without shrinking below the size a
 * thumb can hit, and treating "end the call" as the same weight as "switch to
 * grid view" is how people hang up by accident.
 *
 * So: the four situational controls ride a smaller top row, and the five you
 * reach for constantly sit below at full size, in the thumb zone. The primary
 * row spreads across the dock rather than sitting on a fixed gap, so it still
 * fits a 320pt phone. Speakerphone and
 * the view switch moved down here from the header for the same reason — they
 * are controls, and the header is for knowing where you are.
 *
 * Glass on the stage, per `--glass-bg`: the dock floats over the tiles rather
 * than walling off the bottom of the screen, so the call stays the whole
 * screen.
 */
export function CallDock({
  muted,
  deafened,
  isCameraOn,
  isScreenSharing,
  isHandRaised,
  speakerphone,
  gridView,
  reactionsOpen,
  bottomInset,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
  onToggleHandRaise,
  onToggleSpeakerphone,
  onToggleView,
  onToggleReactions,
  onReact,
  onLeave,
}: CallDockProps) {
  return (
    <View style={[styles.container, { paddingBottom: bottomInset + Spacing.xs }]}>
      {reactionsOpen ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(140)}
          style={styles.reactionDeck}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`React with ${emoji}`}
              onPress={() => onReact(emoji)}
              style={styles.reactionItem}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}

      <View style={styles.dock}>
        <View style={styles.secondaryRow}>
          <CallControlButton
            accessibilityLabel={isScreenSharing ? 'Stop sharing your screen' : 'Share your screen'}
            tone={isScreenSharing ? 'on' : 'off'}
            size={38}
            onPress={onToggleScreenShare}
          >
            {(color) =>
              isScreenSharing ? <MonitorX size={18} color={color} /> : <MonitorUp size={18} color={color} />
            }
          </CallControlButton>

          <CallControlButton
            accessibilityLabel={isHandRaised ? 'Lower your hand' : 'Raise your hand'}
            tone={isHandRaised ? 'warning' : 'off'}
            size={38}
            onPress={onToggleHandRaise}
          >
            {(color) => <Hand size={18} color={color} />}
          </CallControlButton>

          <CallControlButton
            accessibilityLabel={speakerphone ? 'Switch to earpiece' : 'Switch to speakerphone'}
            tone={speakerphone ? 'on' : 'off'}
            size={38}
            onPress={onToggleSpeakerphone}
          >
            {(color) =>
              speakerphone ? <Volume2 size={18} color={color} /> : <Volume1 size={18} color={color} />
            }
          </CallControlButton>

          <CallControlButton
            accessibilityLabel={gridView ? 'Switch to spotlight view' : 'Switch to grid view'}
            tone={gridView ? 'on' : 'off'}
            size={38}
            onPress={onToggleView}
          >
            {(color) => <LayoutGrid size={18} color={color} />}
          </CallControlButton>
        </View>

        <View style={styles.primaryRow}>
          <CallControlButton
            accessibilityLabel="Send a reaction"
            tone={reactionsOpen ? 'on' : 'off'}
            onPress={onToggleReactions}
          >
            {(color) => <Smile size={22} color={color} />}
          </CallControlButton>

          <CallControlButton
            accessibilityLabel={muted ? 'Unmute your microphone' : 'Mute your microphone'}
            tone={muted ? 'danger' : 'off'}
            onPress={onToggleMute}
          >
            {(color) => (muted ? <MicOff size={22} color={color} /> : <Mic size={22} color={color} />)}
          </CallControlButton>

          <CallControlButton
            accessibilityLabel={isCameraOn ? 'Turn your camera off' : 'Turn your camera on'}
            tone={isCameraOn ? 'on' : 'off'}
            onPress={onToggleCamera}
          >
            {(color) =>
              isCameraOn ? <Video size={22} color={color} /> : <VideoOff size={22} color={color} />
            }
          </CallControlButton>

          <CallControlButton
            accessibilityLabel={deafened ? 'Turn call audio back on' : 'Deafen yourself'}
            tone={deafened ? 'danger' : 'off'}
            onPress={onToggleDeafen}
          >
            {(color) =>
              deafened ? <HeadphoneOff size={22} color={color} /> : <Headphones size={22} color={color} />
            }
          </CallControlButton>

          {/* The only solid red on the stage, and slightly larger than its
              neighbours — leaving should never be a button you hit by feel. */}
          <CallControlButton
            accessibilityLabel="Leave the call"
            tone="disconnect"
            size={54}
            onPress={onLeave}
          >
            {(color) => <PhoneOff size={22} color={color} />}
          </CallControlButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  dock: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.xxl,
    backgroundColor: Stage.glass,
    borderWidth: 1,
    borderColor: Stage.glassBorder,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  primaryRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  reactionDeck: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Stage.glass,
    borderWidth: 1,
    borderColor: Stage.glassBorder,
  },
  reactionItem: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  reactionEmoji: {
    fontSize: 24,
  },
});
