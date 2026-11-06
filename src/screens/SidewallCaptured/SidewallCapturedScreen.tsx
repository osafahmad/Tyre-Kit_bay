import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Button, SidewallDoneArt } from '../../components';
import type { RootStackParamList } from '../../app/routes';
import { useInspectionStore, useTyre } from '../../features/inspection/store';
import { emptyToNull } from '../../features/inspection/validation';
import type { SidewallDetails } from '../../features/inspection/types';
import { applySuggestions, getSidewallReader } from '../../ml/sidewallReader';
import { colors, fonts, radius } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SidewallCaptured'>;

const fields: { key: keyof SidewallDetails; label: string; upper: boolean }[] = [
  { key: 'size', label: 'Tyre size', upper: true },
  { key: 'dotTin', label: 'DOT/TIN', upper: true },
  { key: 'make', label: 'Make', upper: false },
  { key: 'model', label: 'Model', upper: false },
];

/**
 * 14 Sidewall captured (SidewallDone.dc.html). Fields hold what OCR read;
 * anything it couldn't read stays empty and shows `Not read`.
 *
 * On open, the sidewall frames are read on the phone (text detector → crop →
 * ML Kit → field parsers). Results only fill fields that are still empty and
 * that the user hasn't edited; they stay editable, so the user confirms or
 * corrects them. If nothing can be read, fields stay `Not read`.
 */
export function SidewallCapturedScreen({ navigation, route }: Props) {
  const { tyreId } = route.params;
  const insets = useSafeAreaInsets();
  const found = useTyre(tyreId);
  const setSidewallDetails = useInspectionStore(s => s.setSidewallDetails);
  const [values, setValues] = useState<Record<keyof SidewallDetails, string>>(() => ({
    size: found?.tyre.sidewallDetails.size ?? '',
    dotTin: found?.tyre.sidewallDetails.dotTin ?? '',
    make: found?.tyre.sidewallDetails.make ?? '',
    model: found?.tyre.sidewallDetails.model ?? '',
  }));

  const valuesRef = useRef(values);
  valuesRef.current = values;
  const touched = useRef(new Set<keyof SidewallDetails>());
  const frames = found?.tyre.sidewallFrames;
  const [reading, setReading] = useState(
    () => !!frames && Object.values(values).some(v => v === '') && getSidewallReader().canRead(frames),
  );

  const save = (next = values) =>
    setSidewallDetails(tyreId, {
      size: emptyToNull(next.size),
      dotTin: emptyToNull(next.dotTin),
      make: emptyToNull(next.make),
      model: emptyToNull(next.model),
    });

  const saveRef = useRef(save);
  saveRef.current = save;

  // Runs once per tyre when the screen opens, if there's anything to read.
  useEffect(() => {
    if (!reading || !frames) return;
    let cancelled = false;
    getSidewallReader()
      .read(frames, () => cancelled)
      .then(outcome => {
        if (cancelled || outcome.status !== 'done') return;
        const next = applySuggestions(valuesRef.current, outcome.suggestions, touched.current);
        if (fields.some(f => next[f.key] !== valuesRef.current[f.key])) {
          setValues(next);
          saveRef.current(next);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tyreId]);

  const change = (key: keyof SidewallDetails, text: string, upper: boolean) => {
    touched.current.add(key);
    const next = { ...values, [key]: upper ? text.toUpperCase() : text };
    setValues(next);
    save(next);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.art, { paddingTop: insets.top + 32 }]}>
        <SidewallDoneArt size={210} />
      </View>
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <AppText variant="sheetTitle" accessibilityRole="header">
          Sidewall captured
        </AppText>
        <AppText variant="rowLabel" color="textSecondary" style={styles.lead}>
          Check the details and correct anything that's wrong.
        </AppText>
        {fields.map(f => (
          <View key={f.key} style={styles.field}>
            <AppText variant="rowLabel" color="textSecondary" style={styles.fieldLabel}>
              {f.label}
            </AppText>
            <TextInput
              value={values[f.key]}
              onChangeText={t => change(f.key, t, f.upper)}
              placeholder={reading && !touched.current.has(f.key) ? 'Reading…' : 'Not read'}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={f.label}
              accessibilityHint={values[f.key] === '' ? 'Not read. Type it in if you can see it.' : undefined}
              autoCapitalize={f.upper ? 'characters' : 'words'}
              autoCorrect={false}
              style={styles.input}
            />
          </View>
        ))}
        <View style={styles.actions}>
          <Button
            label="Scan tread"
            onPress={() => {
              save();
              navigation.navigate('TreadCapture', { tyreId });
            }}
          />
          <Button
            label="Scan sidewall again"
            variant="text"
            height={44}
            onPress={() => navigation.replace('SidewallCapture', { tyreId })}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 160 },
  sheetScroll: {
    flexGrow: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  sheet: { paddingTop: 22, paddingHorizontal: 20 },
  lead: { marginTop: 4, marginBottom: 12 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fieldLabel: { width: 96 },
  input: {
    flex: 1,
    minHeight: 44,
    textAlign: 'right',
    color: colors.black,
    fontFamily: fonts.semibold,
    fontSize: 15,
    paddingVertical: 8,
  },
  actions: { gap: 6, marginTop: 12 },
});
