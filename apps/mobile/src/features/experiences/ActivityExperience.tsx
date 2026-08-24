import React, { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Eraser, Music, Palette, Send, Trash2 } from 'lucide-react-native';
import type { RoomWithPermissions } from '@genzh/shared';

import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Slider } from '../../components/Slider';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Radius, Spacing, type Palette as ThemePalette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { useExp, postToChat } from './shared';

type Tab = 'whiteboard' | 'soundboard';

const COLORS = [
  '#ec4899',
  '#06b6d4',
  '#8b5cf6',
  '#eab308',
  '#10b981',
  '#ef4444',
  '#ffffff',
  '#0f172a',
];

const SOUNDS = [
  { name: 'Air horn', emoji: '📯' },
  { name: 'Vine boom', emoji: '💥' },
  { name: 'Applause', emoji: '👏' },
  { name: 'Victory fanfare', emoji: '🎺' },
  { name: '8-bit jump', emoji: '🍄' },
  { name: 'Level up', emoji: '✨' },
  { name: 'Sad trombone', emoji: '🎷' },
  { name: 'Laser beam', emoji: '⚡' },
];

interface Stroke {
  d: string;
  color: string;
  width: number;
}

const BOARD_HEIGHT = 320;

/**
 * The activity lounge: a shared whiteboard and a soundboard.
 *
 * The board is drawn with `react-native-svg` rather than a canvas — React
 * Native has no 2D canvas, and a path per stroke is both simpler to undo and
 * cheap enough at the scale a phone screen can hold.
 */
export function ActivityExperience({ room }: { room: RoomWithPermissions }) {
  const styles = useThemedStyles(makeStyles);
  const exp = useExp();
  const c = useColors();
  const { getToken } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('whiteboard');

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const [brush, setBrush] = useState(4);
  const [erasing, setErasing] = useState(false);
  const [width, setWidth] = useState(0);

  // The pan handlers are installed once, so they read the live settings
  // through refs rather than the values captured at first render.
  const colorRef = useRef(color);
  const brushRef = useRef(brush);
  const erasingRef = useRef(erasing);
  colorRef.current = color;
  brushRef.current = brush;
  erasingRef.current = erasing;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setCurrent({
            d: `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`,
            // Erasing paints the board's own colour: with one flat background
            // that is indistinguishable from removing ink, and it keeps every
            // stroke a plain path.
            color: erasingRef.current ? c.sunken : colorRef.current,
            width: erasingRef.current ? brushRef.current * 3 : brushRef.current,
          });
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setCurrent((stroke) =>
            stroke
              ? { ...stroke, d: `${stroke.d} L ${locationX.toFixed(1)} ${locationY.toFixed(1)}` }
              : stroke,
          );
        },
        onPanResponderRelease: () => {
          setCurrent((stroke) => {
            if (stroke) setStrokes((all) => [...all, stroke]);
            return null;
          });
        },
      }),
    [],
  );

  async function playSound(name: string, emoji: string) {
    try {
      await postToChat(room, await getToken(), `${emoji} ${name}!`);
      toast.success(`${name} dropped into chat`);
    } catch {
      toast.error('Could not post to chat');
    }
  }

  return (
    <ScrollView contentContainerStyle={exp.content}>
      <Tabs
        value={tab}
        onValueChange={setTab}
        variant="pill"
        items={[
          {
            value: 'whiteboard',
            label: 'Whiteboard',
            icon: <Palette size={14} color={tab === 'whiteboard' ? c.accentContrast : c.textDim} />,
          },
          {
            value: 'soundboard',
            label: 'Soundboard',
            icon: <Music size={14} color={tab === 'soundboard' ? c.accentContrast : c.textDim} />,
          },
        ]}
      />

      {tab === 'whiteboard' ? (
        <>
          <View
            style={styles.board}
            onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
            {...responder.panHandlers}
          >
            <Svg width={width || '100%'} height={BOARD_HEIGHT}>
              {[...strokes, ...(current ? [current] : [])].map((stroke, index) => (
                <Path
                  key={index}
                  d={stroke.d}
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </Svg>
          </View>

          <View style={exp.chipRow}>
            {COLORS.map((swatch) => (
              <Pressable
                key={swatch}
                accessibilityLabel={`Colour ${swatch}`}
                onPress={() => {
                  setColor(swatch);
                  setErasing(false);
                }}
                style={[
                  styles.swatch,
                  { backgroundColor: swatch },
                  !erasing && color === swatch && styles.swatchActive,
                ]}
              />
            ))}
          </View>

          <Slider
            label="Brush size"
            value={brush}
            min={1}
            max={24}
            onValueChange={setBrush}
            formatValue={(value) => `${Math.round(value)}px`}
          />

          <View style={exp.row}>
            <Button
              title={erasing ? 'Erasing' : 'Eraser'}
              variant={erasing ? 'primary' : 'secondary'}
              style={exp.grow}
              onPress={() => setErasing((on) => !on)}
              icon={
                <Eraser size={15} color={erasing ? c.accentContrast : c.text} />
              }
            />
            <Button
              title="Undo"
              variant="ghost"
              onPress={() => setStrokes((all) => all.slice(0, -1))}
              disabled={strokes.length === 0}
            />
            <Button
              title="Clear"
              variant="ghost"
              onPress={() => setStrokes([])}
              disabled={strokes.length === 0}
              icon={<Trash2 size={15} color={c.textMuted} />}
            />
          </View>
        </>
      ) : (
        <>
          <Callout
            tone="info"
            text="Audio playback needs a native sound module this build does not carry — for now a pad announces itself in the room chat instead."
          />

          <View style={styles.pads}>
            {SOUNDS.map((sound) => (
              <Pressable
                key={sound.name}
                onPress={() => void playSound(sound.name, sound.emoji)}
                style={({ pressed }) => [styles.pad, pressed && styles.padPressed]}
              >
                <Text style={styles.padEmoji}>{sound.emoji}</Text>
                <Text style={styles.padName}>{sound.name}</Text>
                <Send size={12} color={c.textDim} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
  board: {
    height: BOARD_HEIGHT,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.sunken,
    overflow: 'hidden',
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: c.text,
  },
  pads: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pad: {
    width: '48%',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingVertical: Spacing.lg,
  },
  padPressed: {
    backgroundColor: c.accentSubtle,
    borderColor: c.accent,
  },
  padEmoji: {
    fontSize: 28,
  },
  padName: {
    color: c.text,
    fontSize: 12,
    fontWeight: '700',
  },
});
