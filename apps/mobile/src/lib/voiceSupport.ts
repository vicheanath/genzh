/**
 * Whether real-time audio can run in this build.
 *
 * Voice is WebRTC, and WebRTC on React Native is `react-native-webrtc` — a
 * native module. Expo Go ships a fixed set of native modules and that is not
 * one of them, so in Expo Go the app can show rooms, participants and controls
 * but cannot open a peer connection. A development build (`expo prebuild` plus
 * a native compile) has the module and works.
 *
 * This is checked rather than assumed so the same source runs both ways: in a
 * dev build the require resolves and voice is live; in Expo Go it does not and
 * every voice surface says so instead of failing silently.
 */
export const VOICE_AVAILABLE: boolean = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-webrtc');
    return true;
  } catch {
    return false;
  }
})();

export const VOICE_UNAVAILABLE_REASON =
  'Live audio needs a development build. Expo Go cannot load the WebRTC native module, ' +
  'so voice rooms open here but nobody is heard.';
