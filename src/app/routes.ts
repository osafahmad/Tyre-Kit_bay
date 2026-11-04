import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CaptureErrorReason } from '../features/inspection/types';

export type CaptureStage = 'sidewall' | 'tread';

export type TabParamList = {
  Home: undefined;
  History: undefined;
};

export type RootStackParamList = {
  Welcome: undefined;
  /** Walkthrough 1–3 are pages of one pager so horizontal swipe works. */
  Walkthrough: { step?: 0 | 1 | 2 } | undefined;
  CameraAccess: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  PlateScan: undefined;
  PlateConfirm: { plate: string };
  ChassisScan: undefined;
  VehicleDetails: undefined;
  SelectTyres: undefined;
  SidewallCapture: { tyreId: string };
  SidewallCaptured: { tyreId: string };
  TreadCapture: { tyreId: string };
  CaptureProblem: { tyreId: string; stage: CaptureStage; reason: CaptureErrorReason };
  FramesCaptured: { tyreId: string };
  Analysing: { tyreId: string };
  TyreResult: { inspectionId: string; tyreId: string };
  InspectionProgress: undefined;
  Report: { inspectionId: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
