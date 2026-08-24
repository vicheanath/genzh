import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  ApiError,
  media as mediaApi,
  rooms as roomsApi,
  type Uuid,
} from '@genzh/shared';

import { useAuth } from './AuthContext';
import { useAppStore } from '../lib/store';
import { VOICE_AVAILABLE } from '../lib/voiceSupport';

export interface VoiceParticipant {
  id: Uuid;
  role: string;
  muted: boolean;
  anonymous: boolean;
}

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface VoiceContextType {
  activeRoomId: Uuid | null;
  activeRoomName: string | null;
  status: VoiceStatus;
  error: string | null;
  /** True when audio can actually flow. False in a build without WebRTC. */
  audioAvailable: boolean;
  muted: boolean;
  deafened: boolean;
  participants: VoiceParticipant[];
  joinRoom: (roomId: Uuid, name: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  refreshParticipants: () => Promise<void>;
}

const VoiceContext = createContext<VoiceContextType | null>(null);

/** How often the roster is re-fetched while a call is up. */
const ROSTER_INTERVAL_MS = 10_000;

/**
 * Membership of a voice room.
 *
 * What is real here is the *room*: joining registers you as a participant, the
 * roster is the server's, and leaving releases the slot — so other people see
 * you come and go exactly as they would from the web client.
 *
 * What is not real here is the audio. Carrying it needs `react-native-webrtc`,
 * a native module Expo Go does not ship, so in this build `audioAvailable` is
 * false and every voice surface says so rather than pretending. This used to
 * fake the whole thing with a `setTimeout` and a hardcoded "You" in the
 * participant list, which looked like a working call and was not one.
 */
export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { getToken, user } = useAuth();

  const muted = useAppStore((s) => s.isMuted);
  const deafened = useAppStore((s) => s.isDeafened);
  const toggleMuteState = useAppStore((s) => s.toggleMute);
  const toggleDeafenState = useAppStore((s) => s.toggleDeafen);

  const [activeRoomId, setActiveRoomId] = useState<Uuid | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);

  const refreshParticipants = useCallback(async () => {
    if (!activeRoomId) return;
    try {
      const list = await roomsApi.participants(await getToken(), activeRoomId);
      setParticipants(
        list.map((participant) => ({
          id: participant.user_id,
          role: participant.role,
          muted: participant.is_muted,
          anonymous: participant.is_anonymous,
        })),
      );
    } catch {
      // A dropped roster poll is not worth tearing the call down for; the next
      // tick reconciles.
    }
  }, [activeRoomId, getToken]);

  // The roster is polled rather than pushed: the socket carries messages and
  // presence, not room membership, so this is the only way to notice somebody
  // else joining the call.
  useEffect(() => {
    if (status !== 'connected') return;

    void refreshParticipants();
    const timer = setInterval(() => void refreshParticipants(), ROSTER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status, refreshParticipants]);

  const joinRoom = useCallback(
    async (roomId: Uuid, name: string) => {
      setActiveRoomId(roomId);
      setActiveRoomName(name);
      setStatus('connecting');
      setError(null);

      try {
        const token = await getToken();
        // Both calls matter: `rooms.join` makes you a participant of the room,
        // and `media.join` reserves a slot on the media server and hands back
        // the credentials a WebRTC client would use.
        await roomsApi.join(token, roomId).catch((cause: unknown) => {
          // Already a participant is the normal case when re-entering a room.
          if (cause instanceof ApiError && cause.code === 'CONFLICT') return;
          throw cause;
        });
        await mediaApi.join(token, roomId);

        setStatus('connected');
      } catch (cause) {
        setStatus('error');
        setError(cause instanceof ApiError ? cause.message : 'Could not join the call');
      }
    },
    [getToken],
  );

  const leaveRoom = useCallback(async () => {
    const roomId = activeRoomId;

    setActiveRoomId(null);
    setActiveRoomName(null);
    setStatus('idle');
    setParticipants([]);
    setError(null);

    if (!roomId) return;

    try {
      const token = await getToken();
      await mediaApi.leave(token, roomId);
      await roomsApi.leave(token, roomId);
    } catch {
      // The server drops a participant that stops heartbeating anyway, so a
      // failed leave costs a stale row for a moment and nothing else.
    }
  }, [activeRoomId, getToken]);

  return (
    <VoiceContext.Provider
      value={{
        activeRoomId,
        activeRoomName,
        status,
        error,
        audioAvailable: VOICE_AVAILABLE,
        muted,
        deafened,
        participants: participants.filter((participant) => participant.id !== user?.id),
        joinRoom,
        leaveRoom,
        toggleMute: toggleMuteState,
        toggleDeafen: toggleDeafenState,
        refreshParticipants,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextType {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within a VoiceProvider');
  return ctx;
}
