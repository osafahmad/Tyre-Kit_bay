# Decisions

Choices made while building, and anything that differs from `TYRE_KIT_BAY_SPEC.md`. Newest last.

## M0 Setup

### Project
- No React Native app existed, only docs. Created a bare React Native CLI app (not Expo), as the spec's default and the owner chose.
- React Native 0.88.1, React 19.3.0, TypeScript strict (`@react-native/typescript-config` sets `strict: true`). New Architecture and Hermes are on by default.
- App lives at the workspace root. `CLAUDE.md` and `docs/` were moved up from `tyre-kit-bay-project-docs/`.
- Bundle ID / application ID: started as a template placeholder; replaced with the owner's final ID in the bundle ID change below.
- Display name: `Line Up` (spec's short brand label). **Placeholder, kept for now; on the release checklist.**

### Pinned libraries
All runtime dependencies are pinned to exact versions in `package.json`.

| Need | Package | Version | Notes |
|---|---|---|---|
| Navigation | `@react-navigation/native`, `native-stack`, `bottom-tabs` | 7.5.1 / 7.21.0 / 7.21.0 | |
| | `react-native-screens`, `react-native-safe-area-context` | 4.30.1 / 5.11.1 | |
| App state | `zustand` | 5.0.16 | |
| Camera | `react-native-vision-camera` | 5.2.4 | v5 output-based API |
| Frame processing | `react-native-vision-camera-worklets`, `react-native-worklets`, `react-native-nitro-modules`, `react-native-nitro-image` | 5.2.4 / 0.13.1 / 0.37.2 / 0.15.2 | `react-native-worklets` 0.13 supports RN 0.86–0.88 |
| Frame resizing | `react-native-vision-camera-resizer` | 5.2.4 | |
| TFLite | `react-native-fast-tflite` | 3.0.1 | |
| OCR | `rn-mlkit-ocr` | 0.3.1 | Latin only, bundled models |
| Simple storage | `react-native-mmkv` | 4.3.2 | |
| Inspection database | `@op-engineering/op-sqlite` | 19.0.4 | Spec left the SQLite package open. Chosen for New Architecture support. |
| Files | `@dr.pogodin/react-native-fs` | 2.41.0 | Spec left this open. Maintained fork of `react-native-fs` with New Architecture (TurboModule) support; the original `react-native-fs` 2.20 is unmaintained. |
| PDF | `react-native-html-to-pdf` | 1.3.0 | Has a TurboModule spec |
| Sharing | `react-native-share` | 12.3.1 | |
| Haptics | `react-native-haptic-feedback` | 3.0.0 | |
| Artwork | `react-native-svg` | 15.16.0 | |
| Icons | `lucide-react-native` | 1.68.0 | |
| Tests | Jest 29 (RN preset), `@testing-library/react-native` | 14.1.0 | |

Compatibility was checked by building both platforms, not only by peer ranges (most of these declare `react-native: *`).

### Native configuration
- iOS `NSCameraUsageDescription`: `Scan number plates, chassis numbers, and tyres.` The template's empty location usage string was removed (location isn't used).
- Android `CAMERA` permission. `INTERNET` moved from the main manifest to `src/debug/AndroidManifest.xml`, so only debug builds (Metro) request it. Some Google libraries may still merge `INTERNET` in; check the merged release manifest at M8.
- Metro: `tflite` added to `assetExts`.
- Babel: `react-native-worklets/plugin` added (needed for VisionCamera frame-processor worklets).
- iOS acceleration: `$EnableCoreMLDelegate = true` in the Podfile. The pod pulls in `TensorFlowLiteC/CoreML`.
- Android acceleration: optional `uses-native-library` entries for `libOpenCL.so`, `libOpenCL-pixel.so`, `libGLES_mali.so`, `libPVROCL.so`. NNAPI is not used.
- OCR: `ocrModels = ["latin"]`, `ocrUseBundled = true` (Android), `$ReactNativeOcrSubspecs = ['latin']` (iOS). Bundled models keep OCR offline.

