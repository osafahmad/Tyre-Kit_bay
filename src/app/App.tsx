import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { devConfig } from '../config/dev';
import { useInspectionStore } from '../features/inspection/store';
import { settings } from '../features/inspection/settings';
import { startPersistence } from '../features/inspection/persistence';
import {
  SqliteInspectionRepository,
  type InspectionRepository,
} from '../features/inspection/repository';
import { demoInspections } from '../dev/demoInspections';
import { RootNavigator } from './RootNavigator';
import { AppText, Button } from '../components';
import { navigationRef } from './navigation';

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.navy,
    background: colors.white,
    card: colors.white,
    text: colors.black,
    border: colors.border,
  },
  fonts: {
    regular: { fontFamily: fonts.regular, fontWeight: 'normal' },
    medium: { fontFamily: fonts.medium, fontWeight: 'normal' },
    bold: { fontFamily: fonts.semibold, fontWeight: 'normal' },
    heavy: { fontFamily: fonts.bold, fontWeight: 'normal' },
  },
};

let defaultRepository: InspectionRepository | null = null;

export default function App({ repository }: { repository?: InspectionRepository }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    const repo = repository ?? (defaultRepository ??= new SqliteInspectionRepository());
    startPersistence(repo)
      .then(unsubscribe => {
        stop = unsubscribe;
        if (cancelled) return unsubscribe();
        const store = useInspectionStore.getState();
        if (devConfig.seedDemoInspections && store.inspections.length === 0) {
          store.replaceAll(demoInspections(), null);
        }
        setStatus('ready');
      })
      .catch(() => {
        // Without storage nothing could be saved, so don't carry on silently.
        if (!cancelled) setStatus('failed');
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [repository, attempt]);

  if (status === 'failed') {
    return (
      <SafeAreaProvider>
        <View style={styles.failed}>
          <AppText variant="sheetTitle" color="white" accessibilityRole="header">
            Saved inspections couldn't be opened
          </AppText>
          <AppText variant="body" color="textOnDark" style={styles.failedText}>
            Close the app and open it again. If this keeps happening, free up some storage space.
          </AppText>
          <Button
            label="Try again"
            tone="dark"
            onPress={() => {
              setStatus('loading');
              setAttempt(a => a + 1);
            }}
          />
        </View>
      </SafeAreaProvider>
    );
  }

  if (status === 'loading') {
    // Same black as the launch screen while saved inspections load.
    return <View style={styles.loading} />;
  }

  // First launch shows Welcome; after that Home, with nothing behind it.
  const initialRouteName = settings.hasSeenWalkthrough() ? 'Tabs' : 'Welcome';

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
        <RootNavigator initialRouteName={initialRouteName} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.black },
  failed: { flex: 1, justifyContent: 'center', backgroundColor: colors.black, padding: 24 },
  failedText: { marginTop: 8, marginBottom: 24 },
});
