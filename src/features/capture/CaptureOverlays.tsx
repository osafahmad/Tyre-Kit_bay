import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button } from '../../components';
import { colors } from '../../theme';
import { LOW_STORAGE_MESSAGE } from './frameFiles';

export const SAVE_FAILED_MESSAGE = "The frames couldn't be saved. Try again.";

/** Covers the viewfinder when frames can't be saved (spec §8 low storage, or another write error). */
export function SaveProblemOverlay({
  kind,
  onRetry,
}: {
  kind: 'storage' | 'other';
  onRetry: () => void;
}) {
  return (
    <View style={styles.fill} accessibilityLiveRegion="polite">
      <AppText variant="body" color="white" align="center" style={styles.text}>
        {kind === 'storage' ? LOW_STORAGE_MESSAGE : SAVE_FAILED_MESSAGE}
      </AppText>
      <Button label="Try again" tone="dark" onPress={onRetry} />
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
    padding: 24,
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
  text: { marginBottom: 20 },
});
