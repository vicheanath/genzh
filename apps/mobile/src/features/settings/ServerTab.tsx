import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Input } from '../../components/Input';
import { useToast } from '../../components/Toast';
import { DEFAULT_API_URL, getApiUrl, saveApiUrl } from '../../api/config';
import { syncSocketBaseUrl } from '../../lib/socket';

import { panel } from './styles';

/**
 * Which machine on the network is running the API.
 *
 * The web app has no equivalent tab and does not need one: a browser talks to
 * the origin it was served from. A phone downloaded its bundle from Metro and
 * has to be told separately where the API lives — usually the same laptop, on a
 * different port.
 */
export function ServerTab() {
  const toast = useToast();
  const [apiUrl, setApiUrl] = useState(getApiUrl());
  const [saving, setSaving] = useState(false);

  async function handleSave(url: string) {
    const clean = url.trim();
    if (!clean) return;

    setSaving(true);
    try {
      await saveApiUrl(clean);
      // The socket holds its own copy of the base URL, so it has to be told
      // too — otherwise chat keeps talking to the previous host.
      syncSocketBaseUrl();
      setApiUrl(getApiUrl());
      toast.success('Server updated', 'Sign out and back in if requests start failing.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={panel.content} keyboardShouldPersistTaps="handled">
      <Text style={panel.title}>Server</Text>
      <Text style={panel.description}>
        Where this app sends its requests. Detected from the dev server the bundle came
        from, and overridable here.
      </Text>

      <Callout
        tone="info"
        text={`Detected default: ${DEFAULT_API_URL}`}
      />

      <View style={panel.section}>
        <Input
          label="API base URL"
          value={apiUrl}
          onChangeText={setApiUrl}
          placeholder={DEFAULT_API_URL}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Button title="Save" onPress={() => void handleSave(apiUrl)} loading={saving} />
        <Button
          title="Reset to detected default"
          variant="ghost"
          onPress={() => void handleSave(DEFAULT_API_URL)}
        />
      </View>
    </ScrollView>
  );
}
