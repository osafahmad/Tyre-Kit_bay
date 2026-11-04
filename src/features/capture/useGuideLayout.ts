import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { Rect, Size } from './guideGeometry';

/** Tracks the camera view size and the guide box inside it, and reports both together. */
export function useGuideLayout(onChange: (guide: Rect, view: Size) => void) {
  const view = useRef<Size | null>(null);
  const guide = useRef<Rect | null>(null);
  const emit = () => {
    if (view.current && guide.current) onChange(guide.current, view.current);
  };
  const onViewLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    view.current = { width, height };
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onGuideLayout = useCallback((e: LayoutChangeEvent) => {
    guide.current = e.nativeEvent.layout;
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { onViewLayout, onGuideLayout };
}
