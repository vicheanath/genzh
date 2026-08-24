import React, { createContext, useContext, useState } from 'react';
import { type Uuid } from '@genzh/shared';

export interface VoiceParticipant {
  id: string;
  name: string;
  speaking: boolean;
  muted: boolean;
}

interface VoiceContextType {
  activeRoomId: Uuid | null;
  activeRoomName: string | null;
  status: 'idle' | 'connecting' | 'connected';
  muted: boolean;
  speaking: boolean;
  participants: VoiceParticipant[];
  joinRoom: (roomId: Uuid, name: string) => Promise<void>;
  leaveRoom: () => void;
  toggleMute: () => void;
}

const VoiceContext = createContext<VoiceContextType | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [activeRoomId, setActiveRoomId] = useState<Uuid | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);

  const joinRoom = async (roomId: Uuid, name: string) => {
    setActiveRoomId(roomId);
    setActiveRoomName(name);
    setStatus('connecting');

    // Simulate voice connection setup
    setTimeout(() => {
      setStatus('connected');
      setParticipants([
        { id: 'self', name: 'You', speaking: false, muted: false },
      ]);
    }, 400);
  };

  const leaveRoom = () => {
    setActiveRoomId(null);
    setActiveRoomName(null);
    setStatus('idle');
    setParticipants([]);
    setSpeaking(false);
  };

  const toggleMute = () => {
    setMuted((prev) => !prev);
  };

  return (
    <VoiceContext.Provider
      value={{
        activeRoomId,
        activeRoomName,
        status,
        muted,
        speaking,
        participants,
        joinRoom,
        leaveRoom,
        toggleMute,
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
