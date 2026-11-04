import type { PermissionStatus } from 'react-native-vision-camera';

/**
 * - `granted`: camera can be used.
 * - `can_ask`: show the system prompt.
 * - `blocked`: only the Settings app can turn it back on (`Camera access is off`).
 *
 * iOS never shows the prompt again after a denial. Android allows asking again
 * once; if the user has already been asked in this session and it's still
 * denied, treat it as permanent (Android stops showing the prompt silently).
 */
export type CameraAccess = 'granted' | 'can_ask' | 'blocked';

export function cameraAccess(
  status: PermissionStatus,
  platform: 'ios' | 'android' | string,
  askedThisSession: boolean,
): CameraAccess {
  switch (status) {
    case 'authorized':
      return 'granted';
    case 'not-determined':
      return 'can_ask';
    case 'denied':
      return platform === 'android' && !askedThisSession ? 'can_ask' : 'blocked';
    case 'restricted':
    default:
      return 'blocked';
  }
}
