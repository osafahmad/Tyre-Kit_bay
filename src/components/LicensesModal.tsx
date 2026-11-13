import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { LICENSE_NOTICES, type LicenseNotice } from '../config/licenses';
import { LICENSE_TEXTS } from '../config/licenseTexts';
import { colors, radius, sizes } from '../theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

// Third-party licence notices in a bottom sheet over the current screen. An
// overlay, not a route: the app keeps the spec's 21 screens (owner decision
// 2026-11-10). Links are plain selectable text: the app opens nothing and
// makes no network calls.

export const LICENSES_TITLE = 'Third-Party Licenses';

function Notice({ n }: { n: LicenseNotice }) {
  // Full licence texts are long (Apache-2.0, MMKV's OpenSSL terms), so each
  // stays folded until asked for.
  const [showText, setShowText] = useState(false);
  return (
    <View style={styles.notice} testID={`license-${n.id}`}>
      <AppText variant="body" weight="semibold" accessibilityRole="header">
        {n.title}
      </AppText>
      {n.creator ? (
        <AppText variant="bodySmall" color="textSecondary">
          {n.creator}
        </AppText>
      ) : null}
      <AppText variant="bodySmall" weight="medium" color="navy">
        {n.license}
      </AppText>
      <AppText variant="bodySmall" color="textBody" selectable>
        {n.notice}
      </AppText>
      {n.sourceUrl ? (
        <AppText variant="caption" color="textSecondary" selectable>
          {n.sourceUrl}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textSecondary" selectable>
        {n.licenseUrl}
      </AppText>
      {n.licenseTextId ? (
        <>
          <Pressable
            style={styles.toggle}
            onPress={() => setShowText(v => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showText }}
            accessibilityLabel={`${showText ? 'Hide' : 'Show'} licence text for ${n.title}`}
          >
            <AppText variant="bodySmall" weight="medium" color="navy">
              {showText ? 'Hide licence text' : 'Show licence text'}
            </AppText>
          </Pressable>
          {showText ? (
            <AppText variant="caption" color="textBody" selectable testID={`license-text-${n.id}`}>
              {LICENSE_TEXTS[n.licenseTextId]}
            </AppText>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function LicensesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${LICENSES_TITLE}`}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal>
          <View style={styles.head}>
            <AppText variant="body" weight="semibold" accessibilityRole="header">
              {LICENSES_TITLE}
            </AppText>
            <IconButton icon={X} color="black" accessibilityLabel={`Close ${LICENSES_TITLE}`} onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {LICENSE_NOTICES.map(n => (
              <Notice key={n.id} n={n} />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Black token at 50% alpha as the dimmed backdrop.
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: `${colors.black}80` },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.largeCard,
    borderTopRightRadius: radius.largeCard,
    paddingHorizontal: 20,
    paddingTop: 8,
    width: '100%',
    maxWidth: sizes.maxContentWidth,
    alignSelf: 'center',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: sizes.touchTarget,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  list: { paddingVertical: 8 },
  toggle: { minHeight: sizes.touchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  notice: { paddingVertical: 14, gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
});
