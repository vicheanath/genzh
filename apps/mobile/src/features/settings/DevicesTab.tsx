import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Slider } from '../../components/Slider';
import { Switch } from '../../components/Switch';
import { useAppStore } from '../../lib/store';

import { panel } from './styles';

/**
 * Voice & video preferences.
 *
 * The web app's version enumerates microphones, cameras and speakers, because a
 * browser can. A phone has one earpiece and one loudspeaker and the OS owns the
 * routing, so what is actually settable here is the playback gain and whether
 * calls come out of the loudspeaker — which is the mobile equivalent of picking
 * an output device.
 */
export function DevicesTab() {
  const outputVolume = useAppStore((s) => s.outputVolume);
  const speakerphone = useAppStore((s) => s.speakerphone);
  const isMuted = useAppStore((s) => s.isMuted);
  const isDeafened = useAppStore((s) => s.isDeafened);
  const setDevicePreferences = useAppStore((s) => s.setDevicePreferences);
  const toggleMute = useAppStore((s) => s.toggleMute);
  const toggleDeafen = useAppStore((s) => s.toggleDeafen);

  return (
    <ScrollView contentContainerStyle={panel.content}>
      <Text style={panel.title}>Voice & video</Text>
      <Text style={panel.description}>
        How calls sound on this device. Changes apply immediately, including to a call you
        are already in.
      </Text>

      <View style={panel.section}>
        <Text style={panel.sectionTitle}>Output</Text>

        <Slider
          label="Playback volume"
          value={outputVolume}
          min={0}
          max={100}
          formatValue={(value) => `${Math.round(value)}%`}
          onValueChange={(value) => setDevicePreferences({ outputVolume: value })}
        />

        <View style={panel.row}>
          <View style={panel.toggleInfo}>
            <Text style={panel.toggleTitle}>Speakerphone</Text>
            <Text style={panel.toggleSubtitle}>
              Route calls through the loudspeaker rather than the earpiece.
            </Text>
          </View>
          <Switch
            checked={speakerphone}
            onCheckedChange={(next) => setDevicePreferences({ speakerphone: next })}
            accessibilityLabel="Speakerphone"
          />
        </View>
      </View>

      <View style={panel.section}>
        <Text style={panel.sectionTitle}>Defaults</Text>

        <View style={panel.row}>
          <View style={panel.toggleInfo}>
            <Text style={panel.toggleTitle}>Join muted</Text>
            <Text style={panel.toggleSubtitle}>
              Start every call with your microphone off.
            </Text>
          </View>
          <Switch
            checked={isMuted}
            onCheckedChange={() => toggleMute()}
            accessibilityLabel="Join muted"
          />
        </View>

        <View style={panel.row}>
          <View style={panel.toggleInfo}>
            <Text style={panel.toggleTitle}>Join deafened</Text>
            <Text style={panel.toggleSubtitle}>
              Start every call hearing nobody. Deafening also mutes you.
            </Text>
          </View>
          <Switch
            checked={isDeafened}
            onCheckedChange={() => toggleDeafen()}
            accessibilityLabel="Join deafened"
          />
        </View>
      </View>
    </ScrollView>
  );
}
