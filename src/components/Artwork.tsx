import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { artworkColors as art, colors } from '../theme';

// Artwork copied from docs/design/source/*.dc.html. Decorative only.

/** Main.dc.html: large tyre behind the Welcome title. */
export function WelcomeTyreArt({ size = 430 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 430 430" fill="none">
      <Circle cx={215} cy={215} r={190} stroke={art.welcomeTyre} strokeWidth={58} />
      <Circle cx={215} cy={215} r={214} stroke={colors.darkLineStrong} strokeWidth={2} strokeDasharray="10 12" />
      <Circle cx={215} cy={215} r={150} stroke={colors.cameraBlue} strokeWidth={3} />
      <Circle cx={215} cy={215} r={112} stroke={colors.darkLineStrong} strokeWidth={10} />
      <Path d="M215 103V327M103 215H327M136 136L294 294M294 136L136 294" stroke={colors.darkLineStrong} strokeWidth={12} />
      <Circle cx={215} cy={215} r={34} fill={colors.navy} stroke={colors.cameraBlue} strokeWidth={3} />
    </Svg>
  );
}

/** Walkthrough1.dc.html: car silhouette (plate box is drawn as a View). */
export function WalkthroughCarArt({ width = 390 }: { width?: number }) {
  return (
    <Svg width={width} height={(width * 400) / 390} viewBox="0 0 390 400" fill="none">
      <Path d="M70 196l34-88c7-17 22-27 41-27h100c19 0 34 10 41 27l34 88c19 7 29 22 29 41v82H41v-82c0-19 10-34 29-41z" fill={colors.black} />
      <Path d="M102 188l24-65c5-12 15-20 28-20h82c13 0 23 8 28 20l24 65z" fill={colors.illustrationBlue} />
      <Path d="M58 224h60l17 21H58zM332 224h-60l-17 21h77z" fill={colors.cameraBlue} />
    </Svg>
  );
}

/** Walkthrough2.dc.html: tyre in guide ring. */
export function WalkthroughTyreArt({ size = 350 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 350 350" fill="none">
      <Circle cx={175} cy={175} r={170} stroke={colors.cameraBlue} strokeWidth={6} />
      <Circle cx={175} cy={175} r={130} stroke={colors.black} strokeWidth={54} />
      <Circle cx={175} cy={175} r={130} stroke={colors.darkLineStrong} strokeWidth={2} strokeDasharray="18 9" />
      <Circle cx={175} cy={175} r={100} fill={colors.white} />
      <Circle cx={175} cy={175} r={88} stroke={colors.black} strokeWidth={9} />
      <Path d="M175 87V263M87 175H263M113 113L237 237M237 113L113 237" stroke={colors.black} strokeWidth={10} />
      <Circle cx={175} cy={175} r={30} fill={colors.navy} stroke={colors.white} strokeWidth={5} />
    </Svg>
  );
}

/** PlateScan.dc.html / ChassisScan: car in the viewfinder before the camera starts. */
export function PlateCarArt({ size = 340 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 340 340" fill="none">
      <Path d="M60 170l28-72c6-14 18-22 34-22h96c16 0 28 8 34 22l28 72c16 6 24 18 24 34v60c0 8-6 14-14 14H50c-8 0-14-6-14-14v-60c0-16 8-28 24-34z" fill={colors.darkLine} />
      <Path d="M86 166l20-54c4-10 12-16 22-16h84c10 0 18 6 22 16l20 54z" fill={art.plateCarWindow} />
      <Path d="M50 196h52l14 18H50zM290 196h-52l-14 18h74z" fill={colors.darkMuted} />
    </Svg>
  );
}

/** PlateConfirm.dc.html. */
export function ConfirmCarArt({ size = 340 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 340 340" fill="none">
      <Path d="M60 170l28-72c6-14 18-22 34-22h96c16 0 28 8 34 22l28 72c16 6 24 18 24 34v60c0 8-6 14-14 14H50c-8 0-14-6-14-14v-60c0-16 8-28 24-34z" fill={art.confirmCarBody} />
      <Path d="M86 166l20-54c4-10 12-16 22-16h84c10 0 18 6 22 16l20 54z" fill={art.confirmCarWindow} />
      <Path d="M50 196h52l14 18H50zM290 196h-52l-14 18h74z" fill={colors.darkLineStrong} />
      <Rect x={40} y={218} width={260} height={62} rx={9} stroke={colors.cameraBlue} strokeWidth={3} />
    </Svg>
  );
}

