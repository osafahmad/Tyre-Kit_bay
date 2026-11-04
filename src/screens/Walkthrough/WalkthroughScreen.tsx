import React, { useCallback, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AppText,
  Button,
  DarkTopBar,
  ProgressSegments,
  StatusBadge,
  WalkthroughCarArt,
  WalkthroughTyreArt,
} from '../../components';
import type { RootStackParamList } from '../../app/routes';
import { settings } from '../../features/inspection/settings';
import { colors, fonts, radius, sizes } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Walkthrough'>;

const pages = [
  {
    title: 'Scan the vehicle',
    text: 'Point your camera at the number plate and chassis number. Both are optional, so you can skip them.',
  },
  {
    title: 'Capture every tyre',
    text: 'Follow the on-screen guides for the sidewall and tread. The app tells you when each capture is done.',
  },
  {
    title: 'Know what to replace',
    text: "See each tyre's condition, size, rim diameter, and age. Then share the report in one tap.",
  },
] as const;

/** 02–04 Walkthrough. One pager so the steps can be swiped as well as tapped. */
export function WalkthroughScreen({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollViewInstance>(null);
  const [step, setStep] = useState<number>(route.params?.step ?? 0);

  const goTo = useCallback(
    (next: number) => {
      scroller.current?.scrollTo({ x: next * width, animated: true });
      setStep(next);
      AccessibilityInfo.announceForAccessibility(`Step ${next + 1} of 3. ${pages[next].title}`);
    },
    [width],
  );

  const finish = () => {
    settings.setHasSeenWalkthrough(true);
    navigation.navigate('CameraAccess');
  };

  const onBack = () => (step === 0 ? navigation.goBack() : goTo(step - 1));

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setStep(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.root}>
      <DarkTopBar onBack={onBack} onSkip={step < 2 ? finish : undefined} topOffset={4} />
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        contentOffset={{ x: step * width, y: 0 }}
        style={styles.pager}
      >
        {pages.map((page, i) => (
          <View
            key={page.title}
            style={{ width }}
            // Only the visible page is reachable by screen readers.
            accessibilityElementsHidden={i !== step}
            importantForAccessibility={i === step ? 'auto' : 'no-hide-descendants'}
          >
            <View style={styles.hero}>{i === 0 ? <CarHero width={width} /> : i === 1 ? <TyreHero /> : <ReportHero />}</View>
            <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
              <ProgressSegments total={3} filled={i + 1} accessibilityLabel={`Step ${i + 1} of 3`} />
              <AppText variant="walkthroughTitle" accessibilityRole="header" style={styles.title}>
                {page.title}
              </AppText>
              <AppText variant="bodyLarge" color="textBody" style={styles.text}>
                {page.text}
              </AppText>
              <Button
                variant="walkthrough"
                label={i === 2 ? 'Get started' : 'Next'}
                onPress={i === 2 ? finish : () => goTo(i + 1)}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function CarHero({ width }: { width: number }) {
  // Walkthrough1.dc.html, scaled from the 390pt frame.
  const s = Math.min(width, sizes.maxContentWidth) / 390;
  const left = (width - 390 * s) / 2;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.carArt, { left }]}>
        <WalkthroughCarArt width={390 * s} />
      </View>
      <View
        style={[
          styles.plateBox,
          { left: left + 45 * s, top: 232 * s, width: 300 * s, height: 112 * s },
        ]}
      >
        <View style={styles.plate}>
          <AppText variant="walkthroughTitle" maxFontSizeMultiplier={1}>
            ABC-1234
          </AppText>
        </View>
      </View>
      <View style={[styles.tick, { left: left + (390 - 28 - 48) * s, top: 210 * s }]}>
        <Check size={26} color={colors.navy} strokeWidth={3} />
      </View>
    </View>
  );
}

function TyreHero() {
  return (
    <View style={styles.centred} pointerEvents="none">
      <WalkthroughTyreArt size={350} />
      <View style={styles.distancePill}>
        <Check size={20} color={colors.navy} strokeWidth={3} />
        <AppText variant="bodySmall" weight="bold" color="navy">
          Distance OK
        </AppText>
      </View>
    </View>
  );
}

function ReportHero() {
  const rows = [
    { name: 'Right front', status: 'replace_soon' },
    { name: 'Left rear', status: 'good' },
    { name: 'Right rear', status: 'replace_now' },
  ] as const;
  return (
    <View style={styles.reportWrap} pointerEvents="none">
      <View style={styles.reportCard}>
        <View style={styles.reportHead}>
          <AppText variant="rowLabel" color="textOnDark">
            Left front tyre
          </AppText>
          <View style={styles.reportHeadRow}>
            <AppText style={styles.reportDepth} color="white" maxFontSizeMultiplier={1.2}>
              6.2 mm
            </AppText>
            <StatusBadge status="good" size="medium" />
          </View>
        </View>
        <View style={styles.reportRows}>
          {rows.map((r, i) => (
            <View key={r.name} style={[styles.reportRow, i < rows.length - 1 && styles.reportDivider]}>
              <AppText variant="body" weight="semibold">
                {r.name}
              </AppText>
              <StatusBadge status={r.status} size="medium" />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  pager: { flex: 1 },
  hero: { flex: 1, overflow: 'hidden' },
  panel: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.walkthroughSheet,
    borderTopRightRadius: radius.walkthroughSheet,
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  title: { marginTop: 22, marginBottom: 10 },
  text: { marginBottom: 24, minHeight: 78 },
  carArt: { position: 'absolute', top: 0 },
  plateBox: {
    position: 'absolute',
    borderWidth: 4,
    borderColor: colors.cameraBlue,
    borderRadius: 14,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plate: {
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 26,
  },
  tick: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 4,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centred: { flex: 1, alignItems: 'center' },
  distancePill: {
    position: 'absolute',
    bottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: radius.badge,
    backgroundColor: colors.white,
  },
  reportWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 24 },
  reportCard: {
    width: '100%',
    maxWidth: sizes.maxContentWidth,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    overflow: 'hidden',
  },
  reportHead: { backgroundColor: colors.black, paddingVertical: 18, paddingHorizontal: 20 },
  reportHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  reportDepth: { fontFamily: fonts.bold, fontSize: 38, lineHeight: 46 },
  reportRows: { paddingTop: 6, paddingBottom: 8, paddingHorizontal: 20 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 58,
  },
  reportDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
