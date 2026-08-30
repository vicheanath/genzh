import { NativeModules } from 'react-native';

/**
 * Whether this binary actually contains WebRTC.
 *
 * Expo Go ships no native WebRTC, so the module is simply absent there and
 * every LiveKit call would fail at the first peer connection. Checking the
 * native module rather than the JS import is what makes this safe to evaluate
 * at startup: `@livekit/react-native` pulls in polyfills and an audio session
 * on import, and doing that with no native side underneath throws.
 */
export const isWebRTCAvailable: boolean = Boolean(NativeModules.WebRTCModule);

type LiveKitRN = typeof import('@livekit/react-native');
type LiveKitWebRTC = typeof import('@livekit/react-native-webrtc');

let livekitModule: LiveKitRN | null = null;
let webrtcModule: LiveKitWebRTC | null = null;

if (isWebRTCAvailable) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    livekitModule = require('@livekit/react-native');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webrtcModule = require('@livekit/react-native-webrtc');
  } catch {
    livekitModule = null;
    webrtcModule = null;
  }
}

export { livekitModule, webrtcModule };

/**
 * The view that draws a `MediaStream`, or null where there is no WebRTC.
 *
 * Null rather than a stub so a caller has to decide what to show instead —
 * every call site already has an avatar to fall back to.
 */
export const RTCView: LiveKitWebRTC['RTCView'] | null = webrtcModule?.RTCView ?? null;

/**
 * Teach `livekit-client` about this platform's WebRTC.
 *
 * `livekit-client` is the same package the web app uses and reaches for browser
 * globals — `RTCPeerConnection`, `navigator.mediaDevices`, `MediaStream`. None
 * of them exist in Hermes, so this installs the react-native implementations
 * under those names. It has to run before any `Room` is constructed, which is
 * why it is called from the app entry point rather than lazily here.
 */
export function registerLiveKitGlobals(): void {
  livekitModule?.registerGlobals();
}
