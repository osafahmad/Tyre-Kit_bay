import React from 'react';
import { Alert } from 'react-native';
import {
  useNavigation,
  useNavigationState,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import { useInspectionStore } from '../features/inspection/store';
import { useCaptureBlock } from '../features/capture/captureBlock';

/** Only going back out of the flow asks first; resets (Done, View report) don't. */
const BACK_ACTIONS = new Set(['GO_BACK', 'POP', 'POP_TO_TOP']);

/**
 * Wraps inspection screens. Leaving an unfinished inspection back to Home asks
 * `Leave this inspection?`. Covers the back button, Android back and iOS swipe.
 * Everything is already saved, so `Save and leave` just continues.
 */
export function LeaveInspectionGuard({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation();
  const route = useRoute();
  const unfinished = useInspectionStore(s => s.currentId !== null);
  const leavesFlow = useNavigationState(state => {
    const index = state.routes.findIndex(r => r.key === route.key);
    return index > 0 && state.routes[index - 1].name === 'Tabs';
  });

  usePreventRemove(unfinished && leavesFlow, ({ data }) => {
    if (!BACK_ACTIONS.has(data.action.type)) {
      navigation.dispatch(data.action);
      return;
    }
    // Pause capture while the dialog is open.
    const { setBlocked } = useCaptureBlock.getState();
    setBlocked(true);
    Alert.alert(
      'Leave this inspection?',
      'It stays saved. You can continue it from Home.',
      [
        { text: 'Keep scanning', style: 'cancel', onPress: () => setBlocked(false) },
        {
          text: 'Save and leave',
          onPress: () => {
            setBlocked(false);
            navigation.dispatch(data.action);
          },
        },
      ],
      { cancelable: true, onDismiss: () => setBlocked(false) },
    );
  });

  return <>{children}</>;
}
