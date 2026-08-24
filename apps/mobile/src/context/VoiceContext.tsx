import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ApiError,
  media as mediaApi,
  rooms as roomsApi,
  type Uuid,
} from '@genzh/shared';

import { useAuth } from './AuthContext';
import { useAppStore } from '../lib/store';
import { VOICE_AVAILABLE } from '../lib/voiceSupport';
import {
  requestCameraPermission,
  requestMicrophonePermission,
  requestMediaPermissions,
} from '../lib/devicePermissions';
import { MobileVoiceClient, isWebRTCAvailable } from '../lib/webrtc/MobileVoiceClient';

export interface VoiceParticipant {
  id: Uuid;
  role: string;
  muted: boolean;
  anonymous: boolean;
  isSpeaking?: boolean;
  isScreenSharing?: boolean;
  isCameraOn?: boolean;
  isHandRaised?: boolean;
  stream?: any;
}

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface VoiceContextType {
  activeRoomId: Uuid | null;
  activeRoomName: string | null;
  status: VoiceStatus;
  error: string | null;
  /** True when audio can actually flow. */
  audioAvailable: boolean;
  muted: boolean;
  deafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  speakerphone: boolean;
  hasMicPermission: boolean;
  hasCameraPermission: boolean;
  callDuration: number;
  participants: VoiceParticipant[];
  screenSharingParticipant: VoiceParticipant | null;
  joinRoom: (roomId: Uuid, name: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<boolean>;
  toggleScreenShare: () => Promise<void>;
  toggleHandRaise: () => void;
  toggleSpeakerphone: () => void;
  requestPermissions: () => Promise<{ microphone: boolean; camera: boolean }>;
  refreshParticipants: () => Promise<void>;
}

const VoiceContext = createContext<VoiceContextType | null>(null);

const ROSTER_INTERVAL_MS = 10_000;

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { getToken, user } = useAuth();

  const muted = useAppStore((s) => s.isMuted);
  const deafened = useAppStore((s) => s.isDeafened);
  const speakerphone = useAppStore((s) => s.speakerphone);
  const toggleMuteState = useAppStore((s) => s.toggleMute);
  const toggleDeafenState = useAppStore((s) => s.toggleDeafen);
  const setDevicePreferences = useAppStore((s) => s.setDevicePreferences);

  const [activeRoomId, setActiveRoomId] = useState<Uuid | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isCameraOn, setIsCameraOn] = useState<boolean>(false);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isHandRaised, setIsHandRaised] = useState<boolean>(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean>(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean>(false);
  const [callDuration, setCallDuration] = useState<number>(0);

  const currentRoomIdRef = useRef<Uuid | null>(null);
  currentRoomIdRef.current = activeRoomId;

  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize WebRTC SFU client
  const clientRef = useRef<MobileVoiceClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new MobileVoiceClient(async () => {
      const roomId = currentRoomIdRef.current;
      if (!roomId) throw new Error('No active voice room');
      const token = await getToken();
      return mediaApi.join(token, roomId);
    });
  }

  // Subscribe to WebRTC events
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    return client.subscribe((mediaState) => {
      setIsCameraOn(mediaState.isCameraOn);
      setIsScreenSharing(mediaState.isScreenSharing);
      setIsHandRaised(mediaState.handRaised);
      if (mediaState.error) {
        setError(mediaState.error);
      }
    });
  }, []);

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
          isSpeaking: !participant.is_muted,
        })),
      );
    } catch {
      // Ignored: dropped poll reconciles on next tick
    }
  }, [activeRoomId, getToken]);

  useEffect(() => {
    if (status !== 'connected') {
      setCallDuration(0);
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      return;
    }

    void refreshParticipants();
    const rosterTimer = setInterval(() => void refreshParticipants(), ROSTER_INTERVAL_MS);

    durationTimerRef.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);

    return () => {
      clearInterval(rosterTimer);
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, [status, refreshParticipants]);

  const requestPermissions = useCallback(async () => {
    const perms = await requestMediaPermissions();
    setHasMicPermission(perms.microphone);
    setHasCameraPermission(perms.camera);
    return perms;
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    toggleMuteState();
    clientRef.current?.setMuted(next);
  }, [muted, toggleMuteState]);

  const toggleCamera = useCallback(async () => {
    if (!isWebRTCAvailable) {
      const granted = await requestCameraPermission();
      setHasCameraPermission(granted);
      setIsCameraOn(!isCameraOn);
      return !isCameraOn;
    }

    if (isCameraOn) {
      await clientRef.current?.stopCamera();
      setIsCameraOn(false);
      return false;
    } else {
      const granted = await requestCameraPermission();
      setHasCameraPermission(granted);
      if (!granted) {
        setError('Camera permission denied');
        return false;
      }
      const stream = await clientRef.current?.startCamera();
      setIsCameraOn(Boolean(stream));
      return Boolean(stream);
    }
  }, [isCameraOn]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await clientRef.current?.stopScreenShare();
      setIsScreenSharing(false);
    } else {
      const stream = await clientRef.current?.startScreenShare();
      setIsScreenSharing(Boolean(stream));
    }
  }, [isScreenSharing]);

  const toggleHandRaise = useCallback(() => {
    clientRef.current?.toggleHandRaise();
    setIsHandRaised((h) => !h);
  }, []);

  const toggleSpeakerphone = useCallback(() => {
    setDevicePreferences({ speakerphone: !speakerphone });
  }, [speakerphone, setDevicePreferences]);

  const joinRoom = useCallback(
    async (roomId: Uuid, name: string) => {
      setActiveRoomId(roomId);
      setActiveRoomName(name);
      setStatus('connecting');
      setError(null);

      try {
        const micGranted = await requestMicrophonePermission();
        setHasMicPermission(micGranted);

        const token = await getToken();
        await roomsApi.join(token, roomId).catch((cause: unknown) => {
          if (cause instanceof ApiError && cause.code === 'CONFLICT') return;
          throw cause;
        });

        // Connect WebRTC peer connection
        if (isWebRTCAvailable) {
          await clientRef.current?.join();
        } else {
          await mediaApi.join(token, roomId);
        }

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
    setIsCameraOn(false);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setError(null);

    if (clientRef.current) {
      await clientRef.current.leave();
    }

    if (!roomId) return;

    try {
      const token = await getToken();
      await mediaApi.leave(token, roomId);
      await roomsApi.leave(token, roomId);
    } catch {
      // Ignored
    }
  }, [activeRoomId, getToken]);

  const screenSharingParticipant = isScreenSharing
    ? {
        id: user?.id ?? 'self',
        role: 'owner',
        muted,
        anonymous: false,
        isScreenSharing: true,
      }
    : participants.find((p) => p.isScreenSharing) ?? null;

  return (
    <VoiceContext.Provider
      value={{
        activeRoomId,
        activeRoomName,
        status,
        error,
        audioAvailable: isWebRTCAvailable || VOICE_AVAILABLE,
        muted,
        deafened,
        isCameraOn,
        isScreenSharing,
        isHandRaised,
        speakerphone,
        hasMicPermission,
        hasCameraPermission,
        callDuration,
        participants: participants.filter((participant) => participant.id !== user?.id),
        screenSharingParticipant,
        joinRoom,
        leaveRoom,
        toggleMute,
        toggleDeafen: toggleDeafenState,
        toggleCamera,
        toggleScreenShare,
        toggleHandRaise,
        toggleSpeakerphone,
        requestPermissions,
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
