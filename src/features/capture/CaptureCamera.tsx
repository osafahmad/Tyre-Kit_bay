import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Camera, useCameraDevice, type CameraFrameOutput } from 'react-native-vision-camera';
import { AppText, Button } from '../../components';
import { colors } from '../../theme';
import { openAppSettings, useCameraAccess } from './useCameraAccess';
import { useAppActive } from './useAppActive';

export type CameraIssue = 'no_access' | 'no_camera' | 'error' | null;

type Props = {
  frameOutput: CameraFrameOutput;
  torchOn: boolean;
  /** Overlay drawn on top of the preview (guide box, hints). */
  children: React.ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** Lets the screen know whether a live preview is running. */
  onLiveChange?: (live: boolean) => void;
  /** Reports what's stopping the camera, so the screen can disable Capture. */
  onIssueChange?: (issue: CameraIssue) => void;
};

/**
 * Back camera for plate, chassis and tyre capture. Handles permission, no camera,
 * start errors and interruptions, and only runs while the screen is focused
 * and the app is in the foreground. Typing and Skip stay available on the
 * screen whatever happens here.
 */
export function CaptureCamera({
  frameOutput,
  torchOn,
  children,
  onLayout,
  onLiveChange,
  onIssueChange,
}: Props) {
  const { access, request } = useCameraAccess();
  const device = useCameraDevice('back');
  const focused = useIsFocused();
  const appActive = useAppActive();
  const [failed, setFailed] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const issue: CameraIssue =
    access !== 'granted' ? 'no_access' : !device ? 'no_camera' : failed ? 'error' : null;
  const live = issue === null && focused && appActive;

  React.useEffect(() => onIssueChange?.(issue), [issue, onIssueChange]);
  React.useEffect(() => onLiveChange?.(live && !interrupted), [live, interrupted, onLiveChange]);

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {issue === null && device ? (
        <Camera
          key={attempt}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={live}
          outputs={[frameOutput]}
          resizeMode="cover"
          torchMode={torchOn && device.hasTorch ? 'on' : 'off'}
          onError={() => setFailed(true)}
          onInterruptionStarted={() => setInterrupted(true)}
          onInterruptionEnded={() => setInterrupted(false)}
        />
      ) : null}

      {issue === null ? children : null}

      {issue === 'no_access' ? (
        <Message
          title={access === 'can_ask' ? 'Allow camera access' : 'Camera access is off'}
          text={
            access === 'can_ask'
              ? 'The camera reads number plates, chassis numbers, and tyres.'
              : 'Turn it on in Settings to scan tyres.'
          }
          action={access === 'can_ask' ? 'Allow camera' : 'Open Settings'}
          onAction={access === 'can_ask' ? request : openAppSettings}
        />
      ) : null}
      {issue === 'no_camera' ? (
        <Message title="No camera found" text="This device has no back camera. Type the details instead." />
      ) : null}
      {issue === 'error' ? (
        <Message
          title="The camera stopped"
          text="It couldn't start or was stopped by the system."
          action="Try again"
          onAction={() => {
            setFailed(false);
            setAttempt(a => a + 1);
          }}
        />
      ) : null}
      {issue === null && interrupted ? (
        <View style={styles.paused} accessibilityLiveRegion="polite">
          <AppText variant="rowLabel" weight="semibold" color="white">
            Camera paused
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function Message({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.message} accessibilityLiveRegion="polite">
      <AppText variant="sheetTitle" color="white" align="center" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="bodySmall" color="textOnDark" align="center" style={styles.messageText}>
        {text}
      </AppText>
      {action && onAction ? <Button label={action} tone="dark" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { paddingHorizontal: 24, alignSelf: 'stretch' },
  messageText: { marginTop: 8, marginBottom: 20 },
  paused: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: colors.black,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
