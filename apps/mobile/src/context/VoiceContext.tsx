import React, { createContext, useContext, useMemo, useRef } from 'react';
import {
  media as mediaApi,
  useCallVM,
  type CallCapabilities,
  type CallVM,
  type Uuid,
} from '@genzh/shared';

import { useAuth } from './AuthContext';
import { useAppStore } from '../lib/store';
import {
  CAMERA_AVAILABLE,
  SCREEN_SHARE_AVAILABLE,
  SCREEN_SHARE_UNAVAILABLE_REASON,
  VOICE_AVAILABLE,
} from '../lib/voiceSupport';
import {
  requestCameraPermission,
  requestMicrophonePermission,
} from '../lib/devicePermissions';
import { MobileVoiceClient } from '../lib/webrtc/MobileVoiceClient';

/**
 * The call, for this platform.
 *
 * Almost nothing lives here any more. `useCallVM` in `@genzh/shared` owns what
 * a call *is* — who is in it, what is being transmitted, how to join and leave —
 * and this supplies the three things that are genuinely local: the WebRTC
 * client, what this build is capable of, and the two device settings the SFU
 * has no opinion about.
 *
 * Deafen and speakerphone are those two. Neither is a call concept: deafening
 * is a local output decision and speakerphone is a routing one, so both stay in
 * the persisted device store where they survive between calls, rather than
 * being invented again inside the view model.
 */
export interface VoiceContextValue extends CallVM {
  /** Local output, not a call state — nobody else can tell you are deafened. */
  deafened: boolean;
  speakerphone: boolean;
  toggleDeafen: () => void;
  toggleSpeakerphone: () => void;
  /** Empty when sharing works. Shown next to the disabled control when not. */
  screenShareUnavailableReason: string;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { token, user, getToken } = useAuth();

  const deafened = useAppStore((s) => s.isDeafened);
  const speakerphone = useAppStore((s) => s.speakerphone);
  const toggleDeafen = useAppStore((s) => s.toggleDeafen);
  const setDevicePreferences = useAppStore((s) => s.setDevicePreferences);

  // The room the client should negotiate for. Held in a ref because the client
  // is built once and outlives any particular room, and asks for a session only
  // at the moment it connects.
  const roomIdRef = useRef<Uuid | null>(null);

  const clientRef = useRef<MobileVoiceClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new MobileVoiceClient(async () => {
      const roomId = roomIdRef.current;
      if (!roomId) throw new Error('No active voice room');
      return mediaApi.join(await getToken(), roomId);
    });
  }

  const capabilities = useMemo<CallCapabilities>(
    () => ({
      audio: VOICE_AVAILABLE,
      camera: CAMERA_AVAILABLE,
      screenShare: SCREEN_SHARE_AVAILABLE,
    }),
    [],
  );

  const vm = useCallVM({
    client: clientRef.current,
    token,
    selfUserId: user?.id ?? null,
    capabilities,
    requestMicrophone: requestMicrophonePermission,
    requestCamera: requestCameraPermission,
  });

  const value = useMemo<VoiceContextValue>(
    () => ({
      ...vm,
      // Wrapped so the room id is in the ref before the client is told to
      // connect — the session factory reads it during `join`.
      join: async (roomId: Uuid, name: string) => {
        roomIdRef.current = roomId;
        await vm.join(roomId, name);
      },
      leave: async () => {
        await vm.leave();
        roomIdRef.current = null;
      },
      deafened,
      speakerphone,
      toggleDeafen,
      toggleSpeakerphone: () => setDevicePreferences({ speakerphone: !speakerphone }),
      screenShareUnavailableReason: SCREEN_SHARE_UNAVAILABLE_REASON,
    }),
    [vm, deafened, speakerphone, toggleDeafen, setDevicePreferences],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within a VoiceProvider');
  return ctx;
}