### Minimum OS versions (owner confirmed)
- **iOS 16.0.** React Native's default is 15.1, but Google ML Kit 9 (used by `rn-mlkit-ocr`) needs 15.5+. The Podfile also raises any pod that declares an older target to 16.0, because Xcode 27 rejects targets below 15.
- **Android minSdk 26 (Android 8.0).** The template default is 24; `react-native-vision-camera-resizer` requires 26.

### iOS simulator and ML Kit
Google ML Kit's iOS frameworks have no arm64 simulator slice, and this Mac has no Rosetta, so ML Kit can't link into an iOS simulator build. For simulator-only work run:

```sh
cd ios && LINEUP_IOS_SIM=1 pod install
```

`react-native.config.js` then leaves `rn-mlkit-ocr` out on iOS, and the app treats OCR as unavailable (manual entry), a state the spec already requires. **Before building for a real iPhone or release, run plain `pod install`.** Android and real iPhones are not affected.

### Xcode
Xcode 27 needed the Metal toolchain component (`xcodebuild -downloadComponent MetalToolchain`) to compile a shader in the camera libraries.

## M1 Foundation

- Inter 4.1 (OFL, from the official rsms/inter release) bundled in 400/500/600/700 and linked with `npx react-native-asset@2.3.0`. Fonts are referenced by PostScript name (`Inter-Regular`, `Inter-Medium`, `Inter-SemiBold`, `Inter-Bold`) so the same name works on iOS and Android; don't combine them with `fontWeight`. The licence ships with the app (`assets/fonts/Inter-LICENSE.txt`).
- Spec type rows with ranges ("26 to 28", "15 to 16") are split into the exact sizes the design sources use (`headerTitle` 28/34, `headerTitleSmall` 26/32, `body` 16/25, `bodySmall` 15/22).
- Large titles cap font scaling (`maxFontSizeMultiplier` 1.2–1.4) so Dynamic Type can't clip them; body text scales up to 2×.
- A few greys appear only inside the design's SVG artwork (`#24272D`, `#111317`, `#1E2126`, `#0F1114`, `#30343B`). They live in `artworkColors` and are used only by artwork components, never for UI.
- Status bar style is set per screen through react-native-screens (`statusBarStyle`), because iOS uses view-controller-based status bar appearance.
- Jest: lucide is mapped to its CommonJS build (transforming its ESM icons took ~60 s per run). MMKV and haptics are mocked in `jest.setup.js`.

## M2 Static UI

- **Walkthrough 1–3 are one route** (`Walkthrough`) with a horizontal pager, so swipe and buttons both work. Back on page 1 returns to Welcome.
- **Analyzer brought forward from M6.** `TyreAnalyzer`, `DemoTyreAnalyzer`, a stub `TfliteTyreAnalyzer`, and an empty `manifest.ts` were added in M2 so Analysing, Tyre result, Progress and Report could be built against real data flow. Safety rule already enforced: release builds get only the TFLite analyzer, which fails clearly while models are missing; the demo analyzer refuses to load outside development. Every screen showing demo output shows `Demo data`. M6 still owns report rules, PDF and sharing.
- **Demo analyzer values.** Tread depth cycles through 6.2 / 3.4 / 5.8 / 1.6 mm and wear pattern is `Even`; these are labelled demo data. Size, DOT/TIN, make and model come only from what the user confirmed on Sidewall captured; nothing is invented, and empty fields stay `Not read`.
- **Development capture simulation.** Until real capture (M5), and on simulators with no camera, dev builds fake frames (`demo://…` paths) so the flow can be walked. Screens show `Demo data` while this is active. Off in release (`src/config/dev.ts`).
- **Dev demo inspections.** Dev builds seed three labelled sample inspections (matching the design) when the store is empty, so Home, History and Report can be checked. Off in release.
- **Data model addition.** `TyreInspection.sidewallDetails` (size, DOT/TIN, make, model) holds what OCR read plus the user's corrections, so they survive a restart. The spec's model had nowhere to keep them before analysis.
- **Capture problem icon colour.** The design uses amber (`#FBF0D5`/`#7A5408`) for the warning icon box, but CLAUDE.md reserves amber for tyre status. The icon box is navy with a camera-blue border. **Owner confirmed: keep navy.**
- **Select tyres, 2-tyre layout.** Front and Rear each take the full row width instead of half of a two-column grid.
- **Home with an unfinished inspection.** The card shows `Continue inspection` and a `Start new scan` text button. Starting new asks first and says the unfinished inspection will be permanently deleted (`Cancel` / `Delete permanently`). **Owner confirmed.**
- **Tyre result opened from a saved report** hides `Next tyre` / `Scan this tyre again`, which only make sense during an inspection.
- **Report summary** adds a line for tyres that weren't scanned (`1 tyre wasn't scanned.`) so they're shown clearly. With nothing analysed it reads `No tyres were analysed`.
- **Vehicle details placeholders** read `e.g. ABC-1234` in a lighter grey, so an example is never mistaken for a scanned value.
- **Launch screens** are plain black (`#0A0A0A`) until the final splash screen is provided.
- Plate and chassis scan screens show the guide box over the design's car artwork; the design's sample plate text inside the guide isn't drawn, since it would look like a real read.

