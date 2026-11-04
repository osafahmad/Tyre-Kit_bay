# Release checklist

Everything in spec §11 plus project-specific items found while building. Every box must be ticked before a store release.

## From the spec (§11)
- [ ] Thresholds in `src/config/inspection.ts` confirmed by the owner.
- [ ] Real models bundled in `assets/models/` and every `src/ml/manifest.ts` value verified against the training output.
- [ ] Tread accuracy tested on a separate gauge-measured set.
- [ ] Demo analyzer unavailable in release builds (`createAnalyzer(false)` test passes; check a release build shows no `Demo data`).
- [ ] Automated-check notice present in Tyre result and the PDF.
- [ ] Minimum supported devices decided from real testing.
- [ ] Final logo, app icon and splash screen provided and in place.
- [ ] Privacy policy and store data disclosures completed.
- [ ] All dependency and model licences checked.
- [ ] Android release build and iOS archive succeed.

## Placeholders to replace (kept for now by the owner)
- [ ] **Bundle ID / application ID** `com.lineup.tyrekitbay` → final ID (iOS `PRODUCT_BUNDLE_IDENTIFIER` in the Xcode project; Android `applicationId` and `namespace` in `android/app/build.gradle`, plus the Kotlin package folder).
- [ ] **Display name** `Line Up` → final store name (`ios/LineUpTyreKitBay/Info.plist` `CFBundleDisplayName`; `android/app/src/main/res/values/strings.xml` `app_name`).
- [ ] **Launch screens** plain black → final splash (`ios/LineUpTyreKitBay/LaunchScreen.storyboard`; Android `windowBackground` in `styles.xml`).
- [ ] **App icon** is still the React Native template icon (iOS `AppIcon.appiconset`; Android `mipmap-*`).
- [ ] **Logo mark** in `src/components/LogoMark.tsx` is the design placeholder.

## Minimum versions (owner confirmed)
- [ ] iOS deployment target is 16.0 (`ios/Podfile`, and the app target in Xcode).
- [ ] Android `minSdkVersion` is 26 / Android 8.0 (`android/build.gradle`).

## Build configuration
- [ ] iOS pods installed **without** `LINEUP_IOS_SIM=1` (ML Kit OCR included). `ios/Podfile.lock` must list `RnMlkitOcr`.
- [ ] `src/config/dev.ts`: all switches resolve to off in release (`__DEV__` false).
- [ ] Merged release `AndroidManifest.xml` checked: no unexpected permissions (only `CAMERA`, plus anything a library adds that has been reviewed). `INTERNET` should not be requested by the app itself.
- [ ] Release signing set up outside git (Android upload keystore; iOS distribution certificate and profile).
- [ ] No analytics, crash reporting or network calls added without owner approval.
