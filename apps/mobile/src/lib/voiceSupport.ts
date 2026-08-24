import { Platform } from 'react-native';

import { isWebRTCAvailable } from './webrtc/MobileVoiceClient';

/**
 * What this build can actually do in a call.
 *
 * Capabilities rather than one boolean, because they fail independently and for
 * different reasons. A control wired to a capability that is false can be shown
 * disabled with a reason attached; a control wired to nothing at all just
 * appears to be broken, which is what screen sharing did on iOS.
 */

/** Real-time media at all. False in Expo Go, which ships no WebRTC. */
export const VOICE_AVAILABLE: boolean = isWebRTCAvailable;

export const VOICE_UNAVAILABLE_REASON = VOICE_AVAILABLE
  ? ''
  : 'This build has no WebRTC. Calls will connect but carry no audio — use a development build.';

/**
 * Screen sharing.
 *
 * Android: react-native-webrtc ships its own `MediaProjectionService`, declared
 * with `foregroundServiceType="mediaProjection"` in the library's manifest, so
 * this needs only the foreground-service permissions in app.json.
 *
 * iOS: it does not work, and cannot without native work this app has not done.
 * ReplayKit captures the screen in a *separate process* — a Broadcast Upload
 * Extension — which hands frames back over a unix socket in a shared App Group
 * container. The extension is an Xcode target; neither react-native-webrtc nor
 * `@config-plugins/react-native-webrtc` creates one. Until that target exists,
 * `getDisplayMedia` has nothing on the other end of the socket.
 */
export const SCREEN_SHARE_AVAILABLE: boolean =
  VOICE_AVAILABLE && Platform.OS === 'android';

export const SCREEN_SHARE_UNAVAILABLE_REASON = SCREEN_SHARE_AVAILABLE
  ? ''
  : Platform.OS === 'ios'
    ? 'Screen sharing on iOS needs a broadcast extension this build does not include.'
    : 'Screen sharing needs a development build with WebRTC.';

/** The camera. Same requirement as audio — a real WebRTC build. */
export const CAMERA_AVAILABLE: boolean = VOICE_AVAILABLE;
