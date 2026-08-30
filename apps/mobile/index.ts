import { registerRootComponent } from 'expo';

import App from './App';
import { registerLiveKitGlobals } from './src/lib/livekit/runtime';

// Before anything constructs a LiveKit `Room` — which the voice provider does
// as soon as the tree mounts. `livekit-client` is written against browser
// WebRTC globals that Hermes does not have; this installs the react-native
// ones under those names.
registerLiveKitGlobals();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
