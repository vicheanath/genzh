import { Platform } from 'react-native';

import { isWebRTCAvailable } from './livekit/runtime';

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
 * Android: `@livekit/react-native-expo-plugin` wires up the foreground service
 * MediaProjection requires — see `enableScreenShareService` in app.json, which
 * is what makes the foreground-service permissions there do anything.
 *
 * iOS: it does not work, and cannot without native work this app has not done.
 * ReplayKit captures the screen in a *separate process* — a Broadcast Upload
 * Extension — which hands frames back over a unix socket in a shared App Group
 * container. The extension is an Xcode target, and neither LiveKit's Expo
 * plugin nor `@config-plugins/react-native-webrtc` creates one. Until that
 * target exists, there is nothing on the other end of the socket.
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
