import type { MediaJoinResponse } from '@genzh/shared';
import {
  CloseCode,
  PROTOCOL_VERSION,
  isRetryableClose,
  type ClientMessage,
  type ParticipantInfo,
  type ServerMessage,
  type TrackInfo,
  type TrackKind,
} from '@genzh/shared';
import { resolveMediaWsUrl } from '../../api/config';

// Dynamic import / require so it runs safely in all environments
let webrtcModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  webrtcModule = require('react-native-webrtc');
} catch {
  webrtcModule = null;
}

export const isWebRTCAvailable = Boolean(webrtcModule);

const RTCPeerConnection = webrtcModule?.RTCPeerConnection;
const RTCIceCandidate = webrtcModule?.RTCIceCandidate;
const RTCSessionDescription = webrtcModule?.RTCSessionDescription;
const mediaDevices = webrtcModule?.mediaDevices;

export { webrtcModule };

export interface RemoteParticipant {
  id: string;
  userId: string;
  displayName: string;
  muted: boolean;
  speaking: boolean;
  cameraOn?: boolean;
  screenSharing?: boolean;
  handRaised?: boolean;
  stream: any | null;
  cameraStream?: any | null;
  screenStream?: any | null;
  cameraTrackId?: string | null;
  screenTrackId?: string | null;
}

export interface VoiceState {
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  selfId: string | null;
  participants: RemoteParticipant[];
  muted: boolean;
  speaking: boolean;
  isCameraOn: boolean;
  cameraStream: any | null;
  /** Which lens is publishing. Meaningless while the camera is off. */
  cameraFacing: CameraFacing;
  isScreenSharing: boolean;
  screenStream: any | null;
  handRaised: boolean;
  error: string | null;
}

/** `user` is the selfie camera, `environment` the one on the back. */
export type CameraFacing = 'user' | 'environment';

export type SessionFactory = () => Promise<MediaJoinResponse>;

const INITIAL_STATE: VoiceState = {
  status: 'idle',
  selfId: null,
  participants: [],
  muted: true,
  speaking: false,
  isCameraOn: false,
  cameraStream: null,
  cameraFacing: 'user',
  isScreenSharing: false,
  screenStream: null,
  handRaised: false,
  error: null,
};

export class MobileVoiceClient {
  private socket: WebSocket | null = null;
  private publisher: any = null;
  private subscriber: any = null;

  private localStream: any = null;
  private audioSender: any = null;
  private cameraTrack: any = null;
  private cameraSender: any = null;
  private screenTrack: any = null;
  private screenSender: any = null;

  private readonly remoteTracks = new Map<string, TrackInfo>();
  private state: VoiceState = INITIAL_STATE;
  private readonly listeners = new Set<(state: VoiceState) => void>();

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closing = false;

  private readonly createSession: SessionFactory;

  constructor(createSession: SessionFactory) {
    this.createSession = createSession;
  }

