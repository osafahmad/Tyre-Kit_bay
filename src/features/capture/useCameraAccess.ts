import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { VisionCamera } from 'react-native-vision-camera';
import { cameraAccess, type CameraAccess } from './cameraAccess';

let askedThisSession = false;

export function currentCameraAccess(): CameraAccess {
  return cameraAccess(VisionCamera.cameraPermissionStatus, Platform.OS, askedThisSession);
}

/** Shows the system prompt. Resolves true if access was granted. */
export async function requestCameraAccess(): Promise<boolean> {
  askedThisSession = true;
  try {
    await VisionCamera.requestCameraPermission();
  } catch {
    // Treated like a denial below.
  }
  return VisionCamera.cameraPermissionStatus === 'authorized';
}

export function openAppSettings() {
  Linking.openSettings().catch(() => {});
}

/** Camera access that refreshes when the user comes back from Settings. */
export function useCameraAccess() {
  const [access, setAccess] = useState<CameraAccess>(currentCameraAccess);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') setAccess(currentCameraAccess());
    });
    return () => sub.remove();
  }, []);

  const request = useCallback(async () => {
    const granted = await requestCameraAccess();
    setAccess(currentCameraAccess());
    return granted;
  }, []);

  return { access, request };
}

/** For tests. */
export function resetCameraAccessSession() {
  askedThisSession = false;
}
