import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Server, User, Check } from 'lucide-react-native';
import { ACCENT_SWATCHES } from '@genzh/shared';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_API_URL, getApiUrl, saveApiUrl } from '../../api/config';
import { Avatar } from '../../components/Avatar';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Colors, Radius } from '../../theme/tokens';

export function SettingsScreen() {
  const { user, updateProfile, logout } = useAuth();

  const [displayName, setDisplayName] = useState(user?.profile?.display_name || '');
  const [bio, setBio] = useState(user?.profile?.bio || '');
  const [accentColor, setAccentColor] = useState(user?.profile?.accent_color || Colors.accent);
  const [apiUrl, setApiUrl] = useState(getApiUrl());
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingServer, setSavingServer] = useState(false);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({
        display_name: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        accent_color: accentColor || undefined,
      });
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveServer = async () => {
    if (!apiUrl.trim()) return;
    setSavingServer(true);
    try {
      await saveApiUrl(apiUrl.trim());
      Alert.alert('Saved', 'Server API URL updated.');
    } finally {
      setSavingServer(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* User Card */}
        <View style={styles.userCard}>
          <Avatar
            name={displayName || user?.handle || 'User'}
            url={user?.profile?.avatar_url}
            accent={accentColor}
            size={60}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{displayName || user?.handle}</Text>
            <Text style={styles.userHandle}>@{user?.handle}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* Profile Settings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <User size={18} color={Colors.accent} />
            <Text style={styles.sectionTitle}>EDIT PROFILE</Text>
          </View>

          <Input
            label="Display Name"
            placeholder="Your name"
            value={displayName}
            onChangeText={setDisplayName}
          />

          <Input
            label="Bio"
            placeholder="Tell the community about yourself..."
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>ACCENT COLOR</Text>
          <View style={styles.swatchRow}>
            {ACCENT_SWATCHES.map((swatch) => {
              const isSelected = accentColor.toLowerCase() === swatch.value.toLowerCase();
              return (
                <TouchableOpacity
                  key={swatch.value}
                  style={[
                    styles.swatchBtn,
                    { backgroundColor: swatch.value },
                    isSelected && styles.swatchBtnSelected,
                  ]}
                  onPress={() => setAccentColor(swatch.value)}
                >
                  {isSelected && <Check size={16} color="#000" />}
                </TouchableOpacity>
              );
            })}
          </View>

          <Button
            title="Save Profile"
            onPress={handleSaveProfile}
            loading={savingProfile}
            style={{ marginTop: 18 }}
          />
        </View>

        {/* Server Config */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Server size={18} color={Colors.live} />
            <Text style={styles.sectionTitle}>SERVER CONNECTION</Text>
          </View>

          {/* The placeholder shows the address actually detected on this
              device rather than a generic example, so someone debugging a
              connection can see what the app resolved on its own before
              deciding what to type over it. */}
          <Input
            label="API & WebSocket Endpoint"
            placeholder={DEFAULT_API_URL}
            value={apiUrl}
            onChangeText={setApiUrl}
            autoCapitalize="none"
          />
          <Text style={styles.hint}>
            Detected automatically from the dev server. Change it only if the API runs
            somewhere else.
          </Text>

          <Button
            title="Update Server URL"
            variant="secondary"
            onPress={handleSaveServer}
            loading={savingServer}
          />
        </View>

        {/* Logout */}
        <Button
          title="Sign Out"
          variant="danger"
          icon={<LogOut size={18} color={Colors.danger} />}
          onPress={() => {
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: logout },
            ]);
          }}
          style={styles.logoutBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  content: {
    padding: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userInfo: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  userHandle: {
    fontSize: 13,
    color: Colors.accent,
    marginTop: 2,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
  },
  hint: {
    fontSize: 11,
    lineHeight: 15,
    color: Colors.textMuted,
    marginTop: -6,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatchBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchBtnSelected: {
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  logoutBtn: {
    marginBottom: 40,
  },
});
