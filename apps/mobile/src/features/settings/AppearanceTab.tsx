import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Check, Monitor, Moon, Sun } from 'lucide-react-native';

import { useTheme, useThemedStyles, useColors, type ThemePreference } from '../../theme/ThemeContext';
import { Radius, Spacing, type Palette } from '../../theme/tokens';

import { usePanel } from './styles';

const THEMES: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  hint: string;
  icon: typeof Sun;
}> = [
  { value: 'dark', label: 'Dark', hint: 'Low light, warm espresso ground', icon: Moon },
  { value: 'light', label: 'Light', hint: 'Bright, warm bone ground', icon: Sun },
  { value: 'system', label: 'System', hint: 'Follow your OS setting', icon: Monitor },
];

/**
 * Theme selection — the mobile half of the web's `AppearanceTab`.
 *
 * The three options are the same three, and `system` is stored as `system`
 * rather than resolved to a literal: a phone flips to dark on a schedule, and
 * a resolved value would freeze the app to whatever it happened to be at the
 * moment of the tap.
 */
export function AppearanceTab() {
  const panel = usePanel();
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { preference, setPreference } = useTheme();

  return (
    <ScrollView contentContainerStyle={panel.content} keyboardShouldPersistTaps="handled">
      <Text style={panel.title}>Appearance</Text>
      <Text style={panel.description}>How genzh looks on this device.</Text>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Theme"
        style={styles.group}
      >
        {THEMES.map(({ value, label, hint, icon: Icon }) => {
          const active = preference === value;

          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}. ${hint}`}
              onPress={() => setPreference(value)}
              style={[styles.card, active && styles.cardActive]}
            >
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Icon size={22} color={active ? c.accentContrast : c.textMuted} />
              </View>

              <View style={styles.copy}>
                <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
                <Text style={styles.hint}>{hint}</Text>
              </View>

              {active ? <Check size={18} color={c.accentText} /> : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => ({
  group: {
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  cardActive: {
    borderColor: c.accent,
    backgroundColor: c.accentSubtle,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.surfaceMuted,
  },
  iconWrapActive: {
    backgroundColor: c.accent,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: c.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  labelActive: {
    color: c.accentText,
  },
  hint: {
    color: c.textSubtle,
    fontSize: 12.5,
  },
});