## M3 Inspection state

- **Storage.** One SQLite table (`inspections`: id, created_at, completed_at, data JSON) via op-sqlite; tyres are stored inside the inspection's JSON. Simple settings (`hasSeenWalkthrough`, the unfinished inspection's id) are in MMKV. Every store change is written, in order, so a closed app resumes where it stopped.
- **Storage failure** shows `Saved inspections couldn't be opened` with `Try again`, instead of running without saving.
- **Resume** rebuilds the stack as Home → (Inspection progress, once any tyre is done or skipped) → the exact step the next tyre was on (sidewall, tread, frames captured, or analysing). With no tyres chosen yet it reopens Vehicle details.
- **Leave this inspection?** applies when Back (button, Android back, iOS swipe) would leave the inspection flow for Home. Choices: `Keep scanning` / `Save and leave`. Resets such as `Done` and `View report` don't ask.
- **Dev sample inspections are off by default now** (`devConfig.seedDemoInspections = false`) so the real empty state and real saved data show. Turn it on locally to check list layouts.
- Walkthrough pages that aren't visible are hidden from screen readers.

### Known gaps for later milestones
- Frame files: abandoned-frame cleanup and "keep only the best frames" belong to M5, when real frames exist. Today's frames are `demo://` placeholders.
- The dev tread simulation keeps counting while the Leave dialog is open. Real capture (M5) must pause while a dialog is up.
- ~~`Start scan` doesn't check camera permission yet~~ Done in M4.

## M4 Vehicle scan — awaiting real-device testing

