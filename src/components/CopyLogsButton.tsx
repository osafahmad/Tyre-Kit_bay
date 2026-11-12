import React, { useEffect, useRef, useState } from 'react';
import { Clipboard } from 'react-native';
import { diagnosticsConfig } from '../config/diagnostics';
import { getDebugLogsText, isDebugLogBufferEnabled } from '../utils/debugLogBuffer';
import { Button } from './Button';

/** How long `Copied` shows after a copy. */
export const COPIED_MS = 2000;

/** Whether "Copy logs" is shown: staging builds only (`diagnosticsConfig.enableStagingLogs`). */
export const stagingLogsShown = () => diagnosticsConfig.enableStagingLogs && isDebugLogBufferEnabled();

/**
 * STAGING ONLY (owner request 2026-11-12). Copies the buffered `[SidewallOCR]`
 * and `[TreadWear]` lines (`src/utils/debugLogBuffer.ts`) to the clipboard, so
 * they can be pasted from a Release build with no console. Renders nothing
 * unless `diagnosticsConfig.enableStagingLogs` is on. Uses React Native's
 * own Clipboard module (no new dependency, DECISIONS.md 2026-11-12).
 */
export function CopyLogsButton({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  if (!stagingLogsShown()) return null;
  return (
    <Button
      label={copied ? 'Copied' : 'Copy logs'}
      variant="text"
      tone={tone}
      height={44}
      testID="copy-logs"
      accessibilityHint="Copies the diagnostic logs of this session to the clipboard."
      onPress={() => {
        const text = getDebugLogsText();
        Clipboard.setString(text === '' ? '(no logs recorded yet)' : text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      }}
    />
  );
}