/** Sidewall.dc.html: tyre and circular guide. */
export function SidewallGuideArt({ size = 320 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 320 320" fill="none">
      <Circle cx={160} cy={160} r={122} stroke={colors.darkLine} strokeWidth={46} />
      <Circle cx={160} cy={160} r={146} stroke={colors.cameraBlue} strokeWidth={4} />
      <Circle cx={160} cy={160} r={122} stroke={colors.darkMuted} strokeWidth={2} strokeDasharray="18 9" />
      <Circle cx={160} cy={160} r={96} stroke={colors.cameraBlue} strokeWidth={2} />
      <Circle cx={160} cy={160} r={78} stroke={colors.darkLineStrong} strokeWidth={7} />
      <Path d="M160 82V238M82 160H238M105 105L215 215M215 105L105 215" stroke={colors.darkLineStrong} strokeWidth={8} />
      <Circle cx={160} cy={160} r={22} fill={colors.black} stroke={colors.darkMuted} strokeWidth={3} />
      <Circle cx={160} cy={160} r={5} fill={colors.white} />
    </Svg>
  );
}

/** Guide ring only, drawn over a live camera preview. */
export function SidewallGuideRing({ size = 320 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 320 320" fill="none">
      <Circle cx={160} cy={160} r={146} stroke={colors.cameraBlue} strokeWidth={4} />
    </Svg>
  );
}

/** SidewallDone.dc.html. */
export function SidewallDoneArt({ size = 210 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 320 320" fill="none">
      <Circle cx={160} cy={160} r={122} stroke={colors.darkLine} strokeWidth={46} />
      <Circle cx={160} cy={160} r={146} stroke={colors.cameraBlue} strokeWidth={5} />
      <Circle cx={160} cy={160} r={78} stroke={colors.darkLineStrong} strokeWidth={7} />
      <Path d="M160 82V238M82 160H238M105 105L215 215M215 105L105 215" stroke={colors.darkLineStrong} strokeWidth={8} />
      <Circle cx={160} cy={160} r={36} fill={colors.navy} stroke={colors.cameraBlue} strokeWidth={4} />
      <Path d="M144 160l11 11 21-22" stroke={colors.white} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Tread.dc.html: tread pattern background. */
export function TreadPatternArt({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 358 470" preserveAspectRatio="xMidYMid slice" fill="none">
      <Path d="M0 40h358M0 150h358M0 320h358M0 430h358" stroke={colors.darkLine} strokeWidth={12} />
      <Path
        d="M0 94l40-54 40 54 40-54 40 54 40-54 40 54 40-54 40 54 40-54M0 205l40-55 40 55 40-55 40 55 40-55 40 55 40-55 40 55 40-55M0 375l40-55 40 55 40-55 40 55 40-55 40 55 40-55 40 55 40-55"
        stroke={art.treadPattern}
        strokeWidth={5}
      />
    </Svg>
  );
}

/** Tread.dc.html: direction arrows inside the tread guide. */
export function TreadArrowsArt({ width = 240 }: { width?: number }) {
  return (
    <Svg width={width} height={(width * 60) / 240} viewBox="0 0 240 60" fill="none">
      <Path
        d="M20 8l24 22-24 22M70 8l24 22-24 22M120 8l24 22-24 22M170 8l24 22-24 22"
        stroke={colors.cameraBlue}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Analysing.dc.html: progress ring. `progress` is 0..1. */
export function AnalysisRing({ progress }: { progress: number }) {
  const circumference = 2 * Math.PI * 56;
  const dash = Math.max(0, Math.min(1, progress)) * circumference;
  return (
    <Svg width={128} height={128} viewBox="0 0 128 128" fill="none">
      <Circle cx={64} cy={64} r={56} stroke={colors.border} strokeWidth={12} />
      <Circle
        cx={64}
        cy={64}
        r={56}
        stroke={colors.navy}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform="rotate(-90 64 64)"
      />
      <Circle cx={64} cy={64} r={28} fill={colors.black} />
      <Circle cx={64} cy={64} r={8} fill={colors.cameraBlue} />
    </Svg>
  );
}
