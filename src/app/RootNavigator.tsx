import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import type { RootStackParamList, TabParamList } from './routes';
import { TabBar } from './TabBar';
import { LeaveInspectionGuard } from './LeaveInspectionGuard';
import { WelcomeScreen } from '../screens/Welcome/WelcomeScreen';
import { WalkthroughScreen } from '../screens/Walkthrough/WalkthroughScreen';
import { CameraAccessScreen } from '../screens/CameraAccess/CameraAccessScreen';
import { HomeScreen } from '../screens/Home/HomeScreen';
import { HistoryScreen } from '../screens/History/HistoryScreen';
import { PlateScanScreen } from '../screens/PlateScan/PlateScanScreen';
import { PlateConfirmScreen } from '../screens/PlateConfirm/PlateConfirmScreen';
import { ChassisScanScreen } from '../screens/ChassisScan/ChassisScanScreen';
import { VehicleDetailsScreen } from '../screens/VehicleDetails/VehicleDetailsScreen';
import { SelectTyresScreen } from '../screens/SelectTyres/SelectTyresScreen';
import { SidewallCaptureScreen } from '../screens/SidewallCapture/SidewallCaptureScreen';
import { SidewallCapturedScreen } from '../screens/SidewallCaptured/SidewallCapturedScreen';
import { TreadCaptureScreen } from '../screens/TreadCapture/TreadCaptureScreen';
import { CaptureProblemScreen } from '../screens/CaptureProblem/CaptureProblemScreen';
import { FramesCapturedScreen } from '../screens/FramesCaptured/FramesCapturedScreen';
import { AnalysingScreen } from '../screens/Analysing/AnalysingScreen';
import { TyreResultScreen } from '../screens/TyreResult/TyreResultScreen';
import { InspectionProgressScreen } from '../screens/InspectionProgress/InspectionProgressScreen';
import { ReportScreen } from '../screens/Report/ReportScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const renderTabBar = (props: BottomTabBarProps) => <TabBar {...props} />;

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
    </Tab.Navigator>
  );
}

/** Camera flow screens are portrait only in the first release (spec §8). */
const cameraFlow = { orientation: 'portrait' } as const;

const guarded = ({ children }: { children: React.ReactElement }) => (
  <LeaveInspectionGuard>{children}</LeaveInspectionGuard>
);

/** White screens with dark status bar content. */
const lightScreen = { statusBarStyle: 'dark' } as const;

export function RootNavigator({
  initialRouteName,
}: {
  initialRouteName: keyof RootStackParamList;
}) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false, statusBarStyle: 'light' }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Walkthrough" component={WalkthroughScreen} />
      <Stack.Screen name="CameraAccess" component={CameraAccessScreen} options={lightScreen} />
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Group screenOptions={cameraFlow} screenLayout={guarded}>
        <Stack.Screen name="PlateScan" component={PlateScanScreen} />
        <Stack.Screen name="PlateConfirm" component={PlateConfirmScreen} />
        <Stack.Screen name="ChassisScan" component={ChassisScanScreen} />
        <Stack.Screen name="VehicleDetails" component={VehicleDetailsScreen} />
        <Stack.Screen name="SelectTyres" component={SelectTyresScreen} />
        <Stack.Screen name="SidewallCapture" component={SidewallCaptureScreen} />
        <Stack.Screen name="SidewallCaptured" component={SidewallCapturedScreen} />
        <Stack.Screen name="TreadCapture" component={TreadCaptureScreen} />
        <Stack.Screen name="CaptureProblem" component={CaptureProblemScreen} />
        <Stack.Screen name="FramesCaptured" component={FramesCapturedScreen} />
        <Stack.Screen name="Analysing" component={AnalysingScreen} options={lightScreen} />
      </Stack.Group>
      <Stack.Group screenLayout={guarded}>
        <Stack.Screen name="TyreResult" component={TyreResultScreen} />
        <Stack.Screen name="InspectionProgress" component={InspectionProgressScreen} />
      </Stack.Group>
      <Stack.Screen name="Report" component={ReportScreen} />
    </Stack.Navigator>
  );
}
