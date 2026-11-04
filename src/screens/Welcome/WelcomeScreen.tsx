import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, LogoMark, WelcomeTyreArt } from '../../components';
import { useRootNavigation } from '../../app/navigation';
import { colors, sizes } from '../../theme';

/** 01 Welcome (Main.dc.html). */
export function WelcomeScreen() {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) + 24 },
      ]}
    >
      <LogoMark size={32} />
      <View style={styles.art} pointerEvents="none">
        <WelcomeTyreArt />
      </View>
      <View style={styles.bottom}>
        <AppText variant="hero" color="white" accessibilityRole="header">
          Tyre Kit Bay
        </AppText>
        <AppText variant="bodyLarge" color="textOnDark" style={styles.text}>
          Check tyre condition, size, and age with your phone camera.
        </AppText>
        <Button label="Get started" tone="dark" onPress={() => navigation.navigate('Walkthrough')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
    paddingHorizontal: sizes.screenPaddingWide,
    overflow: 'hidden',
  },
  art: { position: 'absolute', right: -110, top: 130 },
  bottom: { marginTop: 'auto', width: '100%', maxWidth: sizes.maxContentWidth },
  text: { marginTop: 16, marginBottom: 28 },
});
