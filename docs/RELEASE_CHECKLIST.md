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

## Bundle ID
- [x] **Bundle ID / application ID** set to the final `com.velox.tyre.kit.bay` (iOS `PRODUCT_BUNDLE_IDENTIFIER`, Debug and Release; Android `applicationId`, `namespace` and Kotlin package).
- [ ] `com.velox.tyre.kit.bay` registered as an App ID in the Apple Developer account (Certificates, Identifiers & Profiles), and the app created in App Store Connect and Google Play Console with this ID.

## Placeholders to replace (kept for now by the owner)
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
- [ ] **Android release signing replaced with a real upload key.** Today `android/app/build.gradle` signs the `release` build type with `signingConfigs.debug`, i.e. the public React Native debug keystore (`android/app/debug.keystore`, password `android`). Before any Play upload:
  - [ ] Generate an upload keystore (`keytool -genkeypair -v -storetype PKCS12 -keystore upload-key.p12 -alias upload -keyalg RSA -keysize 2048 -validity 10000`) and store it and its passwords outside git (e.g. a password manager).
  - [ ] Add a `release` signing config that reads the keystore path and passwords from `~/.gradle/gradle.properties` or environment variables, never from tracked files.
  - [ ] Point the `release` build type at the new `release` signing config, not `signingConfigs.debug`.
  - [ ] Enrol in Play App Signing and register the upload key in Play Console.
  - [ ] Confirm the release APK/AAB is signed with the upload key: `apksigner verify --print-certs app-release.apk` must not show `CN=Android Debug`.
- [ ] iOS distribution signing set up in the Apple Developer account (team, distribution certificate, App Store provisioning profile for `com.velox.tyre.kit.bay`), outside git.
- [ ] No analytics, crash reporting or network calls added without owner approval.
- [ ] **ML Kit usage metrics decided (open)** (see DECISIONS.md, M4): accepted and disclosed, or blocked and OCR re-tested. Check with a network monitor that a release build makes no unexpected requests during a full inspection.
- [ ] **M5 tyre-capture checklist (`docs/DEVICE_TESTING.md`, section M5) passed on iPhone and Android.** M5 is "awaiting real-device testing".
- [ ] **Calibrate every `estimate` value in `src/config/capture.ts`** (currently `CALIBRATION_STATUS = 'uncalibrated'`) on real phones: tyre quality checks (brightness 55–215, sharpness 120, motion 6, tread novelty 5, thumbnail 16, sampling step 4, analysis region 0.5, guide margin 0.08, accept intervals 150/250 ms, extra candidates 4, settle 1000 ms, analysis 10 fps, free space 60 MB, JPEG 0.9) in bright sun, workshop light, low light, and on wet and muddy tyres; and OCR selection (read window 5, scan interval 350 ms, guide margin 0.08, chassis text ratio 0.18, plate 2–10 characters) on real plates and chassis plates. Then set `CALIBRATION_STATUS` to `'calibrated'`.
- [ ] **RELEASE BLOCKER: tyre detector integrated (M7) and tested on real phones.** Without it sidewall capture is manual, distance messages are off, and capture can't tell whether a tyre is in frame. Once it's in: sidewall auto-capture, `Move closer` / `Move back` / `Distance OK`, and the `distance` / `not_found` Capture problem reasons.
- [ ] **M4 real-device checklist (`docs/DEVICE_TESTING.md`) passed on iPhone and Android.** M4 is still "awaiting real-device testing": the owner deferred it to start M5. Required before release.
