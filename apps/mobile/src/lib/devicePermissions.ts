import { PermissionsAndroid, Platform } from 'react-native';

export interface MediaPermissionStatus {
  microphone: boolean;
  camera: boolean;
}

/**
 * Request microphone access from the phone operating system.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'GenZH needs access to your microphone for voice channels and calls.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  // On iOS / Web, permissions are handled when accessing media streams or via Info.plist
  return true;
}

/**
 * Request camera access from the phone operating system.
 */
export async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'GenZH needs access to your camera for video calls and profile pictures.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  // On iOS / Web, permissions are handled when accessing media streams or via Info.plist
  return true;
}

/**
 * Request both camera and microphone permissions for voice/video calls.
 */
export async function requestMediaPermissions(): Promise<MediaPermissionStatus> {
  const [microphone, camera] = await Promise.all([
    requestMicrophonePermission(),
    requestCameraPermission(),
  ]);

  return { microphone, camera };
}
