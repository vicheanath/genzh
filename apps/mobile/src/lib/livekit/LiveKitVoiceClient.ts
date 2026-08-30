import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
  type VideoCaptureOptions,
} from 'livekit-client';
import type {
  CallClient,
  CallClientParticipant,
  CallClientState,
  CameraFacing,
  MediaJoinResponse,
} from '@genzh/shared';

import { resolveMediaWsUrl } from '../../api/config';
import { isWebRTCAvailable, livekitModule } from './runtime';

export type SessionFactory = () => Promise<MediaJoinResponse>;

const INITIAL_STATE: CallClientState = {
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

const CAMERA_CAPTURE: VideoCaptureOptions = {
  resolution: { width: 1280, height: 720, frameRate: 30 },
};

function toParticipant(participant: Participant): CallClientParticipant {
  const mic = participant.getTrackPublication(Track.Source.Microphone);
  const camera = participant.getTrackPublication(Track.Source.Camera);
  const screen = participant.getTrackPublication(Track.Source.ScreenShare);

  return {
    id: participant.identity,
    userId: participant.identity,
    displayName: participant.name || '',
    muted: !mic || mic.isMuted,
    speaking: participant.isSpeaking,
    cameraOn: Boolean(camera?.track && !camera.isMuted),
    screenSharing: Boolean(screen?.track && !screen.isMuted),
    // LiveKit carries no notion of a raised hand — it is presentation state
    // this app owns, not something the media plane reports about anyone else.
    handRaised: false,
    stream: mic?.track?.mediaStream ?? null,
    cameraStream: camera?.track?.mediaStream ?? null,
    screenStream: screen?.track?.mediaStream ?? null,
  };
}

/**
 * The call, over LiveKit, on a phone.
 *
 * This replaced a hand-rolled SFU client: two `RTCPeerConnection`s, an
 * offer/answer loop over a WebSocket, its own reconnect backoff and its own
 * roster events — all of it talking a bespoke protocol to a Rust media server
 * that no longer exists. LiveKit owns every one of those concerns now, and the
 * server side already moved; this is the client catching up.
 *
 * What is left here is the adapter: LiveKit's room model in, the `CallClient`
 * shape `useCallVM` drives out. The web app runs the same LiveKit room through
 * its own provider, so both platforms now differ only in how they capture and
 * render, which is the only place they genuinely have to.
 */
export class LiveKitVoiceClient implements CallClient {
  private room: Room | null = null;
  private state: CallClientState = INITIAL_STATE;
  private readonly listeners = new Set<(state: CallClientState) => void>();
  private readonly createSession: SessionFactory;

  constructor(createSession: SessionFactory) {
    this.createSession = createSession;
  }

  subscribe(listener: (state: CallClientState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): CallClientState {
    return this.state;
  }

  async join(): Promise<void> {
    if (!isWebRTCAvailable) {
      this.patch({ error: 'WebRTC is not supported in this runtime environment.' });
      return;
    }
    if (this.state.status !== 'idle' && this.state.status !== 'failed') return;

    this.patch({ status: 'connecting', error: null });

    let session: MediaJoinResponse;
    try {
      session = await this.createSession();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not join media session';
      this.patch({ status: 'failed', error: message });
      // Opening the session is also what joins the room, so a room the caller
      // cannot enter has to fail `join()` rather than settle it and leave the
      // screen sitting in a call it never got into.
      throw cause;
    }

    // Routes audio to the earpiece or speaker and takes the audio focus. On
    // Android without it the microphone opens but nothing is heard; on iOS the
    // session stays in the ambient category and the call plays at ringer volume.
    await livekitModule?.AudioSession.startAudioSession();

    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.attach(room);

    try {
      // Not `session.media_url` as given: the API reports LiveKit's address as
      // the server sees it, which on a dev machine is loopback. A phone on the
      // LAN has to be handed the host it already reached the API on.
      await room.connect(resolveMediaWsUrl(session.media_url), session.token);
      await room.localParticipant.setMicrophoneEnabled(false);
    } catch (cause) {
      this.room = null;
      room.removeAllListeners();
      await livekitModule?.AudioSession.stopAudioSession();
      const message = cause instanceof Error ? cause.message : 'Could not connect to the call';
      this.patch({ status: 'failed', error: message });
      throw cause;
    }

    this.room = room;
    this.patch({
      status: 'connected',
      selfId: room.localParticipant.identity,
      muted: true,
      isCameraOn: false,
      isScreenSharing: false,
      cameraStream: null,
      screenStream: null,
      error: null,
    });
    this.refreshParticipants();
  }

  async leave(): Promise<void> {
    const room = this.room;
    this.room = null;
    if (room) {
      room.removeAllListeners();
      await room.disconnect();
    }
    await livekitModule?.AudioSession.stopAudioSession();
    this.patch({ ...INITIAL_STATE });
  }

  setMuted(muted: boolean): void {
    const room = this.room;
    if (!room) {
      this.patch({ muted });
      return;
    }
    room.localParticipant
      .setMicrophoneEnabled(!muted)
      .then(() => this.patch({ muted, speaking: muted ? false : this.state.speaking, error: null }))
      // Left exactly as it was: the button must not read "unmuted" when the OS
      // refused to open the microphone at all.
      .catch(() => this.patch({ error: 'Could not open the microphone' }));
  }

  async startCamera(facing: CameraFacing = this.state.cameraFacing ?? 'user'): Promise<unknown | null> {
    const room = this.room;
    if (!room) return null;
    try {
      const publication = await room.localParticipant.setCameraEnabled(true, {
        ...CAMERA_CAPTURE,
        facingMode: facing,
      });
      const stream = this.publicationStream(publication);
      this.patch({ isCameraOn: true, cameraStream: stream, cameraFacing: facing, error: null });
      return stream;
    } catch {
      this.patch({ error: 'Could not access device camera' });
      return null;
    }
  }

  async stopCamera(): Promise<void> {
    const room = this.room;
    if (!room) return;
    await room.localParticipant.setCameraEnabled(false);
    this.patch({ isCameraOn: false, cameraStream: null });
  }

  /**
   * Flip between the front and back lenses.
   *
   * `restartTrack` swaps the capture device underneath the published track, so
   * the publication, the transceiver and every other participant's view of the
   * room stay as they were. Republishing would work too, but it costs a
   * renegotiation and everyone else sees the tile blink — for what is meant to
   * read as turning the phone around.
   */
  async switchCamera(): Promise<void> {
    const room = this.room;
    if (!room || !this.state.isCameraOn) return;

    const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    if (!track) return;

    const next: CameraFacing = this.state.cameraFacing === 'user' ? 'environment' : 'user';
    try {
      await track.restartTrack({ ...CAMERA_CAPTURE, facingMode: next });
      this.patch({ cameraFacing: next, cameraStream: track.mediaStream ?? null });
    } catch {
      this.patch({ error: 'Could not switch camera' });
    }
  }

  async startScreenShare(): Promise<unknown | null> {
    const room = this.room;
    if (!room) return null;
    try {
      const publication = await room.localParticipant.setScreenShareEnabled(true);
      const stream = this.publicationStream(publication);
      this.patch({ isScreenSharing: true, screenStream: stream, error: null });
      return stream;
    } catch {
      this.patch({ error: 'Could not start screen sharing' });
      return null;
    }
  }

  async stopScreenShare(): Promise<void> {
    const room = this.room;
    if (!room) return;
    await room.localParticipant.setScreenShareEnabled(false);
    this.patch({ isScreenSharing: false, screenStream: null });
  }

  toggleHandRaise(): void {
    this.patch({ handRaised: !this.state.handRaised });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private attach(room: Room): void {
    const refresh = () => this.refreshParticipants();

    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackSubscribed, refresh)
      .on(RoomEvent.TrackUnsubscribed, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.patch({ speaking: speakers.includes(room.localParticipant) });
        refresh();
      })
      .on(RoomEvent.Reconnecting, () => this.patch({ status: 'reconnecting' }))
      .on(RoomEvent.Reconnected, () => {
        this.patch({ status: 'connected', error: null });
        refresh();
      })
      // A screen share the user stopped from the system UI rather than from
      // ours: the publication goes away without anything here asking for it,
      // and the control has to follow.
      .on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
        if (publication.source === Track.Source.ScreenShare) {
          this.patch({ isScreenSharing: false, screenStream: null });
        } else if (publication.source === Track.Source.Camera) {
          this.patch({ isCameraOn: false, cameraStream: null });
        }
      })
      .on(RoomEvent.Disconnected, () => {
        // Only a disconnect LiveKit has given up on reaches here — it retries
        // on its own first, and those show as `reconnecting` above.
        if (this.room !== room) return;
        this.room = null;
        void livekitModule?.AudioSession.stopAudioSession();
        this.patch({ status: 'idle', participants: [], selfId: null });
      })
      .on(RoomEvent.ConnectionStateChanged, (connectionState: ConnectionState) => {
        if (connectionState === ConnectionState.Connected) {
          this.patch({ status: 'connected' });
        }
      });
  }

  private refreshParticipants(): void {
    const room = this.room;
    if (!room) return;
    this.patch({
      participants: Array.from(room.remoteParticipants.values()).map(toParticipant),
    });
  }

  private publicationStream(publication: LocalTrackPublication | undefined): unknown | null {
    return publication?.track?.mediaStream ?? null;
  }

  private patch(partial: Partial<CallClientState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
