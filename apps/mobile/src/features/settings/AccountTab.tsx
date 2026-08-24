import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CurrentUser } from '@genzh/shared';

import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/ThemeContext';

import { usePanel } from './styles';

/** Your credentials and the identifier other people use to find you. */
export function AccountTab({ user }: { user: CurrentUser }) {
  const styles = useThemedStyles(makeStyles);
  const panel = usePanel();
  return (
    <ScrollView contentContainerStyle={panel.content}>
      <Text style={panel.title}>My account</Text>
      <Text style={panel.description}>
        Your credentials and the identifier other people use to find you.
      </Text>

      <View style={panel.section}>
        <View style={panel.keyValue}>
          <Text style={panel.key}>User ID</Text>
          {/*
            A read-only field rather than a copy button: the clipboard needs a
            native module this Expo Go build does not carry, and a long press
            here gives the platform's own Copy — which is the same gesture
            people already use to lift a string out of an app.
          */}
          <TextInput
            style={styles.selectable}
            value={user.id}
            editable={false}
            selectTextOnFocus
            multiline
          />
          <Text style={styles.hint}>Long-press to select and copy.</Text>
        </View>
      </View>

      <View style={panel.section}>
        <View style={panel.keyValue}>
          <Text style={panel.key}>Handle</Text>
          <Text style={panel.value}>@{user.handle}</Text>
        </View>

        <View style={panel.keyValue}>
          <Text style={panel.key}>Email</Text>
          <Text style={panel.value}>{user.email}</Text>
        </View>

        <View style={panel.keyValue}>
          <Text style={panel.key}>Display name</Text>
          <Text style={panel.value}>{user.profile.display_name}</Text>
        </View>
      </View>

      <View style={panel.section}>
        <Text style={panel.sectionTitle}>Security</Text>
        <Text style={styles.body}>
          Signed in with a bearer session that refreshes automatically. Signing out ends it
          on this device.
        </Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  selectable: {
    color: c.accentText,
    fontFamily: 'monospace',
    fontSize: 12,
    backgroundColor: c.sunken,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  hint: {
    color: c.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  body: {
    color: c.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
