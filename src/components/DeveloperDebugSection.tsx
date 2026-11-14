import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { colors, sizes } from '../theme';
import { AppText } from './AppText';
import { CopyLogsButton, stagingLogsShown } from './CopyLogsButton';
import { SidewallDetectorDebugCard, sidewallDetectorCardShown } from './SidewallDetectorDebugCard';

export const DEVELOPER_DEBUG_TITLE = 'Developer debug';

/** Whether the section exists at all: only when a staging diagnostics flag is on. */
export const developerDebugShown = () => stagingLogsShown() || sidewallDetectorCardShown();

/**
 * STAGING ONLY (owner request 2026-11-14). One collapsed row at the end of
 * Sidewall captured that opens to "Copy logs" and the sidewall text detector
 * card. Closed by default, so the sheet looks as designed until a tester opens
 * it, and the card's extra detector and crop-OCR pass runs only while it is
 * open. Renders nothing when both staging flags are off (store builds).
 */
export function DeveloperDebugSection({ frames }: { frames?: string[] }) {
  const [open, setOpen] = useState(false);
  if (!developerDebugShown()) return null;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View style={styles.section} testID="developer-debug">
      <Pressable
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityLabel={DEVELOPER_DEBUG_TITLE}
        accessibilityState={{ expanded: open }}
        accessibilityHint="Staging diagnostics. Not part of the inspection."
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.6 : 1 }]}
      >
        <AppText variant="caption" weight="semibold" color="textSecondary">
          {DEVELOPER_DEBUG_TITLE}
        </AppText>
        <Chevron size={18} color={colors.textSecondary} strokeWidth={2.5} />
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <CopyLogsButton />
          {frames ? <SidewallDetectorDebugCard frames={frames} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  header: {
    minHeight: sizes.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: { paddingBottom: 4 },
});
