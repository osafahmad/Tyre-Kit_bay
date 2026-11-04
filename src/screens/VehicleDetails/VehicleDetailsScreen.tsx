import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, DarkContentHeader, TextField } from '../../components';
import { backTo, useRootNavigation } from '../../app/navigation';
import { useCurrentInspection, useInspectionStore } from '../../features/inspection/store';
import {
  emptyToNull,
  isUnusualChassis,
  normaliseChassis,
  normalisePlate,
} from '../../features/inspection/validation';
import { colors, sizes } from '../../theme';

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.link}>
      <AppText variant="rowLabel" weight="semibold" color="navy">
        {label}
      </AppText>
    </Pressable>
  );
}

/** 11 Vehicle details (Vehicle.dc.html). Both fields are optional. */
export function VehicleDetailsScreen() {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  const inspection = useCurrentInspection();
  const setVehicle = useInspectionStore(s => s.setVehicle);
  const [plate, setPlate] = useState(inspection?.plate ?? '');
  const [chassis, setChassis] = useState(inspection?.chassis ?? '');

  const save = () => setVehicle({ plate: emptyToNull(plate), chassis: emptyToNull(chassis) });

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <DarkContentHeader
        title="Check vehicle details"
        stepLabel="Step 2 of 3"
        onBack={() => {
          save();
          navigation.goBack();
        }}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View>
          <TextField
            label="Number plate"
            optional
            value={plate}
            onChangeText={t => setPlate(normalisePlate(t))}
            placeholder="e.g. ABC-1234"
            autoCapitalize="characters"
            returnKeyType="next"
          />
          <LinkButton
            label="Scan plate again"
            onPress={() => {
              save();
              backTo(navigation, 'PlateScan');
            }}
          />
        </View>
        <View>
          <TextField
            label="Chassis number"
            optional
            monospace
            value={chassis}
            onChangeText={t => setChassis(normaliseChassis(t))}
            placeholder="e.g. JT2BG22K0W0123456"
            autoCapitalize="characters"
            maxLength={30}
            helper="Some vehicles have fewer than 17 characters."
          />
          {isUnusualChassis(chassis) ? (
            <AppText variant="caption" color="textSecondary" style={styles.warning} accessibilityLiveRegion="polite">
              Chassis numbers usually have 5 to 17 letters and numbers. Check it before you continue.
            </AppText>
          ) : null}
          <LinkButton
            label="Scan chassis number again"
            onPress={() => {
              save();
              backTo(navigation, 'ChassisScan');
            }}
          />
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
        <Button
          label="Continue"
          onPress={() => {
            save();
            navigation.navigate('SelectTyres');
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { padding: 20, paddingTop: 24, gap: 24, maxWidth: sizes.maxContentWidth, width: '100%', alignSelf: 'center' },
  link: { minHeight: sizes.touchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  warning: { marginTop: 6 },
  footer: { paddingHorizontal: 20, paddingTop: 12 },
});
