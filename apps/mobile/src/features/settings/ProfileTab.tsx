import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { type CurrentUser } from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Input } from '../../components/Input';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { usePrimeProfile } from '../../lib/useProfiles';
import { useColors } from '../../theme/ThemeContext';

import { DEFAULT_ACCENT, PRESET_COLORS } from './tabs';
import { useSubmission } from './useSubmission';
import { usePanel } from './styles';

/** How you appear across communities and direct messages. */
export function ProfileTab({ user }: { user: CurrentUser }) {
  const panel = usePanel();
  const c = useColors();
  const { updateProfile } = useAuth();
  const toast = useToast();
  const save = useSubmission();
  const primeProfile = usePrimeProfile();

  const [displayName, setDisplayName] = useState(user.profile.display_name ?? '');
  const [bio, setBio] = useState(user.profile.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.profile.avatar_url ?? '');
  const [accentColor, setAccentColor] = useState(user.profile.accent_color ?? DEFAULT_ACCENT);

  // Re-seed when the profile changes underneath the form — an edit saved
  // elsewhere, or the initial `me` response arriving after first render.
  const profile = user.profile;
  useEffect(() => {
    setDisplayName(profile.display_name ?? '');
    setBio(profile.bio ?? '');
    setAvatarUrl(profile.avatar_url ?? '');
    setAccentColor(profile.accent_color ?? DEFAULT_ACCENT);
  }, [profile]);

  async function onSubmit() {
    const updated = await save.run(async () =>
      updateProfile({
        display_name: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        avatar_url: avatarUrl.trim() || undefined,
        accent_color: accentColor.trim() || undefined,
      }),
    );
    if (!updated) return;

    // The transcript draws authors from the profile cache, so without this your
    // own name and avatar stay stale on your own messages until a reload.
    primeProfile({
      id: user.id,
      handle: user.handle,
      display_name: updated.display_name,
      bio: updated.bio,
      avatar_url: updated.avatar_url,
      avatar_effect: updated.avatar_effect,
      accent_color: updated.accent_color,
    });
    toast.success('Profile saved', 'Your changes are now visible to everyone.');
  }


  return (
    <ScrollView contentContainerStyle={panel.content} keyboardShouldPersistTaps="handled">
      <Text style={panel.title}>Profile</Text>
      <Text style={panel.description}>
        How you appear across communities and direct messages.
      </Text>

      {save.error ? <Callout tone="danger" text={save.error} /> : null}

      <View style={panel.previewCard}>
        <View style={[panel.previewBanner, { backgroundColor: accentColor }]} />
        <View style={panel.previewBody}>
          <View style={panel.previewAvatarWrap}>
            <Avatar
              name={displayName || user.profile.display_name}
              url={avatarUrl || user.profile.avatar_url}
              accent={accentColor}
              size={72}
              // Your own preview: online by construction, since you are here
              // looking at it.
              presence="online"
              ringColor={c.surface}
            />
          </View>
          <Text style={panel.previewName}>{displayName || user.profile.display_name}</Text>
          <Text style={panel.previewHandle}>@{user.handle}</Text>
          {bio ? <Text style={panel.previewBio}>{bio}</Text> : null}
        </View>
      </View>

      <View style={panel.section}>
        <Input
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Enter display name"
          maxLength={32}
        />

        <Input
          label="About me"
          value={bio}
          onChangeText={setBio}
          placeholder="Tell everyone a bit about yourself…"
          multiline
          numberOfLines={3}
          maxLength={190}
        />

        <Input
          label="Avatar image URL"
          value={avatarUrl}
          onChangeText={setAvatarUrl}
          placeholder="https://example.com/avatar.png"
          autoCapitalize="none"
        />

        <Text style={panel.fieldLabel}>Accent colour</Text>
        <View style={panel.swatchRow}>
          {PRESET_COLORS.map((color) => (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`Accent colour ${color}`}
              accessibilityState={{ selected: accentColor === color }}
              onPress={() => setAccentColor(color)}
              style={[
                panel.swatch,
                { backgroundColor: color },
                accentColor.toLowerCase() === color.toLowerCase() && panel.swatchActive,
              ]}
            >
              {accentColor.toLowerCase() === color.toLowerCase() ? (
                <Check size={16} color="#000" strokeWidth={3} />
              ) : null}
            </Pressable>
          ))}
        </View>

        <Input
          label="Custom hex"
          value={accentColor}
          onChangeText={setAccentColor}
          placeholder={DEFAULT_ACCENT}
          autoCapitalize="none"
        />

        <Button title="Save changes" onPress={onSubmit} loading={save.busy} />
      </View>
    </ScrollView>
  );
}
