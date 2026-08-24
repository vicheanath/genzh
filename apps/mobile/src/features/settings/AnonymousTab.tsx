import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { CurrentUser } from '@genzh/shared';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { useAppStore } from '../../lib/store';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/ThemeContext';

import { DEFAULT_ACCENT, PRESET_COLORS } from './tabs';
import { usePanel } from './styles';

const RANDOM_ALIASES = [
  'Shadow Fox',
  'Neon Phantom',
  'Cyber Panda',
  'Midnight Owl',
  'Pixel Knight',
  'Cosmic Voyager',
  'Stealth Tiger',
  'Quantum Hawk',
  'Nebula Dragon',
  'Mystic Wolf',
  'Astral Lynx',
  'Echo Viper',
  'Solar Falcon',
  'Zero Spectrum',
];

const MASK_SYMBOLS = ['🎭', '🕶️', '🦊', '👻', '🤖', '🦉', '🐺', '🐼', '⚡', '🔮', '👾', '🛸'];

/** Your masked alias, icon, and default posting state. */
export function AnonymousTab({ user }: { user: CurrentUser }) {
  const styles = useThemedStyles(makeStyles);
  const panel = usePanel();
  const toast = useToast();

  const anonymousAlias = useAppStore((s) => s.anonymousAlias);
  const anonymousAccent = useAppStore((s) => s.anonymousAccent);
  const anonymousAvatarSeed = useAppStore((s) => s.anonymousAvatarSeed);
  const isAnonymousByDefault = useAppStore((s) => s.isAnonymousByDefault);
  const setAnonymousSettings = useAppStore((s) => s.setAnonymousSettings);

  // Draft state: the persona is only committed on save, so leaving the tab
  // without saving leaves the stored identity untouched.
  const [alias, setAlias] = useState(anonymousAlias);
  const [accent, setAccent] = useState(anonymousAccent);
  const [symbol, setSymbol] = useState(anonymousAvatarSeed);
  const [byDefault, setByDefault] = useState(isAnonymousByDefault);

  function handleSave() {
    setAnonymousSettings({
      alias: alias.trim() || 'Anonymous Phantom',
      accent,
      avatarSeed: symbol,
      isAnonymousByDefault: byDefault,
    });
    toast.success('Anonymous persona saved', 'Your masked identity is ready for rooms.');
  }

  return (
    <ScrollView contentContainerStyle={panel.content} keyboardShouldPersistTaps="handled">
      <Text style={panel.title}>Anonymous persona</Text>
      <Text style={panel.description}>
        Your masked alias, icon, and default posting state. Your real account stays private
        behind it.
      </Text>

      <View style={panel.toggleCard}>
        <View style={panel.toggleInfo}>
          <Text style={panel.toggleTitle}>Post anonymously by default</Text>
          <Text style={panel.toggleSubtitle}>
            In rooms that permit anonymity, start in your masked persona rather than as
            yourself.
          </Text>
        </View>
        <Switch
          checked={byDefault}
          onCheckedChange={setByDefault}
          accessibilityLabel="Post anonymously by default"
        />
      </View>

      <View style={panel.previewCard}>
        <View style={[panel.previewBanner, { backgroundColor: accent }]} />
        <View style={panel.previewBody}>
          <View style={panel.previewAvatarWrap}>
            <View style={[styles.mask, { backgroundColor: accent }]}>
              <Text style={styles.maskSymbol}>{symbol}</Text>
            </View>
          </View>
          <Text style={panel.previewName}>{alias || 'Anonymous Persona'}</Text>
          <Text style={panel.previewHandle}>Masked persona · hidden profile</Text>
          <Text style={panel.previewBio}>
            Your handle (@{user.handle}) and avatar are hidden from others while you speak
            under this persona.
          </Text>
        </View>
      </View>

      <View style={panel.section}>
        <View style={panel.row}>
          <Text style={panel.fieldLabel}>Alias</Text>
          <Button
            title="Randomise"
            size="sm"
            variant="ghost"
            onPress={() =>
              setAlias(
                RANDOM_ALIASES[Math.floor(Math.random() * RANDOM_ALIASES.length)] ??
                  'Shadow Fox',
              )
            }
          />
        </View>

        <Input
          value={alias}
          onChangeText={setAlias}
          placeholder="e.g. Shadow Fox"
          maxLength={32}
        />

        <Text style={panel.fieldLabel}>Mask</Text>
        <View style={styles.symbols}>
          {MASK_SYMBOLS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={`Mask ${option}`}
              accessibilityState={{ selected: symbol === option }}
              onPress={() => setSymbol(option)}
              style={[styles.symbolChip, symbol === option && styles.symbolChipActive]}
            >
              <Text style={styles.symbolText}>{option}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={panel.fieldLabel}>Persona accent colour</Text>
        <View style={panel.swatchRow}>
          {PRESET_COLORS.map((color) => (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`Accent colour ${color}`}
              onPress={() => setAccent(color)}
              style={[
                panel.swatch,
                { backgroundColor: color },
                accent.toLowerCase() === color.toLowerCase() && panel.swatchActive,
              ]}
            >
              {accent.toLowerCase() === color.toLowerCase() ? (
                <Check size={16} color="#000" strokeWidth={3} />
              ) : null}
            </Pressable>
          ))}
        </View>

        <Input
          label="Custom hex"
          value={accent}
          onChangeText={setAccent}
          placeholder={DEFAULT_ACCENT}
          autoCapitalize="none"
        />

        <Button title="Save persona" onPress={handleSave} />
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  mask: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maskSymbol: {
    fontSize: 34,
  },
  symbols: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  symbolChip: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolChipActive: {
    borderColor: c.accent,
    backgroundColor: c.accentSubtle,
  },
  symbolText: {
    fontSize: 22,
  },
});