  subscribe(listener: (state: VoiceState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): VoiceState {
    return this.state;
  }

  async join(): Promise<void> {
    if (!isWebRTCAvailable) {
      this.patch({ error: 'WebRTC is not supported in this runtime environment.' });
      return;
    }
    if (this.state.status !== 'idle' && this.state.status !== 'failed') return;
    this.closing = false;
    this.reconnectAttempts = 0;
    await this.connect();
  }

  async leave(): Promise<void> {
    this.closing = true;
    this.clearReconnect();
    await this.stopCamera();
    await this.stopScreenShare();
    this.send({ type: 'leave' });
    this.teardown();
    this.patch({ ...INITIAL_STATE });
  }

  setMuted(muted: boolean): void {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
    this.send({ type: 'mute', muted });
    this.patch({ muted, speaking: !muted ? this.state.speaking : false });
  }

  async startCamera(facing: CameraFacing = this.state.cameraFacing): Promise<any | null> {
    if (!isWebRTCAvailable || !mediaDevices) return null;
    if (this.cameraTrack) return this.state.cameraStream;

    try {
      const stream = await mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      });

      const track = stream.getVideoTracks()[0];
      if (!track) return null;

      this.cameraTrack = track;

      if (this.publisher) {
        this.send({
          type: 'publish_intent',
          kind: 'camera',
          client_track_id: track.id,
        });

        this.cameraSender = this.publisher.addTrack(track, stream);
        await this.negotiatePublisher();
      }

      this.send({ type: 'camera', enabled: true });
      this.patch({ isCameraOn: true, cameraStream: stream, cameraFacing: facing });
      return stream;
    } catch {
      this.patch({ error: 'Could not access device camera' });
      return null;
    }
  }

  async stopCamera(): Promise<void> {
    if (!this.cameraTrack) return;

    if (this.publisher && this.cameraSender) {
      try {
        this.publisher.removeTrack(this.cameraSender);
        await this.negotiatePublisher();
      } catch {
        // Ignored
      }
      this.cameraSender = null;
    }

    try {
      this.cameraTrack.stop();
    } catch {
      // Ignored
    }
    this.cameraTrack = null;
    this.send({ type: 'camera', enabled: false });
    this.patch({ isCameraOn: false, cameraStream: null });
  }

  async toggleCamera(): Promise<void> {
    if (this.state.isCameraOn) {
      await this.stopCamera();
    } else {
      await this.startCamera();
    }
  }

  /**
   * Flip between the front and back lenses.
   *
   * `_switchCamera` is react-native-webrtc's own extension to `MediaStreamTrack`
   * and is the path worth taking: it swaps the capture device underneath a live
   * track, so the sender, the transceiver and the SFU's view of the room all
   * stay exactly as they were. Tearing the track down and republishing would
   * work too, but it costs a renegotiation and every other participant sees the
   * tile blink — for what is meant to read as turning the phone around.
   *
   * The fallback is that republish, for a platform or a mock that has no such
   * method. Not all of them do, and a camera button that silently does nothing
   * is worse than one that takes a moment.
   */
  async switchCamera(): Promise<void> {
    if (!this.state.isCameraOn) return;

    const next: CameraFacing = this.state.cameraFacing === 'user' ? 'environment' : 'user';
    const track = this.cameraTrack;

    if (track && typeof track._switchCamera === 'function') {
      try {
        track._switchCamera();
        this.patch({ cameraFacing: next });
        return;
      } catch {
        // Fall through to the republish below.
      }
    }

    await this.stopCamera();
    await this.startCamera(next);
  }

  async startScreenShare(): Promise<any | null> {
    if (!isWebRTCAvailable || !mediaDevices?.getDisplayMedia) return null;
    if (this.screenTrack) return this.state.screenStream;

    try {
      const stream = await mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (!track) return null;

      this.screenTrack = track;
      track.onended = () => {
        void this.stopScreenShare();
      };

      if (this.publisher) {
        this.send({
          type: 'publish_intent',
          kind: 'screen_share',
          client_track_id: track.id,
        });

        this.screenSender = this.publisher.addTrack(track, stream);
        await this.negotiatePublisher();
      }

      this.send({ type: 'screen_share', enabled: true });
      this.patch({ isScreenSharing: true, screenStream: stream });
      return stream;
    } catch {
      this.patch({ error: 'Could not start screen sharing' });
      return null;
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.screenTrack) return;

    if (this.publisher && this.screenSender) {
      try {
        this.publisher.removeTrack(this.screenSender);
        await this.negotiatePublisher();
      } catch {
        // Ignored
      }
      this.screenSender = null;
    }

    try {
      this.screenTrack.stop();
    } catch {
      // Ignored
    }
    this.screenTrack = null;
    this.send({ type: 'screen_share', enabled: false });
    this.patch({ isScreenSharing: false, screenStream: null });
  }

  toggleHandRaise(): void {
    const next = !this.state.handRaised;
    this.patch({ handRaised: next });
  }

  // ── Private Connection & Signaling ──────────────────────────────────────

  private async connect(): Promise<void> {
    this.patch({ status: this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting' });

    let session: MediaJoinResponse;
    try {
      session = await this.createSession();
    } catch (err: any) {
      this.patch({ status: 'failed', error: err?.message || 'Could not join media session' });
      return;
    }

    try {
      await this.captureLocalAudio();
    } catch {
      // Audio capture failed but we can proceed listening
    }

    const wsUrl = resolveMediaWsUrl(session.media_url);
    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.send({
        type: 'join',
        room_id: session.room_id,
        token: session.token,
      });
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        void this.handleServerMessage(msg, session.ice_servers);
      } catch {
        // Ignored
      }
    };

    socket.onclose = (event) => {
      if (this.closing) return;
      if (isRetryableClose(event.code)) {
        this.scheduleReconnect();
      } else {
        this.patch({ status: 'failed', error: 'Connection closed by media server' });
      }
    };

    socket.onerror = () => {
      if (this.closing) return;
      this.scheduleReconnect();
    };
  }

  private async captureLocalAudio(): Promise<void> {
    if (!mediaDevices) return;
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      this.localStream = stream;
      for (const track of stream.getAudioTracks()) {
        track.enabled = !this.state.muted;
      }
    } catch (cause) {
      throw cause;
    }
  }

  private async handleServerMessage(
    msg: ServerMessage,
    iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>,
  ): Promise<void> {
    switch (msg.type) {
      case 'joined': {
        this.patch({
          status: 'connected',
          selfId: msg.participant_id,
          participants: msg.participants.map((p) => this.mapParticipant(p)),
          error: null,
        });

        await this.setupPeerConnections(iceServers);
        break;
      }

      case 'answer': {
        if (msg.target === 'publisher' && this.publisher) {
          await this.publisher.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }),
          );
        }
        break;
      }

      case 'offer': {
        if (msg.target === 'subscriber' && this.subscriber) {
          await this.subscriber.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }),
          );
          const answer = await this.subscriber.createAnswer();
          await this.subscriber.setLocalDescription(answer);
          this.send({
            type: 'answer',
            target: 'subscriber',
            sdp: answer.sdp,
          });
        }
        break;
      }

      case 'ice_candidate': {
        const pc = msg.target === 'publisher' ? this.publisher : this.subscriber;
        if (pc && msg.candidate) {
          try {
            await pc.addIceCandidate(
              new RTCIceCandidate({
                candidate: msg.candidate,
                sdpMid: msg.sdp_mid ?? undefined,
                sdpMLineIndex: msg.sdp_mline_index ?? undefined,
              }),
            );
          } catch {
            // Ignored
          }
        }
        break;
      }

      case 'event': {
        this.handleEvent(msg);
        break;
      }

      case 'error': {
        this.patch({ error: msg.message });
        break;
      }
    }
  }

  private handleEvent(msg: ServerMessage & { type: 'event' }): void {
    switch (msg.event) {
      case 'participant_joined': {
        const p = this.mapParticipant(msg.participant);
        this.patch({
          participants: [...this.state.participants.filter((x) => x.id !== p.id), p],
        });
        break;
      }
      case 'participant_left': {
        this.patch({
          participants: this.state.participants.filter((x) => x.id !== msg.participant_id),
        });
        break;
      }
      case 'microphone_muted': {
        this.patch({
          participants: this.state.participants.map((p) =>
            p.id === msg.participant_id ? { ...p, muted: true } : p,
          ),
        });
        break;
      }
      case 'microphone_unmuted': {
        this.patch({
          participants: this.state.participants.map((p) =>
            p.id === msg.participant_id ? { ...p, muted: false } : p,
          ),
        });
        break;
      }
      case 'speaking_started': {
        this.patch({
          participants: this.state.participants.map((p) =>
            p.id === msg.participant_id ? { ...p, speaking: true } : p,
          ),
        });
        break;
      }
      case 'speaking_stopped': {
        this.patch({
          participants: this.state.participants.map((p) =>
            p.id === msg.participant_id ? { ...p, speaking: false } : p,
          ),
        });
        break;
      }
      case 'camera_enabled': {
        this.patch({
          participants: this.state.participants.map((p) =>
            p.id === msg.participant_id ? { ...p, cameraOn: true } : p,
          ),
        });
        break;
      }
      case 'camera_disabled': {
        this.patch({
          participants: this.state.participants.map((p) =>
            p.id === msg.participant_id ? { ...p, cameraOn: false, cameraStream: null } : p,
          ),
        });
        break;
      }
      case 'screen_share_started': {
        this.patch({
          participants: this.state.participants.map((p) =>
            p.id === msg.participant_id ? { ...p, screenSharing: true } : p,
          ),
        });
        break;
      }
      case 'screen_share_stopped': {
        this.patch({
          participants: this.state.participants.map((p) =>
            p.id === msg.participant_id ? { ...p, screenSharing: false, screenStream: null } : p,
          ),
        });
        break;
      }
    }
  }

  private async setupPeerConnections(iceServers: any[]): Promise<void> {
    const config = { iceServers: iceServers.length > 0 ? iceServers : [{ urls: 'stun:stun.l.google.com:19302' }] };

    this.publisher = new RTCPeerConnection(config);
    this.subscriber = new RTCPeerConnection(config);

    this.publisher.onicecandidate = (event: any) => {
      if (event.candidate) {
        this.send({
          type: 'ice_candidate',
          target: 'publisher',
          candidate: event.candidate.candidate,
          sdp_mid: event.candidate.sdpMid,
          sdp_mline_index: event.candidate.sdpMLineIndex,
        });
      }
    };

    this.subscriber.onicecandidate = (event: any) => {
      if (event.candidate) {
        this.send({
          type: 'ice_candidate',
          target: 'subscriber',
          candidate: event.candidate.candidate,
          sdp_mid: event.candidate.sdpMid,
          sdp_mline_index: event.candidate.sdpMLineIndex,
        });
      }
    };

    this.subscriber.ontrack = (event: any) => {
      const stream = event.streams?.[0];
      if (stream) {
        const track = event.track;
        this.patch({
          participants: this.state.participants.map((p) => ({
            ...p,
            stream: stream,
            cameraStream: track?.kind === 'video' ? stream : p.cameraStream,
          })),
        });
      }
    };

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        this.audioSender = this.publisher.addTrack(track, this.localStream);
      }
    }

    await this.negotiatePublisher();
  }

  private async negotiatePublisher(): Promise<void> {
    if (!this.publisher) return;
    try {
      const offer = await this.publisher.createOffer();
      await this.publisher.setLocalDescription(offer);
      this.send({
        type: 'offer',
        target: 'publisher',
        sdp: offer.sdp,
      });
    } catch {
      // Ignored
    }
  }

  private mapParticipant(p: ParticipantInfo): RemoteParticipant {
    return {
      id: p.participant_id,
      userId: p.user_id,
      displayName: p.display_name,
      muted: p.audio_muted,
      speaking: false,
      cameraOn: p.camera_enabled,
      screenSharing: p.screen_sharing,
      stream: null,
    };
  }

  private send(msg: ClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private patch(partial: Partial<VoiceState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    if (this.reconnectAttempts >= 5) {
      this.patch({ status: 'failed', error: 'Failed to reconnect to media server' });
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardown(): void {
    if (this.socket) {
      try {
        this.socket.close(CloseCode.Normal);
      } catch {
        // Ignored
      }
      this.socket = null;
    }

    if (this.publisher) {
      try {
        this.publisher.close();
      } catch {
        // Ignored
      }
      this.publisher = null;
    }

    if (this.subscriber) {
      try {
        this.subscriber.close();
      } catch {
        // Ignored
      }
      this.subscriber = null;
    }

    if (this.localStream) {
      try {
        for (const t of this.localStream.getTracks()) t.stop();
      } catch {
        // Ignored
      }
      this.localStream = null;
    }
  }
}
