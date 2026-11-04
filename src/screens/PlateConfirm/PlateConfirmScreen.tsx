import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Button, ConfirmCarArt } from '../../components';
import type { RootStackParamList } from '../../app/routes';
import { useInspectionStore } from '../../features/inspection/store';
import { colors, fonts, radius, sizes } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PlateConfirm'>;

/** 09 Confirm plate (PlateConfirm.dc.html). */
export function PlateConfirmScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const setVehicle = useInspectionStore(s => s.setVehicle);
  const { plate } = route.params;

  return (
    <View style={styles.root}>
      <View style={[styles.art, { paddingTop: insets.top + 40 }]}>
        <ConfirmCarArt />
      </View>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
        <View style={styles.titleRow}>
          <View style={styles.check}>
            <Check size={18} color={colors.white} strokeWidth={2.5} />
          </View>
          <AppText variant="sheetTitle" accessibilityRole="header">
            Plate found
          </AppText>
        </View>
        <View style={styles.plateBox}>
          <AppText style={styles.plate} accessibilityLabel={`Plate ${plate}`}>
            {plate}
          </AppText>
          <Pressable
            onPress={() => {
              setVehicle({ plate });
              navigation.navigate('VehicleDetails');
            }}
            accessibilityRole="button"
            accessibilityLabel="Edit plate"
            style={styles.edit}
          >
            <AppText variant="bodySmall" weight="semibold" color="navy">
              Edit
            </AppText>
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Button
            label="Confirm plate"
            onPress={() => {
              setVehicle({ plate });
              navigation.navigate('ChassisScan');
            }}
          />
          <Button label="Scan again" variant="text" onPress={() => navigation.goBack()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 20,
    paddingLeft: 16,
    paddingRight: 8,
    minHeight: 68,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
  },
  plate: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, flexShrink: 1 },
  edit: { minHeight: sizes.touchTarget, minWidth: sizes.touchTarget, justifyContent: 'center', paddingHorizontal: 10 },
  actions: { gap: 8 },
});
