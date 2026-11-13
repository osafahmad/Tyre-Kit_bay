import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, BackButton, Button, SidewallDoneArt } from '../../components';
import { goBackSafely } from '../../app/navigation';
import type { RootStackParamList } from '../../app/routes';
import { useInspectionStore, useTyre } from '../../features/inspection/store';
import { emptyToNull } from '../../features/inspection/validation';
import type { SidewallDetails } from '../../features/inspection/types';
import { unlink } from '@dr.pogodin/react-native-fs';
import { applyMergedSuggestions, applySuggestions, getSidewallReader, type SidewallSuggestions } from '../../ml/sidewallReader';
import { getSidewallTextDetector } from '../../ml/services/SidewallTextDetector';
import { countSidewallDetections, NO_SIDEWALL_NOTICE, sidewallLooksEmpty } from '../../ml/services/sidewallPresence';
import { cropPassCoveredAllFrames, readSidewallCrops } from '../../ml/services/sidewallCropPass';
import { cropSuggestions, mergeCropSuggestions } from '../../ml/sidewallCropMerge';
import { sidewallLog } from '../../ml/ocr/sidewallDebug';
import { ocrConfig } from '../../config/capture';
import { TriangleAlert } from 'lucide-react-native';
import { colors, fonts, radius, sizes } from '../../theme';

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
 * On open, the sidewall frames are read on the phone (whole saved frame →
 * ML Kit → sidewall text filter; size, DOT/TIN, a known make, and a listed model family). Results only fill fields that are still empty and
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
  // Owner request 2026-11-13: OCR read no line and the text detector found no box in any frame.
  const [emptyNotice, setEmptyNotice] = useState(false);

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
      .then(async outcome => {
        if (cancelled || outcome.status !== 'done') return;
        const before = valuesRef.current;
        const next = applySuggestions(before, outcome.suggestions, touched.current);
        // Only what this read filled may be replaced by the crops below.
        const filled: SidewallSuggestions = {};
        for (const f of fields) if (next[f.key] !== before[f.key]) filled[f.key] = next[f.key];
        if (Object.keys(filled).length > 0) {
          setValues(next);
          saveRef.current(next);
        }

        // Stage 3 (owner request 2026-11-13): detector boxes → crop OCR → merged with the whole-frame values.
        const detector = getSidewallTextDetector();
        const pass = await readSidewallCrops(frames, detector, { isCancelled: () => cancelled, deleteFile: unlink });
        if (cancelled) return;
        const crops = cropSuggestions(pass.frames, ocrConfig.sidewallMinAgreeingReads);
        if (Object.keys(crops).length > 0) {
          const merged = mergeCropSuggestions(outcome.suggestions, outcome.basis ?? {}, crops);
          const after = applyMergedSuggestions(valuesRef.current, merged.suggestions, filled, touched.current);
          sidewallLog('detector crops merged with the whole-frame read', {
            crops,
            decisions: merged.decisions,
            applied: fields.filter(f => after[f.key] !== valuesRef.current[f.key]).map(f => f.key),
          });
          if (fields.some(f => after[f.key] !== valuesRef.current[f.key])) {
            setValues(after);
            saveRef.current(after);
          }
        }

        if (outcome.linesRead === 0) {
          // Nothing read anywhere: ask the detector before saying the capture is empty.
          const count = cropPassCoveredAllFrames(pass)
            ? { detections: pass.detections, framesRun: pass.framesRun, modelMissing: pass.modelMissing }
            : await countSidewallDetections(frames, detector, () => cancelled);
          if (!cancelled && sidewallLooksEmpty(outcome.linesRead, count)) setEmptyNotice(true);
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

  // Inline Edit (owner request 2026-11-13): focuses that field's input; Done closes the keyboard.
  const inputs = useRef<Partial<Record<keyof SidewallDetails, React.ComponentRef<typeof TextInput> | null>>>({});
  const [editing, setEditing] = useState<keyof SidewallDetails | null>(null);
  const toggleEdit = (key: keyof SidewallDetails) => {
    const input = inputs.current[key];
    if (editing === key) input?.blur();
    else input?.focus();
  };

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
      <BackButton
        overlay
        onPress={() => {
          save();
          goBackSafely(navigation);
        }}
      />
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
        {emptyNotice ? (
          <View style={styles.notice} accessibilityRole="alert" testID="no-sidewall-notice">
            <TriangleAlert size={18} color={colors.navy} strokeWidth={2.5} />
            <AppText variant="caption" weight="semibold" color="navy" style={styles.noticeText}>
              {NO_SIDEWALL_NOTICE}
            </AppText>
          </View>
        ) : null}
        {fields.map(f => (
          <View key={f.key} style={styles.field}>
            <AppText variant="rowLabel" color="textSecondary" style={styles.fieldLabel}>
              {f.label}
            </AppText>
            <TextInput
              ref={r => {
                inputs.current[f.key] = r;
              }}
              value={values[f.key]}
              onFocus={() => setEditing(f.key)}
              onBlur={() => setEditing(e => (e === f.key ? null : e))}
              onChangeText={t => change(f.key, t, f.upper)}
              placeholder={reading && !touched.current.has(f.key) ? 'Reading…' : 'Not read'}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={f.label}
              accessibilityHint={values[f.key] === '' ? 'Not read. Type it in if you can see it.' : undefined}
              autoCapitalize={f.upper ? 'characters' : 'words'}
              autoCorrect={false}
              style={[styles.input, editing === f.key && styles.inputActive]}
            />
            <Pressable
              onPress={() => toggleEdit(f.key)}
              accessibilityRole="button"
              accessibilityLabel={`${editing === f.key ? 'Done editing' : 'Edit'} ${f.label}`}
              hitSlop={4}
              style={({ pressed }) => [styles.edit, { opacity: pressed ? 0.6 : 1 }]}
            >
              <AppText variant="bodySmall" weight="semibold" color="navy">
                {editing === f.key ? 'Done' : 'Edit'}
              </AppText>
            </Pressable>
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
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.navy,
    borderRadius: 10,
  },
  noticeText: { flex: 1 },
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
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  inputActive: { borderBottomColor: colors.navy },
  edit: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  actions: { gap: 6, marginTop: 12 },
});