**Status: awaiting real-device testing, not finished.** Built and unit/screen tested; the live camera and OCR have not run on a phone yet (the Android emulator's virtual camera failed to start and the iOS simulator has no camera).

- **Permission flow.** `Start scan` opens Camera access first when the permission hasn't been asked (`Allow camera` → system prompt; either answer, or `Not now`, continues to Scan number plate). On the scan screens the viewfinder shows `Allow camera access` / `Allow camera` while the system can still ask, and `Camera access is off` / `Turn it on in Settings to scan tyres.` / `Open Settings` once it can't. Access is re-checked when the app comes back from Settings. First-launch Camera access still goes Home after either answer.
- **Android "permanently denied".** Android allows one more prompt after the first denial and then stops showing it silently. The app treats a denial as permanent once it has asked in the current session. After an app restart, the first `Allow camera` tap on a permanently denied Android phone shows no prompt, then the screen switches to `Open Settings`. Verified on the emulator: deny → `Allow camera` again → deny → `Camera access is off`; grant from Settings → access refreshed on return.
- **Camera states.** No back camera → `No camera found`; start error → `The camera stopped` with `Try again`; system interruption → `Camera paused`. Capture is disabled while the camera can't run. `Type it` and `Skip` always work.
- **How OCR runs (VisionCamera v5 only).** A `useFrameOutput` frame processor worklet, at most one frame at a time: `HybridFrameConverter.convertFrameToImage` → rotate upright from `frame.orientation` → crop to the guide box (mapped through the `cover` preview, plus 8% margin) → hand the crop to JS. Every frame is `dispose()`d in a `finally`, and every intermediate image is disposed. On JS the crop is written to a temporary JPEG, read by ML Kit (Latin, bundled), then the file is deleted. Passes are spaced at least 350 ms apart.
- **Library choice.** `rn-mlkit-ocr` only accepts an image file, so frames go through a temporary file rather than a frame-processor plugin. Nothing leaves the phone.
- **Stable read.** The same value read 3 times within the last 5 reads (plates compared ignoring spaces and hyphens) → success haptic → Confirm plate, or for chassis → Vehicle details with the number filled in. `Capture` uses the next single read; if nothing readable is found it says so and stays.
- **No guessing.** Plate text is only uppercased and stripped of characters other than letters, digits, spaces and hyphens; the tallest line in the guide with 2–10 letters/digits is used. Chassis text is the longest run of words on one line making 5–17 letters/digits with at least one digit; a leading `VIN`/`CHASSIS`/`NO` label is dropped. Letters and digits are never swapped (O/0, I/1, B/8), nothing is padded to 17, and no format is enforced. Anything not read stays empty.
- **Move closer.** Shown when chassis-like text is shorter than 18% of the guide crop's height; such reads are not accepted.
- **OCR unavailable** (iOS simulator builds made with `LINEUP_IOS_SIM=1`, or the module missing): the hint says `Text reading isn't available. Type it instead.` After 3 OCR failures in a row: `Text can't be read right now. Use Capture, or type it.`
- **Tunables** in `src/config/ocr.ts` (stable reads, window, interval, margins, size ratio). Starting values; calibrate on real plates and chassis plates.
- **iOS app target deployment** set to 16.0 in the Xcode project (it was still the template's 15.1; the Podfile was already 16.0).
- Home's unfinished-inspection card reads `Tyres not chosen yet` before tyres are selected (was `0 of ? tyres scanned`).

### Needs owner attention: ML Kit usage metrics
Google ML Kit (via `rn-mlkit-ocr`) pulls in Google's data transport libraries (`GoogleDataTransport` on iOS, `com.google.android.datatransport` on Android), which ML Kit uses to send API usage metrics to Google. Images and recognised text are processed on the phone, but this is still a network call the spec doesn't allow without approval. Options: (a) accept and disclose it in the store privacy answers, (b) block it (e.g. strip the transport backend or remove `INTERNET` from release), testing that OCR still works, or (c) replace ML Kit with Apple Vision on iOS plus an alternative on Android. Added to the release checklist. Not changed yet.

### Android release permissions (checked in the merged release manifest)
- Kept: `CAMERA`; `VIBRATE` (haptics); `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (AndroidX internal, app-private).
- Removed with `tools:node="remove"` because the app doesn't use them: `READ_PHONE_STATE` (implied by the TFLite GPU library's old targetSdk), `WRITE_EXTERNAL_STORAGE` (react-native-fs), `READ_EXTERNAL_STORAGE` (react-native-vision-camera-resizer). All files are in app-private storage.
- **Still present, owner decision:** `INTERNET` and `ACCESS_NETWORK_STATE`, added by ML Kit's `com.google.android.datatransport` (usage metrics, see above). `ACCESS_NETWORK_STATE` is also requested by `androidx.media3` (a VisionCamera dependency).

## Bundle ID (owner decision)

- **Final Android `applicationId` and iOS bundle identifier: `com.velox.tyre.kit.bay`.** Replaces the placeholder everywhere: Android `namespace` and `applicationId` (`android/app/build.gradle`), Gradle `rootProject.name` (`android/settings.gradle`), Kotlin `package` declarations and folder (`android/app/src/main/java/com/velox/tyre/kit/bay/`), and both iOS build configurations' `PRODUCT_BUNDLE_IDENTIFIER` (Debug and Release, `ios/LineUpTyreKitBay.xcodeproj/project.pbxproj`).
- Internal project names are unchanged: Xcode project/target/scheme `LineUpTyreKitBay`, iOS folder `ios/LineUpTyreKitBay/`, and the JS app registry name `LineUpTyreKitBay` (`app.json`). They aren't the bundle ID and renaming them adds risk for no user-visible change.
- Installing over an older test build: the new ID is a different app to both platforms. Old test installs under the earlier placeholder ID keep their own data and should be deleted by hand.

## ML Kit usage metrics — still open

Unchanged after the bundle ID change: ML Kit setup not modified, decision still with the owner (see M4 above).
