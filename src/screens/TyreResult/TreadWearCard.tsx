import React, { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import { CircleCheck, CircleHelp, OctagonAlert, TriangleAlert } from 'lucide-react-native';
import { AppText } from '../../components';
import type { TreadWearState } from '../../hooks/useTyreInspection';
import { WEAR_SEVERITY_LABELS } from '../../features/inspection/treadWear';
import type { TreadWearRecord } from '../../features/inspection/types';
import { colors, radius } from '../../theme';

// "Tread Pattern & Wear" card on Tyre result. Shows what the tread wear model
// found on this tyre's saved tread frames. It's separate from the tyre status
// (Good / Replace soon / Replace now) and never changes it, so it uses theme
// tokens, not the status colours. Every badge has a text label and an icon.

export const TREAD_WEAR_CARD_TITLE = 'Tread Pattern & Wear';

const UNAVAILABLE_TEXT = {
  model_missing: "The tread wear model isn't available on this phone.",
  no_frames: 'There are no saved tread frames to check.',
  unreadable: "The saved tread frames couldn't be read.",
} as const;

type BadgeTone = 'neutral' | 'normal' | 'warning' | 'critical';

const BADGE_STYLE: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary, border: colors.border },
  normal: { bg: colors.surfaceMuted, fg: colors.black, border: colors.border },
  warning: { bg: colors.white, fg: colors.navy, border: colors.navy },
  critical: { bg: colors.navy, fg: colors.white, border: colors.navy },
};

const BADGE_ICON = {
  neutral: CircleHelp,
  normal: CircleCheck,
  warning: TriangleAlert,
  critical: OctagonAlert,
} as const;

function WearBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  const s = BADGE_STYLE[tone];
  const Icon = BADGE_ICON[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}
      accessible
      accessibilityLabel={`Tread wear: ${label}`}
    >
      <Icon size={15} color={s.fg} strokeWidth={2.5} />
      <AppText variant="caption" weight="semibold" style={{ color: s.fg }}>
        {label}
      </AppText>
    </View>
  );
}

/** What the card says, as plain data (also used for the screen-reader announcement). */
export function treadWearCardContent(state: TreadWearState): {
  tone: BadgeTone | null;
  badge: string | null;
  lines: string[];
  title: string | null;
  alsoSeen: string[];
} {
  switch (state.status) {
    case 'idle':
    case 'scanning':
      return { tone: null, badge: null, lines: ['Checking tread wear on this phone…'], title: null, alsoSeen: [] };
    case 'unavailable':
      return { tone: 'neutral', badge: 'Not checked', lines: [UNAVAILABLE_TEXT[state.reason]], title: null, alsoSeen: [] };
    case 'done':
    case 'saved':
      return recordContent(state.record);
  }
}

/** A saved or just-finished check → card content. Same wording as the report. */
function recordContent(record: TreadWearRecord): ReturnType<typeof treadWearCardContent> {
  if (record.severity === 'none') {
    return {
      tone: 'normal',
      badge: WEAR_SEVERITY_LABELS.none,
      lines: ['No uneven wear pattern was found on the tread.'],
      title: null,
      alsoSeen: [],
    };
  }
  const critical = record.severity === 'critical';
  const lines: string[] = [];
  if (record.cause) lines.push(`Likely cause: ${record.cause}`);
  if (record.recommendation) lines.push(critical ? record.recommendation : `Advice: ${record.recommendation}`);
  return {
    tone: critical ? 'critical' : 'warning',
    badge: WEAR_SEVERITY_LABELS[record.severity],
    lines,
    title: record.title,
    alsoSeen: record.alsoSeen,
  };
}

export function TreadWearCard({ state }: { state: TreadWearState }) {
  const content = treadWearCardContent(state);
  const busy = state.status === 'idle' || state.status === 'scanning';

  // Announce the outcome once the check finishes (spec §8).
  const announcement = busy ? null : [content.badge, content.title].filter(Boolean).join(': ');
  useEffect(() => {
    if (announcement) AccessibilityInfo.announceForAccessibility(`Tread wear check: ${announcement}`);
  }, [announcement]);

  return (
    <View style={styles.card} accessibilityLiveRegion="polite" testID="tread-wear-card">
      <AppText variant="rowLabel" weight="semibold" color="black" accessibilityRole="header">
        {TREAD_WEAR_CARD_TITLE}
      </AppText>
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator size="small" color={colors.navy} />
          <AppText variant="caption" color="textSecondary">
            {content.lines[0]}
          </AppText>
        </View>
      ) : (
        <>
          {content.tone && content.badge ? <WearBadge tone={content.tone} label={content.badge} /> : null}
          {content.title ? (
            <AppText variant="bodySmall" weight="semibold" color="black">
              {content.title}
            </AppText>
          ) : null}
          {content.lines.map(line => (
            <AppText key={line} variant="caption" color="textBody">
              {line}
            </AppText>
          ))}
          {content.alsoSeen.length > 0 ? (
            <AppText variant="caption" color="textSecondary">
              {`Also seen: ${content.alsoSeen.join(', ')}`}
            </AppText>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.white,
  },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.badge,
    borderWidth: 1,
  },
});
