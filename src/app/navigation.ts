import {
  CommonActions,
  StackActions,
  createNavigationContainerRef,
  useNavigation,
  type NavigationAction,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './routes';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

export function useRootNavigation(): RootNavigation {
  return useNavigation<RootNavigation>();
}

/** The parts of a navigation object these helpers need. */
type Navigator = {
  dispatch(action: NavigationAction): void;
  getState(): { routes: readonly { name: string }[] } | undefined;
};

/** Go back to a screen if it's in the stack, otherwise open it. */
export function backTo<Name extends keyof RootStackParamList>(
  navigation: Navigator,
  name: Name,
  ...params: undefined extends RootStackParamList[Name]
    ? [RootStackParamList[Name]?]
    : [RootStackParamList[Name]]
) {
  const inStack = navigation.getState()?.routes.some(r => r.name === name);
  if (inStack) {
    navigation.dispatch(StackActions.popTo(name, params[0]));
  } else {
    navigation.dispatch(CommonActions.navigate({ name, params: params[0] }));
  }
}

/**
 * The on-screen back button (owner request 2026-11-13). Same as Android back
 * and iOS swipe, so `LeaveInspectionGuard` still asks before leaving an
 * unfinished inspection. If nothing is behind (a restored root), go Home,
 * where `Continue inspection` picks the inspection up again.
 */
export function goBackSafely(navigation: Navigator & { canGoBack(): boolean; goBack(): void }) {
  if (navigation.canGoBack()) navigation.goBack();
  else resetToHome(navigation);
}

/** Home with nothing behind it. */
export function resetToHome(navigation: Navigator) {
  navigation.dispatch(
    CommonActions.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Home' } }] }),
  );
}

/** Inspection progress is the hub between tyres; back from it goes Home. */
export function resetToProgress(navigation: Navigator) {
  navigation.dispatch(
    CommonActions.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'InspectionProgress' }] }),
  );
}

export function resetToReport(
  navigation: Navigator,
  inspectionId: string,
) {
  navigation.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [{ name: 'Tabs' }, { name: 'Report', params: { inspectionId } }],
    }),
  );
}
