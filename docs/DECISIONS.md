# Decisions

Choices made while building, and anything that differs from `TYRE_KIT_BAY_SPEC.md`. Newest last.

## M0 Setup

### Project
- No React Native app existed, only docs. Created a bare React Native CLI app (not Expo), as the spec's default and the owner chose.
- React Native 0.88.1, React 19.3.0, TypeScript strict (`@react-native/typescript-config` sets `strict: true`). New Architecture and Hermes are on by default.
- App lives at the workspace root. `CLAUDE.md` and `docs/` were moved up from `tyre-kit-bay-project-docs/`.
- Bundle ID / application ID: started as a template placeholder; replaced with the owner's final ID in the bundle ID change below.
- Display name: `Tyre Kit Bay` (see the app rename below).

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
cd ios && TYREKITBAY_IOS_SIM=1 pod install
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

## M4 Vehicle scan — verified on real devices

**Status: done.** Verified on a real iPhone and a real Android phone (Redmi 13), including the Android MediaTek camera driver fix (YUV frame format, torch timing guard) and the 180° rotation correction. Originally built and tested before any phone was available (the Android emulator's virtual camera failed to start and the iOS simulator has no camera).

- **Permission flow.** `Start scan` opens Camera access first when the permission hasn't been asked (`Allow camera` → system prompt; either answer, or `Not now`, continues to Scan number plate). On the scan screens the viewfinder shows `Allow camera access` / `Allow camera` while the system can still ask, and `Camera access is off` / `Turn it on in Settings to scan tyres.` / `Open Settings` once it can't. Access is re-checked when the app comes back from Settings. First-launch Camera access still goes Home after either answer.
- **Android "permanently denied".** Android allows one more prompt after the first denial and then stops showing it silently. The app treats a denial as permanent once it has asked in the current session. After an app restart, the first `Allow camera` tap on a permanently denied Android phone shows no prompt, then the screen switches to `Open Settings`. Verified on the emulator: deny → `Allow camera` again → deny → `Camera access is off`; grant from Settings → access refreshed on return.
- **Camera states.** No back camera → `No camera found`; start error → `The camera stopped` with `Try again`; system interruption → `Camera paused`. Capture is disabled while the camera can't run. `Type it` and `Skip` always work.
- **How OCR runs (VisionCamera v5 only).** A `useFrameOutput` frame processor worklet, at most one frame at a time: `HybridFrameConverter.convertFrameToImage` → rotate upright from `frame.orientation` → crop (**superseded**: the extra rotation was a bug, see "Plate OCR real-device fix" below) to the guide box (mapped through the `cover` preview, plus 8% margin) → hand the crop to JS. Every frame is `dispose()`d in a `finally`, and every intermediate image is disposed. On JS the crop is written to a temporary JPEG, read by ML Kit (Latin, bundled), then the file is deleted. Passes are spaced at least 350 ms apart.
- **Library choice.** `rn-mlkit-ocr` only accepts an image file, so frames go through a temporary file rather than a frame-processor plugin. Nothing leaves the phone.
- **Stable read.** The same value read 3 times within the last 5 reads (plates compared ignoring spaces and hyphens) → success haptic → Confirm plate, or for chassis → Vehicle details with the number filled in. `Capture` uses the next single read; if nothing readable is found it says so and stays.
- **No guessing.** Plate text is only uppercased and stripped of characters other than letters, digits, spaces and hyphens; the tallest line in the guide with 2–10 letters/digits is used. Chassis text is the longest run of words on one line making 5–17 letters/digits with at least one digit (**superseded** by "Chassis OCR validator" below); a leading `VIN`/`CHASSIS`/`NO` label is dropped. Letters and digits are never swapped (O/0, I/1, B/8), nothing is padded to 17, and no format is enforced. Anything not read stays empty.
- **Move closer.** Shown when chassis-like text is shorter than 18% of the guide crop's height; such reads are not accepted.
- **OCR unavailable** (iOS simulator builds made with `TYREKITBAY_IOS_SIM=1`, or the module missing): the hint says `Text reading isn't available. Type it instead.` After 3 OCR failures in a row: `Text can't be read right now. Use Capture, or type it.`
- **Tunables** were in `src/config/ocr.ts`; since M5 they're in `src/config/capture.ts` (`ocrConfig`) with every other estimated value. Uncalibrated.
- **iOS app target deployment** set to 16.0 in the Xcode project (it was still the template's 15.1; the Podfile was already 16.0).
- Home's unfinished-inspection card reads `Tyres not chosen yet` before tyres are selected (was `0 of ? tyres scanned`).

### Needs owner attention: ML Kit usage metrics
Google ML Kit (via `rn-mlkit-ocr`) pulls in Google's data transport libraries (`GoogleDataTransport` on iOS, `com.google.android.datatransport` on Android), which ML Kit uses to send API usage metrics to Google. Images and recognised text are processed on the phone, but this is still a network call the spec doesn't allow without approval. Options: (a) accept and disclose it in the store privacy answers, (b) block it (e.g. strip the transport backend or remove `INTERNET` from release), testing that OCR still works, or (c) replace ML Kit with Apple Vision on iOS plus an alternative on Android. Added to the release checklist. Not changed yet.

### Android release permissions (checked in the merged release manifest)
- Kept: `CAMERA`; `VIBRATE` (haptics); `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (AndroidX internal, app-private).
- Removed with `tools:node="remove"` because the app doesn't use them: `READ_PHONE_STATE` (implied by the TFLite GPU library's old targetSdk), `WRITE_EXTERNAL_STORAGE` (react-native-fs), `READ_EXTERNAL_STORAGE` (react-native-vision-camera-resizer). All files are in app-private storage.
- **Still present, owner decision:** `INTERNET` and `ACCESS_NETWORK_STATE`, added by ML Kit's `com.google.android.datatransport` (usage metrics, see above). `ACCESS_NETWORK_STATE` is also requested by `androidx.media3` (a VisionCamera dependency).

## Bundle ID (owner decision)

- **Final Android `applicationId` and iOS bundle identifier: `com.velox.tyre.kit.bay`.** Replaces the placeholder everywhere: Android `namespace` and `applicationId` (`android/app/build.gradle`), Gradle `rootProject.name` (`android/settings.gradle`), Kotlin `package` declarations and folder (`android/app/src/main/java/com/velox/tyre/kit/bay/`), and both iOS build configurations' `PRODUCT_BUNDLE_IDENTIFIER` (Debug and Release, `ios/TyreKitBay.xcodeproj/project.pbxproj`).
- Internal project names are separate from the bundle ID; they were renamed to `TyreKitBay` later (see the app rename below).
- Installing over an older test build: the new ID is a different app to both platforms. Old test installs under the earlier placeholder ID keep their own data and should be deleted by hand.

## ML Kit usage metrics — still open

Unchanged after the bundle ID change: ML Kit setup not modified, decision still with the owner (see M4 above).

## M4 real-device testing deferred (owner decision)

- The owner deferred M4 real-device testing and started M5. **Resolved:** M4 has since been verified on a real iPhone and Android (Redmi 13); see `docs/DEVICE_TESTING.md`.
- M5 reused M4 camera code that hadn't run on a phone yet; that code has now been verified on both platforms.

## M5 Tyre capture — verified on real devices

**Status: done.** Guide box alignment, live feedback and upright frame capture verified on a real iPhone and Android.

Built first with unit and screen tests only (including frame-disposal tests that drive the real frame worklet with fake frames), because no emulator or simulator here has a working camera. The live camera path was later verified on phones (status above).

### What's built
- **Quality checks on every analysed frame** (about 10 per second, VisionCamera v5 frame output in YUV, worklet on the camera thread): brightness (mean luminance of the centre region), blur (Laplacian variance on a sampled grid), steadiness (difference between consecutive 16×16 thumbnails). **All estimated values are in one file, `src/config/capture.ts`, marked `CALIBRATION_STATUS = 'uncalibrated'`**, each tagged `spec` or `estimate`. No model values are there or anywhere else.
- **Disposal.** Every frame is disposed in a `finally`, its planes right after reading, and every intermediate image (converted, rotated, cropped) as soon as it's replaced or saved, including on errors.
- **Sidewall.** Frames that are bright enough, sharp and steady are saved after **Capture** is pressed. It keeps the sharpest `sidewallTargetFrames` (8) of up to 12 candidates, or finishes 1 s after reaching 8. At the 20 s timeout it keeps what it has if that's at least `sidewallMinFrames` (5); otherwise it opens Capture problem.
- **Tread.** Frames are accepted while the sweep moves: each must pass light and sharpness checks and differ from the last accepted frame. Progress = accepted / `treadTargetFrames` (10); finishes at 10; `Finish sweep` from 5 (otherwise `Keep going. A few more clear frames are needed.`); `Having trouble` and the 20 s timeout open Capture problem. Per spec, the timeout opens Capture problem even with 5–9 frames (the user can press Finish sweep before then).
- **Timeout counts active time only:** camera live, screen focused, app in front, no dialog open, storage OK.
- **Real reason on Capture problem** = the most common rejection: too dark → `dark`, overexposed → `glare` (**Too much glare**), blurred → `blur`, moving → `unsteady` (**Hold the phone steady**). With no single cause (standing still on the tread, no usable frames) → `too_few_frames` (**Not enough clear frames**, tips per stage). **`The tyre wasn't detected` is only used once a real detector reports it** (owner decision 3). The dark title says "sidewall" on the sidewall stage (**owner accepted**).
- **Retry is always one tap:** Capture problem → `Scan sidewall again` / `Scan tread again` (or `Skip this tyre`); camera error → `Try again`; permission off → `Allow camera` or `Open Settings`; low storage or a failed save → `Try again`; Sidewall captured → `Scan sidewall again`; Frames captured → `Scan tread again`.
- **Frame storage.** Accepted frames are cropped to the guide (plus 8% margin) and written as JPEG (quality 0.9 — **bug**, nitro-image's scale is 0–100; now 90, see "Plate OCR real-device fix") to a temp folder in caches, then the kept ones are moved to `Documents/frames/<inspection>/<tyre>/<stage>_<time>_<n>.jpg`. Inspections store paths **relative** to Documents (the iOS container path changes across updates). Discarded candidates are deleted right away.
- **Deleting abandoned frames:** a new capture of a stage replaces that stage's frames; `Scan this tyre again` and `Skip this tyre` delete the tyre's folder; deleting an unfinished inspection deletes its folder; at startup, leftover temp frames and folders of deleted inspections are removed.
- **Resume.** Frame paths and the tyre's step are saved as soon as a stage finishes. At startup, saved inspections are checked against the files on disk; a tyre whose frames are missing goes back to the step that needs them. After the sidewall, resume now opens **Sidewall captured** (to review the details) instead of jumping to the tread. A capture interrupted mid-stage restarts that stage.
- **Low storage (spec §8):** checked before capturing (60 MB free) and on write errors; shows `There isn't enough storage to save these frames. Free up some space and try again.` with `Try again`. Other write failures show `The frames couldn't be saved. Try again.`
- **Camera problems** reuse the M4 camera component (renamed `CaptureCamera`): permission off, no camera, start error, interruption. **No flash** shows a disabled `No flash` control.
- **Dialogs pause capture.** `Leave this inspection?` sets a flag that stops frames being accepted and the timeout running (the M3 gap).
- **No models during capture.** Tread and damage models only run after capture (M6/M7); nothing here calls TFLite or the network.
- **Flash on Tread capture.** The tread design has no flash control, but the spec's dark tips say "Turn on the flash", so a compact flash toggle sits in the progress row. **Owner accepted.**
- **Development builds without a camera** (simulators, Jest) still use the labelled `Demo data` simulation. With a camera, development builds use the real capture. In release builds (`__DEV__` false) the simulation, demo seeding and demo analyzer are all unreachable (`releaseGuards.test.ts`).

### Tyre detector not available yet (spec says "run the tyre detector during preview") — owner accepted for now, release blocker
The detector model is an owner input (M7); `src/ml/manifest.ts` is empty, and nothing is guessed. Until it exists:
- Sidewall capture starts from the **Capture** button instead of automatically.
- `Move closer`, `Move back` and `Distance OK` are **not shown**: claiming a distance that wasn't measured would be wrong. The tread pill no longer shows the design's fixed `Distance OK`.
- Capture can't tell whether a tyre is in the frame at all: a sharp, well-lit wall would pass. The user is relied on to frame the tyre.
- `isTyreDetectorAvailable()` (`src/ml/tyreDetector.ts`) is the switch for M7.

### Added status messages (owner decision 2)
Kept: `Too bright` (overexposed), `Keep moving` (tread: frame too like the last one), `Ready to capture` (sidewall: checks pass, waiting for Capture). The tread "checks pass" message is **`Image is clear`** (was `Looks good`, renamed so it can't be read as tyre condition). Also on screen during sidewall capture: `N of 8 frames`.

### Risks: M4 camera code reused without real-device proof
- **Frame orientation → upright rotation** (`uprightRotation`): assumed `right` = rotate −90°. If wrong, saved frames are sideways and crops miss the guide.
- **Guide → image mapping** (`guideToImageRect`): assumes the preview fills the viewfinder with `cover` and shows the same field of view as the frame output. If not, crops are offset; the 8% margin absorbs small errors.
- **`HybridFrameConverter.convertFrameToImage`** and passing the image to the JS thread: unproven on phones. If slow, fewer frames are accepted per second.
- **`CaptureCamera`** (permission, errors, interruptions): from M4, untested on a phone.

### Other M5 risks to check on a phone
- **Luminance plane access:** reading plane 0 of a YUV frame with `getPixelBuffer()` copies it; cost at about 10 fps on a low-end Android phone is unknown.
- **Thresholds** (brightness 55–215, sharpness 120, motion 6, novelty 5) are guesses until calibrated; too strict means timeouts, too loose means blurry frames saved.
- **Sharpness scale** depends on the frame resolution (720p) and the sampling step (4 px).
- **Heat and battery** over a four-tyre inspection: not measured.
- **Capture problem reasons added beyond the spec table:** `glare`, `unsteady`, `too_few_frames` (see above).

## App rename to Tyre Kit Bay (owner decision)

- The earlier name was taken from the project folder by mistake. **The app is "Tyre Kit Bay"** in user-facing text and **`TyreKitBay`** in code identifiers. The bundle ID `com.velox.tyre.kit.bay`, the GitHub repo and remote, and git history are unchanged.
- **User-facing:** iOS `CFBundleDisplayName` and Android `app_name` are `Tyre Kit Bay`; `app.json` `displayName`; the logo label in `LogoMark` (Welcome and Home headers). There's no report, PDF or share text yet (M6).
- **Code identifiers:** JS app registry name (`app.json` `name`, `MainActivity.getMainComponentName`, `SceneDelegate` `withModuleName`) = `TyreKitBay`; Xcode project, target, scheme, workspace and app folder = `TyreKitBay` (`ios/TyreKitBay.xcodeproj`, `ios/TyreKitBay.xcworkspace`, `ios/TyreKitBay/`); Podfile target `TyreKitBay` (CocoaPods files `Pods-TyreKitBay*` regenerated); Gradle `rootProject.name = 'TyreKitBay'`; npm package name `tyre-kit-bay`; simulator flag `TYREKITBAY_IOS_SIM`.
- **Docs:** CLAUDE.md, the spec title and name line, START_PROMPT, README and these docs. The hardcoded project path in DEVICE_TESTING.md was replaced by a generic "project folder" instruction, so it survives the root folder rename.
- **Not changed (design files):** `docs/design/source/Main.dc.html` and `Home.dc.html`, and their renders `docs/design/screens/01-welcome.png` and `06-home.png`, still show the old logo label. Design files are reference material and aren't edited.
- **Welcome shows the name twice** now: the logo label and the `Tyre Kit Bay` title (the design had a different short label above the title). The final logo is still an owner input.
- **Local Xcode signing:** Xcode stores the signing team in the project file, which was renamed. Reselect the team on the `TyreKitBay` target; don't commit it.

## Plate OCR real-device fix

A clear plate gave "Couldn't read the plate" on an iPhone (Release). Panel data with the phone upright: frame 1920×1080 `left` → converted 1080×1920 → `rotate(90)` → 1920×1080, sideways crop, empty OCR text. Sideways phone: `up`, no rotation, OCR read `PTIUI4t`, shown as "Plate found: PTLUI4T" for the plate ABH514.

### Causes (from the library sources)
- **Double rotation.** VisionCamera v5's `convertFrameToImage` already applies `frame.orientation`: on iOS it sets the UIImage orientation flag (so `width`/`height` are already upright), and on Android it physically rotates and mirrors the Bitmap (`Matrix.postRotate`). The app then rotated again by the orientation. nitro-image's default `rotate()` on iOS redraws honouring the flag, so the result was turned twice.
- **Frames followed the phone, not the screen.** `<Camera>` defaults to `orientationSource="device"`. The iPhone UI is locked to portrait, so with the phone sideways the frames were landscape-upright while the preview and guide stayed portrait. The crop no longer matched the guide.
- **JPEG quality 0.9 on a 0–100 scale** (nitro-image divides by 100 on iOS and passes it to `Bitmap.compress` as an int on Android, which makes it 0). Crops were saved at about 1 % quality. This also affected chassis OCR and saved tyre frames.
- **Crop and save on iOS ignore the orientation flag.** nitro-image's `crop` uses `cgImage.cropping(to:)` on the raw pixels, and `jpegData` stores the flag as an EXIF tag instead of rotating pixels. So the flag must be baked into the pixels before cropping.

### Fix (JS only, no native change)
- `CaptureCamera` sets `orientationSource="interface"`: frames follow the screen, like the preview (the iOS preview always follows the interface orientation) and the guide drawn on it.
- `uprightPlan()` (pure, `guideGeometry.ts`) decides: never rotate by the orientation again; on iOS, when the orientation isn't `up` (or the frame is mirrored), bake the flag once with `rotate(0, false)`. (**Superseded** by the 180° fix below.) That redraws through `UIGraphicsImageRenderer` at scale 1, so the pixels are upright with orientation `.up` and the saved JPEG doesn't depend on an EXIF tag. Android uses the converter's Bitmap as is.
- `cropFrameToGuide()` (`frameCrop.ts`) is shared by OCR and tyre capture: convert → upright → crop. It disposes the converted and baked images on every path, errors included. The caller owns and disposes the result.
- JPEG quality is `JPEG_QUALITY_PERCENT = 90` (`config/capture.ts`), named as a percent and checked by a unit test, for plate OCR, chassis OCR and saved tyre frames.

### Capture presses always end visibly
- A Capture press is answered by the next pass. It's also answered if the camera-thread conversion or crop fails, the guide isn't laid out, or the crop rect is null. If no frame answers within `manualCaptureTimeoutMs` (3 s, estimate), a timeout answers it.
- Native OCR errors and "no text found" are separate in code (`ScanResult.failure`: `ocr` or `capture`; nothing read means no failure and no lines) and have separate messages:
  - `ocr`: `Text reading failed. Try again, or type it.`
  - `capture` (no usable camera image, or saving the crop failed): `Couldn't get an image from the camera. Try again, or type it.`
  - Nothing plate-shaped read: unchanged `Couldn't read the plate. Try again, or type it.` (chassis: unchanged messages).
  - These two new strings aren't in the spec.

### Plate reading rules (owner decision)
- No word filter: `PUNJAB`, `ET&NC` and similar aren't removed by name.
- A two-line plate is joined into one value with one space (`BKE 2090`), kept as written (`LEA-12 8197`).
- Lines are joined only when they are stacked, overlap horizontally and have similar text height. Small text above or below the main number is not joined. Thresholds (all estimates, `ocrConfig`): shorter line ≥ 0.7 of the taller line's height; horizontal overlap ≥ 0.5 of the narrower line; gap ≤ 1.0 × the taller line's height; vertical overlap ≤ 0.3 of the shorter line. At most two lines are joined.
- An OCR candidate must start with a letter, contain digits and end with a digit (and still have 2–10 letters/digits). Otherwise there's no result: a Capture press shows `Couldn't read the plate. Try again, or type it.`, and it is never shown as "Plate found". Of the candidates that pass, the tallest is used.
- This check is OCR-only. Typed plates are unchanged (letters, numbers, spaces, hyphens; no format).
- This replaces the M4 behaviour where values like `BOSS` or `12 345` were accepted from OCR.

### Plate guide size (uncalibrated)
- The plate guide is 260 × **150** pt (`ocrConfig.plateGuideWidth/plateGuideHeight`), up from the design's 260 × 86, so a two-line bike plate fits. Only the height changed; the chassis guide is unchanged.
- **Differs from the design**: `PlateScan.dc.html` and `08-scan-number-plate.png` show 260 × 86. The design files aren't edited.
- The size is uncalibrated: check on a phone with real car and bike plates.

### Needs a real phone
- iOS: the baked image is upright (not upside down or mirrored) in portrait. With the phone sideways or upside down, frames still match the portrait UI.
- ~~Android: the direction of VisionCamera's `Matrix.postRotate` is assumed correct.~~ Superseded by the 180° fix below, now verified on a Redmi 13. The Android activity isn't locked to portrait, so the UI (and with `interface`, the frames) can rotate; check that the guide still matches after rotation.
- `rotate(0, false)` cost on a full 1920×1080 frame per OCR pass and per accepted tyre frame.
- Join thresholds and guide height with real two-line plates.

## 180° orientation fix (second device test)

After the fix above: phone upright, plate and chassis OCR read nothing; phone upside down, both read correctly. So the OCR image was rotated 180° from the preview, not mirrored.

### Root cause (react-native-vision-camera 5.2.4 source)
- `frame.orientation` is right. VisionCamera documents `'left'` as pixel data rotated −90°, so the scene's top is on the buffer's left and it needs 90° clockwise to be upright. On iPhone the frame connection keeps AVFoundation's default `landscapeRight`, which `AV+CameraOrientation` maps to `.left` (device panel: `left`).
- **iOS:** `CameraOrientation.toUIImageOrientation` maps `.left → UIImage.Orientation.left`. UIKit displays `.left` turned 90° counter-clockwise (EXIF 8). The flag for this buffer is `.right` (90° clockwise, EXIF 6, the flag iPhone portrait photos use). So the converter's UIImage is upright-minus-180°. nitro-image's `rotate(0, false)` just redraws with that flag, so the error went through to the crop and the JPEG unchanged. `up` and `down` are mapped correctly.
- **Android, same error:** CameraX `rotationDegrees` (the clockwise turn to make it upright, 90 in portrait) → `fromDegrees(90)` = `LEFT` → `LEFT.degrees` = 270 → `toBitmap` does `postRotate(270)`. That's −rotationDegrees instead of +rotationDegrees, so it's 180° off for 90/270 and right for 0/180. Proven from source plus the documented CameraX and Matrix behaviour, and **verified on a physical Android phone (Redmi 13)**.

### Fix
- One shared place: `uprightPlan()` adds a 180° correction for `left`/`right` on both platforms. `cropFrameToGuide()` applies it in the same single redraw: `rotate(180, false)` on iOS (flag applied, then 180°, pixels `.up`) and a physical `rotate(180)` on Android. No phone-position check, no OCR retries.
- A 180° turn commutes with mirroring, so mirrored frames are corrected too (not used: the back camera isn't mirrored).
- Plate OCR, chassis OCR and saved tyre frames all use `cropFrameToGuide()`.
- **Saved tyre frames:** from the first fix until this one, frames saved on an iPhone held upright were upside down. Before that they were sideways. Any frames saved during device testing are wrong and should be retaken.
- If a later VisionCamera release fixes `toUIImageOrientation` or Android `toBitmap`, this correction becomes a 180° error. Re-check on every VisionCamera upgrade (`orientationModel.test.ts` describes the expected chain; see the orientation retest item in RELEASE_CHECKLIST.md). `react-native-vision-camera` is pinned to exactly `5.2.4` for this reason.

### Why earlier tests missed it
The fake images only tracked width and height, and the fake converter returned an image assumed upright. A 180° turn doesn't change width or height, so every size and call assertion passed. `orientationModel.test.ts` now models the pixels through each documented native step. It reproduces both device results (sideways before the first fix, upside down after it) and shows the corrected chain upright for every orientation. It still can't prove the native libraries behave as modelled; only a device can.

### Diagnostic panel removed
The iPhone device test passed with upright frames, thumbnails matching the guide box, and correct plate and chassis reads. The temporary `TEMP_OCR_DIAGNOSTIC` panel and its collection code were then removed.

### Verified on physical devices
The 180° correction and upright captures (plate OCR, chassis OCR and saved tyre frames) are verified on a Redmi 13 and an iPhone. Re-check on every VisionCamera upgrade.

## Chassis OCR validator (multi-tier)

Owner request: filter OCR garbage before `Chassis found`, while typed chassis numbers stay unrestricted.

- **OCR only.** `validateChassisCandidate()` in `src/ml/ocr/textCandidates.ts` decides whether an OCR read counts. Typed values in Vehicle details are unchanged: anything is allowed, with the spec §5 warning outside 5–17 (`isUnusualChassis`).
- **Normalising.** Uppercase; spaces, hyphens/dashes and punctuation removed. Letters and digits are never swapped. Anything else left (non-Latin letters, symbols) rejects the read.
- **Length.** 8–17 letters/digits. This is stricter than spec §5's 5–17 for typed values, by owner request; 5–7 character chassis numbers must be typed.
- **Tier 1, standard VIN:** `^[A-HJ-NPR-Z0-9]{17}$`. A 17-character read containing I, O or Q is rejected, not corrected. A real VIN misread with O for 0 therefore won't auto-fill; the user types it.
- **Tier 2, JDM frame:** `^[A-Z0-9]{3,6}[0-9]{6,8}$`, 9–14 characters, e.g. `NHP10-1234567` → `NHP101234567`, `FD3S-123456`.
- **Tier 3, other frame numbers** (bikes, two-wheelers, commercial): 8–16 letters/digits.
- **Additions beyond the request, to reject garbage:** every tier needs a digit; tiers 2 and 3 also need a letter (the tier-2 regex alone accepts all-digit runs such as dates and phone numbers); a tier-3 read must come from a single OCR word, so printed lines such as `MADE IN JAPAN 2019` aren't joined into a frame number. VIN and JDM reads may still be joined across words (`KE30 123456`).
- **Choosing between reads on a frame:** standard VIN beats JDM beats tier 3; within a tier the longer read wins.
- `Move closer` is only shown for small text that would otherwise have passed the validator.
- The stored chassis is the normalised value (no hyphen). The tiers are uncalibrated against real plates; check on a phone with real VIN plates, JDM frame stamps and bike frames.

## M6: inspection flow without models, report and PDF sharing

### Analysis pending (owner request; differs from spec)
- New `TyreFlowState` value `pending_analysis` (not in spec §6's union). When the analyzer throws `AnalyzerUnavailableError` (release build, models not bundled), the tyre keeps its sidewall/tread frames and confirmed sidewall details, gets **no result**, and the inspection moves on. Nothing is estimated.
- Before this, a release build stopped at the first tyre: analysis failed and the only options were `Try again` or rescan.
- Analysing shows `Analysis pending` and `{Tyre name} frames are saved on this phone. The tyre models aren't in this app yet, so there's no result for it.`, with `Next tyre` (→ Inspection progress) and `Try again`. Real analysis errors (the model ran and failed) still show the spec's `This tyre couldn't be analysed.` screen.
- Counting: pending tyres count as scanned in `X of N tyres scanned`, the progress segments and Home's unfinished card, and enable `Finish and view report` (spec: "when at least one tyre is analysed"). They never get a status and are ignored by `inspectionStatus` (spec §5 rule 6).
- Report: pending rows show size (only if read/typed and confirmed) and `N frames saved`, labelled `Analysis pending` in secondary text, not a status colour. Summary: only pending → headline `Analysis pending`; otherwise the worst real result leads and `1 tyre is waiting for analysis.` / `N tyres are waiting for analysis.` is added. Home and History rows show `Analysis pending` when there's no status.
- Restart: a pending tyre whose frames are missing goes back to capture, as for `captured`/`failed`.
- **Not built:** re-analysing pending tyres in a finished inspection once models ship (M7). The frames are kept for that.

### PDF and sharing
- `reportHtml()` (`features/report/reportHtml.ts`): self-contained HTML (no remote fonts, images or scripts), every user value escaped, theme colours only, status colours only with labels, `Demo data` notice for demo inspections, the automated-check footer.
- `shareReport()`: `generatePDF` with no `directory`, so the file goes to iOS `NSTemporaryDirectory()` / Android `cacheDir` (react-native-share's FileProvider covers `cache-path /`). Passing `directory` on Android would write to external storage, so it isn't used. The previous PDF is deleted when the next one is made, not right after sharing, because the receiving app may still be reading it. `Inspection.reportPath` stays `null`.
- File name `tyre-report-YYYYMMDD-HHmm`. It has no plate, because other apps can see the file name.
- New strings not in the spec: `Preparing report…` (button while the PDF is made) and `The report couldn't be shared. Try again.`
- Report rows come from one function, `reportTyreRows()`, used by both the screen and the PDF.

### Not changed
- Tyre layouts stay as spec §4.12 (2 / 4 / 6, those positions). No spare position: the spec leaves custom layouts out of the first release.
- Report rows don't show frame thumbnails. `21-final-report.png` has none. The saved-frame count stands in until a design is agreed.

### Verified on real devices
- PDF generation and the system share sheet work offline on a physical iPhone and Android phone.
- The release-build `Analysis pending` fallback works end to end through a multi-tyre inspection on both platforms.

## M7 Phase 1: inference layer skeleton (no models yet)

**Status: built and unit-tested only. Nothing here has run on a phone or against a real `.tflite` file.** `modelManifest` is still all `null`, so release builds behave exactly as in M6 (`Analysis pending`).

### Library check
- `react-native-fast-tflite` 3.0.1 (already pinned in M0, built on both platforms then). Nitro-based, peers `react-native: *` and `react-native-nitro-modules: *` (we have 0.37.2). v3 API: `loadTensorflowModel(source, delegates[])`, `model.run(ArrayBuffer[])`, tensors expose `name`, `dataType` and `shape`, but **not quantization scale/zero-point**, so those must come from the manifest. No new packages were installed.
- **Android release limitation found in the library source:** its `AssetLoader` does `java.net.URL(path).readBytes()`. In an Android release build `require('…tflite')` resolves to a raw-resource name (e.g. `assets_models_tread_model_int8`), which isn't a URL. The loader therefore copies the raw resource to `Caches/models/` with `@dr.pogodin/react-native-fs` `copyFileRes` and opens it as `file://`. iOS release resolves to a `file://` path inside the bundle. Development builds load from Metro's URL; **release builds refuse any `http(s)` model URL**, so models are never downloaded.
- Frames are decoded with `react-native-nitro-image` (`loadFromFileAsync` → optional `cropAsync` → `resizeAsync` → `toRawPixelDataAsync`); every intermediate image is disposed.
- `react-native-fast-tflite` and `react-native-nitro-image` are `require`d lazily, only when a model is actually opened or a frame decoded.

### Structure (`src/ml/inference/`)
- `types.ts`: model handle, load failures, tensor spec, and input/output types for `TyreDetector`, `SidewallExtractor`, `TreadEstimator` and `DamageClassifier`.
- `modelLoader.ts`: never throws. Order: manifest entry present → entry valid → asset really in the bundle → open with acceleration, falling back to CPU → loaded tensors match the manifest. Failure reasons: `not_in_manifest`, `invalid_manifest`, `asset_missing`, `load_failed`, `manifest_mismatch`.
- `tensorUtils.ts`: pixel format → RGB/BGR, normalisation, uint8/int8 quantization, NHWC/NCHW, stretch or centre crop; output dequantization, softmax, frame averaging.
- `pipeline.ts`: sidewall → tread → damage → `tyreStatus()`.

### Choices
- **Manifest typed more strictly** (it was all `null`, so nothing changed at runtime). Added the fields the pipeline needs, all to come from the training output: `inputLayout`, `colorOrder`, `resize`, `inputQuantization`, `outputType`, `outputQuantization`, `scores` (probabilities or logits), `frames` (which captures a model was trained on), tread `statusByLabel`, damage `damageLabels`. `normalisation` is defined as `(pixel0–255 − mean) / std`.
- **Sidewall has no TFLite model.** Spec §7 reads the sidewall with ML Kit OCR and parsers, so `SidewallExtractor` uses only the user-confirmed values (same as the demo analyzer). Nothing is guessed.
- **Required for analysis: tread and damage.** The detector is preview-only (spec §7) and isn't needed. If either model is missing the tyre stays `Analysis pending`; no partial result is shown.
- **Frames:** each classifier runs on its frames one at a time, and per-frame probabilities are averaged.
- **Tread:** the top class must reach `confidenceThreshold`, otherwise `This tyre couldn't be analysed.` (retry or rescan). `treadDepthMm` stays `null` (spec: mm only after gauge validation), so the UI shows status without mm. `wearPattern` is `null`.
- **Damage:** the summed probability of `damageLabels` ≥ `confidenceThreshold` → damage found. `damageConfidence` is the confidence in the reported answer.
- **Acceleration:** iOS tries `core-ml`, Android tries `android-gpu`, then CPU. NNAPI is not used (M0).
- **Development builds** switch from the demo analyzer to the real one as soon as tread and damage are in the manifest. Release builds always use the real one.
- **Analyzer version** saved on inspections: `tflite:tread@<v>,damage@<v>` (or `tflite-unconfigured`).
- **New string** (bundled models that fail to open or don't match the manifest): `{Tyre} frames are saved on this phone. The tyre models couldn't be loaded, so there's no result for it yet.` Title stays `Analysis pending`, with `Try again` (the load is retried).

### Not built yet (Phase 2+)
- Tyre detector output decoding (YOLOX grid decode/NMS) and running it in the preview frame processor. This needs the exported model's output layout. `isTyreDetectorAvailable()` is unchanged.
- Re-analysing pending tyres in finished inspections.

### Needs a real phone
- Android: copying the raw resource and loading it with `android-gpu`, then falling back to CPU. iOS: `core-ml` delegate with an int8 model.
- Nitro Image pixel formats actually returned on each platform (handled: RGB/BGR/RGBA/BGRA/ARGB/ABGR and X variants).
- Memory, time and heat for 10 tread + 8 sidewall inferences per tyre on a low-end Android phone.

## M7 Phase 2a: first model registered (`tyre_detector.tflite`)

> **Superseded 2026-11-10:** the file and its manifest entry were removed. See "Sidewall text without a detector" at the end of this file.

**Status: manifest entry and loader checks unit-tested against the real file. Not yet loaded on a phone, and nothing runs the model yet.**

### What the file really is (read from the file, 2026-11-06)
- Ultralytics 8.4.203 YOLOv8n, `task: detect`, classes `Brand`, `Dot-Code`, `Model`, `Size`, `imgsz` 224×224.
- Input: **float32 `[1, 3, 224, 224]` (NCHW)**, not quantized. Output: **float32 `[1, 8, 1029]`**: 4 box values + 4 class scores for each of 1029 anchors (28² + 14² + 7²), no NMS (`end2end: false`). The graph contains Ultralytics' `_NormalizeCoords`, so boxes are probably 0–1. **Confirm this on a phone before building the decoder.**
- The export notes said NHWC / int8. Only the weights are int8. The input and output tensors are float32, and the loader rejects a manifest that doesn't match the file, so the manifest uses the file's values (**owner decision**).

### Choices (owner decisions, 2026-11-06)
- **Registered as `sidewallTextDetector`, not `tyreDetector`.** The model finds sidewall text regions for OCR. The spec's tyre detector finds the tyre itself (position and distance). `tyreDetector` stays `null`, so `isTyreDetectorAvailable()` is still false and no distance or auto-capture is claimed.
- `confidenceThreshold: 0.25` is Ultralytics' default, used as a starting value. **Calibrate it on real sidewalls before release.**
- `normalisation` is pixel / 255 in RGB order, and `resize: 'letterbox'` is the Ultralytics default preprocessing. `letterbox` was added to the manifest type. `imageFileToTensor` throws for it until padding is built, so no classifier can use it by mistake.
- New manifest type `YoloDetectorManifestEntry` (`outputFormat: 'yolov8_raw'`, `outputType`, `outputQuantization`, `outputShape`). The loader checks that the output shape is `[1, 4 + labels, N]` and that it matches the loaded tensors.
- **File location:** `assets/models/tyre_detector.tflite`, loaded with `require` like the other models (Metro, then iOS bundle `file://` or the Android raw resource copied to cache). The native copies (`android/app/src/main/assets/` and `ios/tyre_detector.tflite` with its 4 Copy Bundle Resources lines in `project.pbxproj`) were **removed on owner request** (2026-11-06). They were byte-identical and the loader never used them.
- Jest maps `*.tflite` to a numeric asset-id stub (`jest/tfliteAssetStub.js`). `src/ml/__tests__/manifest.test.ts` reads the real file's flatbuffer and embedded `metadata.json` and checks the manifest against them.

### Risks
- ~~**ACTIVE RELEASE BLOCKER: licence AGPL-3.0**~~ **Cleared 2026-11-10: the file was removed** ("Sidewall text without a detector"). Was: licence AGPL-3.0 (Ultralytics, from the file's metadata). Spec §7: closed-source commercial use needs an Ultralytics enterprise licence. **Owner decision (2026-11-06): this model must be replaced (or licensed) before any commercial release.** It is used for development only until then.
- Spec §7 lists YOLOX-Nano at 320×320 for the detector. This model is a different architecture, at a different size, for a different job.

### Decoder and preprocessing (M7 Phase 2b, 2026-11-06)
**Status: unit-tested with synthetic tensors. Not run on a phone and not checked against real detector output.**
- **Letterbox** (`letterboxPlan`, `padPixels`, `imageFileToModelInput` in `tensorUtils.ts`): scale to fit and keep the aspect ratio, using Ultralytics' `round(d ± 0.1)` padding split. Padding is grey 114 (`letterboxPadValue`, Ultralytics' training value). The result is RGB / 255 as float32 NCHW. The geometry (`scale`, `padX`, `padY`) is returned so boxes can be mapped back. Every intermediate image is disposed.
- **Decoding** (`decodeYoloDetections`): reads `[1, 4 + labels, anchors]` attribute-major and takes the best label per anchor. Anchors below `confidenceThreshold` (0.25) and zero-size boxes are dropped. Then greedy **NMS per label** (Ultralytics' default, not class-agnostic) runs at **IoU 0.45 (owner value)**, keeping at most `maxDetections` (300, Ultralytics' default). A box overlapping a kept box exactly at the threshold is kept, and anything above it is dropped. Scores are used as output, because the YOLOv8 export already applies sigmoid.
- **`boxFormat: 'cxcywh_normalised'`** is inferred from `_NormalizeCoords` in the graph. **Unverified:** if real output shows pixel values (e.g. cx ≈ 112), switch it to `cxcywh_pixels`. The decoder supports both.
- **Back to frame pixels** (`detectionToFrameRect`): undoes the letterbox and clips to the frame. Boxes entirely in the padding are dropped. `ocrCropRect` adds `ocrConfig.sidewallRegionMarginRatio` (**0.1, UNCALIBRATED**) on each side, as whole pixels inside the frame.
- **Pipeline:** `createSidewallTextDetector` runs on each saved sidewall frame, and `createSidewallExtractor(detector)` returns the confirmed values plus `textRegions` (frame, label, score, box, cropRect). `runTyrePipeline` passes the regions to the optional `PipelineDeps.onSidewallTextRegions` hook. **They are not saved in `TyreResult`, and they never fill in values:** size, DOT, make and model still come only from what the user confirmed.
- **Optional model:** `TfliteTyreAnalyzer` loads the text detector after tread and damage. If it is missing or won't open, analysis runs without regions. A frame the detector can't read (e.g. `demo://`) is skipped and doesn't fail the tyre.
- **Still not reachable in the app:** the analyzer only runs once the tread and damage models exist, so the detector doesn't run yet. Nothing consumes the regions yet either: OCR on the crops (crop with Nitro Image → `recognizeLines` → parsers → user review) is the next step.

### Needs a real phone
- The model loading through `core-ml` / `android-gpu` with CPU fallback, and the loaded tensor details matching the manifest.
- The real output's box format (normalised or pixels) and whether boxes land on the text, on both platforms.
- The pixel format Nitro Image returns after `resizeAsync`, and the time for 8 sidewall frames on a low-end Android phone.

## M7 Phase 2c: sidewall text regions → ML Kit OCR → suggestions (2026-11-06)

**Status: superseded 2026-11-10. The detector, region crops and crop-only parsers were removed; ML Kit now reads the whole saved frame ("Sidewall text without a detector").** The text below records the earlier design.

### Where it runs
- **On Sidewall captured, not in the post-capture analyzer.** Suggestions must reach the user before they confirm, and the analyzer only runs after tread capture (and only once tread and damage models exist). `SidewallCapturedScreen` calls `getSidewallReader()` (`src/ml/sidewallReader.ts`) when it opens. Screens never touch TFLite or ML Kit directly.
- Read results **only fill fields that are still empty and that the user hasn't edited** (`applySuggestions`). Values already saved for the tyre are never replaced. Filled fields stay editable: the screen's existing "Check the details and correct anything that's wrong" is the confirmation step, and pressing `Scan tread` saves what's shown.
- **New placeholder (differs from spec, owner accepted 2026-11-06):** while reading, empty fields show `Reading…` instead of `Not read`, so a field doesn't claim "not read" and then fill in a moment later. It becomes `Not read` once reading ends with nothing, or as soon as the user edits that field.

### Pipeline (`createSidewallReader`)
1. For each saved sidewall frame: text detector (Phase 2b), then the **best-scoring region per label**.
2. Crop the saved frame to the region's `cropRect` (Nitro Image `cropAsync`), write a temporary JPEG, run ML Kit `recognizeLines`, then delete the JPEG. Every image is disposed.
3. Label → field → parser (`src/ml/ocr/sidewallFields.ts`):
   - `Size` → `size`: existing `parseTyreSize`, per line, then on all lines joined (OCR can split `205/55` and `R16`).
   - `Dot-Code` → `dotTin`: uppercase, letters, digits and single spaces, leading `DOT` removed. Valid only with 4–13 letters and digits **ending in a real week/year date code** (`parseDotAge`: week 1–53, not in the future). A date-code-only read is accepted.
   - `Brand` → `make`, `Model` → `model`: the tallest OCR line with ≥2 letters (≤30 chars), as read. **No brand list or fuzzy matching**: that would be guessing.
   - Characters are never swapped (O/0, I/1…), completed, or reformatted beyond what the parser defines.
4. **Agreement:** a value is suggested only when `ocrConfig.sidewallMinAgreeingReads` (**2, UNCALIBRATED**) frames read the same text (ignoring case and spaces). Disagreements go to the majority, with ties going to the higher total detector score. A field stops being read once it has agreement. At most `sidewallMaxOcrRuns` (**24, UNCALIBRATED**) OCR runs per sidewall.

### Fallbacks (never throws; fields stay `Not read`)
- No ML Kit in the build (e.g. iOS simulator builds), or only `demo://` frames: nothing is read, and the placeholder stays `Not read`.
- Detector missing or failing to load: full-frame fallback only (below). The load is retried next time, and a loaded detector is reused.
- Detector error on a frame, crop/save error, OCR error, no text, or text that fails its parser: that region or frame is skipped.
- **Full-frame fallback (owner decision 2026-11-06): size and DOT only.** When the detector finds no regions in a frame (or isn't in the build, or fails on that frame), the whole frame is read with ML Kit, and only strict patterns are taken. A frame with any regions is not read whole. **Make and model are never read from a whole frame:** picking which text is the brand would be a guess.
  - Size (`fullFrameSizeCandidate`): one OCR line at a time, never joined across the frame, parsed by `parseTyreSize`, and within `FULL_FRAME_SIZE_LIMITS` (width 100–395 mm, aspect 20–95, rim 8–26 in, so motorcycle sizes like 100/90-17 pass).
  - DOT (`fullFrameDotCandidate`): a line must start with the word `DOT`, alone or joined with the next line in reading order, giving 8–13 letters and digits after `DOT` ending in a valid date code. A lone date code, which a crop can accept, isn't taken from a whole frame.
  - The same 2-frame agreement and OCR run cap apply. Full-frame reads count as OCR runs.

### Offline
- Everything runs on the phone: TFLite (bundled model), ML Kit Latin (bundled models), and files in app storage and caches. No new packages and no network calls.

### Needs a real phone
- ML Kit accuracy on cropped sidewall regions (moulded black-on-black text), and whether the 10% crop margin and 2-frame agreement are right.
- Time to read 8 frames (8 detector runs + up to 24 OCR runs) on a low-end Android phone. The `Reading…` wait has no limit other than the run cap.
- The detector and a later analyzer each load their own copy of the model (about 3.3 MB each). That's acceptable for now; share a loader if memory is tight.

## Tread and damage stub models — declined (2026-11-06)

The owner asked for lightweight baseline/stub MobileNetV3 TFLite classifiers (tread: good / adequate / replace_soon / danger; damage: normal / damaged), registered in the manifest so the analyzer runs. **Not done**, because:
- An untrained or placeholder classifier outputs arbitrary scores. `TfliteTyreAnalyzer` has `isDemo = false` and is the only analyzer in release builds, so those results would be **shown and saved as real tyre condition**, including in release builds. That breaks the rules "Never show made-up results as real in a release build" and "Don't invent model input, output, or threshold values" (CLAUDE.md, spec §7). For a safety check, a wrong `Good` on a worn tyre is the worst outcome.
- Spec §7 defines three tread classes (Good, Replace soon, Replace now), and `statusByLabel` must map every label to one of those statuses. `adequate` and `danger` have no defined status mapping, and choosing one would be inventing thresholds.
- The analyzer flow already runs end to end without models: development builds use `DemoTyreAnalyzer` (labelled `Demo data`), and release builds keep tyres as `Analysis pending` until real models are bundled.

**Unblocks it properly:** trained tread and damage `.tflite` files with their input/output details, labels mapped to the three spec statuses, and the confidence thresholds. Then they register in the manifest like `sidewallTextDetector`, with a test against the real files.

## Sidewall OCR diagnostics (2026-11-06) — temporary parts REMOVED after device calibration (see "Milestone wrap-up" below)

On a physical device, every sidewall field showed `Not read`. Added to find out why:
- `src/ml/ocr/sidewallDebug.ts`: `sidewallLog()` with tag `[SidewallOCR]`. It's on in development builds (`__DEV__`) and off in release builds and Jest (`setSidewallDebug()` overrides). Output goes to the device log only.
- Logged:
  - whether the screen starts reading (OCR available, frame count, empty fields);
  - detector load or fallback, with the loader's failure reason;
  - per frame: frame size, letterbox, the **best score per label across all anchors (even below 0.25)**, anchors above threshold, and boxes after NMS;
  - raw ML Kit lines (text and height) for each crop and each full frame;
  - each parser's rejection reason;
  - the final agreement decision per field, and a summary.
- Full-frame fallback reads the **saved frame** (HD 16:9 camera frame cropped to the guide, about 600–700 px), never the 224×224 detector input.
- **TEMPORARY rule change:** with exactly one saved frame, 1 read is enough to suggest a value. Sidewall capture needs at least 5 frames, so this rarely applies to real scans; the 2-read rule still holds otherwise.

### Device findings, round 1 (2026-11-06)
- **Detector `run()` throws `TFLite: Failed to run TFLite Model! Status: error`** (CPU). This comes from `TfLiteInterpreterInvoke` in fast-tflite. Input copying can't cause it: fast-tflite ignores `TfLiteTensorCopyFromBuffer`'s status, so a wrong-sized buffer would run silently instead. Layout is ruled out: the native model reports float32 `[1, 3, 224, 224]`, the loader checks that against the manifest, and we send 602,112 bytes. The model only uses standard ops (CONV_2D, PAD, TRANSPOSE, LOGISTIC, MUL, ADD, SUB, CONCATENATION, MAX_POOL_2D, RESIZE_NEAREST_NEIGHBOR v3, SLICE, RESHAPE, SOFTMAX, QUANTIZE, DEQUANTIZE), and every internal tensor is int8. Runtime: LiteRT 1.4.0 (Android), TensorFlowLiteC 2.17.0 (iOS). Added:
  - a **zero-input self-test** right after the detector loads. If it also fails, the model or runtime is at fault, not our preprocessing;
  - on `run()` failure: delegate, manifest vs native tensor shapes, our byte length vs expected, value range, non-finite count, error and stack.
  - TFLite logs the real reason itself, outside our logger: `adb logcat | grep -iE "tflite|litert"`.
- **Make from a whole frame (owner request, narrowed):** only when a line contains a name from `src/config/tyreBrands.ts` exactly, as a whole word (case and spacing ignored). It returns the matched text as read. **Not done: "largest text line" as make.** On the device it would have suggested `OUTSIDE` or `Comfortcontact`. Fragments like `iental` never match, and **model is still never read from a whole frame**. On the device tyre, `Continental` is a stylised logo that ML Kit read as `iental`, so this tyre still gets no make suggestion until the detector crop works.
- **DOT tolerance (owner request, narrowed):** characters OCR put before the word `DOT` are dropped, if no letter touches `DOT`. **Not done: reading `O` as `0` in the date code.** CLAUDE.md says never guess OCR values, and the date code sets the tyre's age, which feeds its status (age ≥ `replaceSoonYears` → Replace soon). A guessed digit could change the result. A misread date code stays `Not read` for the user to type.

### Device findings, round 2 (2026-11-06)
The detector now runs (float32 model, GPU) and finds about 5 regions per frame with confidence above 0.85, but suggestions were still empty. Changes:
- **ML Kit minimum size:** `InputImage width and height should be at least 32`. Every OCR crop is now at least `ocrConfig.sidewallMinCropPx` (**36 px**) on each side, grown around its centre and shifted to stay inside the frame (`ocrCropRect`). A frame smaller than that gives the whole frame.
- **Crop margin** raised from 0.1 to **0.2** of the box size on each side (owner asked for 15–20%). Tight boxes cut letter edges on curved embossed text. Still UNCALIBRATED.
- **Normalisation** (`cleanOcrText`): punctuation and symbols are trimmed from the ends of make/model reads and spaces are collapsed. Agreement keys (`readKey`) ignore case, spaces and punctuation. Letters and digits are never changed.
- **Brand matching (owner decision; CLAUDE.md now has a narrow exception)**, inside a detector `Brand` crop only (`brandCandidate`):
  1. A read containing a `tyreBrands.ts` name (letters and digits, any case) → canonical name.
  2. A word, or two adjacent words, within **Levenshtein 1** of exactly one brand of **6+ letters** (no other brand as close) → canonical name.
  3. Otherwise the line as read (the list isn't exhaustive). Fragments like `iental`, two-error reads, short brands and ambiguous matches are never corrected.
  - The full-frame make fallback is still exact whole-word only, as read.
- **Model agreement:** reads group when within Levenshtein **2** (1 if either key is under 6 characters) **and their digits are identical**, so `Primacy 3` and `Primacy 4` never merge (`nearSameModel`). The suggestion is always a spelling that was actually read: the most frequent one in the group, then the best detector score. Early stopping still needs the same spelling to agree, so near-identical reads don't stop reading before frames can settle which spelling is right.

### Device findings, round 3 (2026-11-06)
End to end on the device: model (`ComfortCont`) and make filled, but make came out as the corrupt `Ontnem`, and size and DOT were empty.
- **Size fallback:** when a frame's `Size` crop gives no size (it often lands on `ComfortContact`), the strict full-frame size parser runs on the **other crops' OCR from the same frame**, then on the **saved high-res frame** (never the 224×224 tensor). That full-frame read also takes a strict DOT if DOT is still open. It's one extra OCR run per frame until size agrees, within the run cap.
- **DOT in crops:** a misread marker at the start of a `Dot-Code` crop (`D0T`, `DQT`, `D07`, `1D0T`) is dropped, even when glued to the TIN. Whole frames still need the word `DOT`.
- **DOT date code `O` → `0` (owner decision; CLAUDE.md exception):** only the first of the final 4 characters, only the letter O, and only if the result is a valid week/year. Weeks start with 0–5, and of those only 0 looks like O. The rest of the TIN is kept exactly as read, so device reads like `YG09RURT 0124` (for `1Y6 032MKT 0124`) can still be wrong in the plant/size code.
- **DOT date-code agreement:** if whole TINs don't agree across frames but their date codes do, only the date code (e.g. `0124`) is suggested. That's the part that gives the tyre's age.
- **Make (owner decision; CLAUDE.md exception):** inside a `Brand` crop, logo fragments map to a brand when ≥ 80% of the read's letters appear in order in that brand, cover ≥ 40% of it, and it beats the next brand by ≥ 2 letters (`BRAND_FRAGMENT`). Device reads `Ontnem`, `OntneNaj`, `TLenta` → Continental; `OnteM`, `val`, `Roadstone` → nothing.
- **Behaviour change:** a Brand crop that matches no listed brand now gives **no make suggestion** (it used to give the line as read). Unlisted brands are typed by the user, so add brands to `src/config/tyreBrands.ts` as they come up.

### Device findings, round 4 (2026-11-06)
Make (`Continental`, via logo fragments) and model (`Comtortconta`, via grouped reads) now fill on the device. Size and DOT were still empty.
- **DOT, single date code (owner decision):** if the frames' DOT reads contain exactly one distinct valid date code (e.g. `0124 x1`) and no competing date code, that **date code alone** is suggested. A single, unconfirmed full TIN is never suggested, because the device's TIN bodies are badly misread (`YG09RURT` for `1Y6 032MKT`). Different date codes across frames → no DOT suggestion.
- **Size, band crop:** before reading the whole frame, one extra crop covering the best `Size` and `Model` boxes together is read with the strict size parser. The size usually sits next to the model on the same text band, and the detector's Size box was landing on `ComfortContact`.
- **Size typo healing — declined.** The device reads `H95/6 50152` and `95/6S` for **195/55 R15**. Healing H→1, S→5, O→0, B→8 turns `H95/6S R15` into **195/65 R15**, a wrong size suggested with confidence, because the second `5` was read as `6` and no rule can recover it. Size stays outside the CLAUDE.md exceptions. Those full-frame fragments point to resolution: the size is too few pixels in a whole-tyre frame. The real fix is more pixels on the text band: higher-resolution sidewall frames, or a closer text-band capture.
- **Brands:** `tyreBrands.ts` has 59 brands, still including Continental. Case, spacing and punctuation variants match automatically. Brands that are everyday words are left out. **`GT Radial` was tried and removed:** as a fragment, the word `RADIAL` on almost every tyre matched it. A test now checks that common sidewall words never become a brand.
- **Fragment rule changed:** "beats the next brand by 2 letters" became "**the only brand passing both coverage thresholds**, and leading every other brand". With the longer list, `Ontnem` scored Continental 5 against Roadstone 4. Roadstone doesn't qualify on its own (4 of 6 letters, under 80%), so the old margin rejected a correct match.

### Device findings, round 5 (2026-11-06)
Make, model and DOT now fill on the device (`Continental`, `colnortcontae`, `0124`). Size was still `Not read`: the Size crop read the end of the model name (`Conta`, `rlConta`, `Contac`), and the full frame read `A95/55`, `81545Vt`, `R154` for 195/55 R 15.
- **Longer Size crops:** a `Size` crop is lengthened by `ocrConfig.sidewallSizeExtraLengthRatio` (**0.3, UNCALIBRATED**) of its length along its longer side (the direction the text runs), half on each side, inside the frame (`extendAlongText`).
- **Size joining (no inference):** a fully read `195/55` plus a rim token (`R15`, `R 15`, `ZR15`, or `R154` with a stray digit) on the same line or the next/previous line in reading order → `195/55 R15`. Not across other lines.
- **Width hundreds digit (owner decision: "rim-gated"; CLAUDE.md exception):** when only two width digits were read (`95/55`, `A95/55`), the width is completed **only** to 175–225 (`1` before 75/85/95, `2` before 05/15/25), and **only** with a rim **R13–R17** read on the same or adjacent line. Bigger rims are excluded because 1xx/2xx is genuinely ambiguous there (`85/45 R20` is almost always 285, never 185). Aspect and rim are never changed, so `A95/6S` still gives nothing.
- **Note on the device read:** in the logged full frame, `R154` was not on the line next to `A95/55` (`81545Vt` was between them), so that exact read still gives no size. The lengthened Size crop is the main hope, and the next logcat will show it (`crop OCR for size`, `size recovered: …`).
- **Test fix:** several "no suggestions" assertions used `toMatchObject({ suggestions: {} })`, which matches any suggestions. They now compare exactly. This showed the single-date-code rule (round 4) also fires in a 2-frame case where only one frame read a date code; the test now expects that.

## Sidewall OCR milestone wrap-up (2026-11-06)

**Proven on a real Android phone** (Continental ComfortContact CC7, 195/55 R15, DOT … 0124): all four fields were suggested, Make `Continental`, Model `ComfortContact`, DOT/TIN `0124`, Size `195/55 R15`. The user still confirms or corrects every field on Sidewall captured. Not yet tested on iOS hardware or on other tyres/brands.

### Fields kept on rescan
- **Scan sidewall again** (Sidewall captured / Capture problem): already kept saved details. `useStageOutcome` carries the tyre's `sidewallDetails` into the new capture, and Sidewall captured fills only empty, untouched fields.
- **Scan this tyre again** (Analysing / Tyre result): `resetTyre` used to rebuild the tyre from scratch, which **wiped** make, model, size and DOT. It now keeps `sidewallDetails` and clears only frames, result and errors. A rescan that reads only size and DOT therefore keeps make and model from the earlier scan, and a later read never replaces a value already there (tests: `lifecycle.test.ts`, `sidewallSuggestions.test.tsx`).

### Diagnostics cleaned up
- **Removed:** the detector zero-input self-test, run() tensor diagnostics, the per-frame score dump (`yoloScoreSummary`), raw OCR line dumps, per-step rejection logs, the screen-open log, and the **1-frame agreement relaxation**. Sidewall capture needs 5+ frames, and DOT is covered by the single-date-code rule.
- **Kept, OFF by default in every build** (`setSidewallDebug(true)` to calibrate on new tyres): heuristic decisions (brand contains / 1-error / fragment match, DOT O→0, size join and rim-gated width, grouped model reads, date-code-only DOT), failures (detector load, detector run, crop/OCR errors) and a one-line summary per read.

### Calibrated heuristics kept (all UNCALIBRATED beyond this one tyre)
Crop margin 0.2 · min crop 36 px · Size crop +30% along the text · 2-frame agreement · 24 OCR runs · brand list (59) with contains / Levenshtein 1 / fragment rules · model grouping (≤2 edits, same digits) · DOT crop marker clean-up, O→0 first date-code character, single date code rule · size: one-line parse, adjacent rim join, rim-gated width (175–225, R13–R17), Size+Model band crop, full-frame fallback.

### Still open
- ~~**Licence: the detector is AGPL-3.0 — active release blocker.**~~ Cleared 2026-11-10: the detector was removed.
- iOS device test; more tyres and brands (lighting, wear, dirt); tread and damage models (owner input).

## M7 Phase 3: tread wear detector (`tread_wear.tflite`)

**Status: manifest entry checked against the real file; decoding, service and hook unit-tested with synthetic tensors and fakes. Not yet loaded or run on a phone, and no screen uses it yet.**

### What the file is (read from the file, 2026-11-06)
- Ultralytics 8.4.203 YOLOv8n, `task: detect`, `end2end: false`, `imgsz` 224×224, 14 wear classes (`Alternate Lug Wear` … `Wavy Wear`, metadata `names` order).
- Input float32 `[1, 3, 224, 224]` NCHW; output float32 `[1, 18, 1029]` (4 box + 14 class scores per anchor). Matches the owner's export notes. `_NormalizeCoords` is in the graph, so boxes are 0–1.
- ~~**Licence AGPL-3.0**: same release blocker as the sidewall text detector.~~ **Cleared 2026-11-10 for this model:** replaced by an SSDLite model, see "M7 Phase 3b" below. The sidewall text detector's AGPL blocker was cleared the same day by removing the file ("Sidewall text without a detector").

### Choices (owner decisions, 2026-11-06)
- **Registered as `modelManifest.treadWear`** (a `YoloDetectorManifestEntry`), separate from `tread`. It says what kind of wear there is, never Good / Replace soon / Replace now. `tread` and `damage` stay `null`, so analysis is still pending.
- **One decoder.** `parseTreadWearOutput` (`src/ml/utils/treadWearPostProcess.ts`) reuses `decodeYoloDetections` (best class per anchor, confidence 0.25, greedy per-class NMS at IoU 0.45, max 300). It then normalises boxes to `[x, y, w, h]` and clamps them to [0, 1] after NMS, as Ultralytics does. The loader's YOLO checks now apply to every key in `YOLO_MODELS`.
- **Preprocessing:** letterbox with grey 114, RGB / 255, planar NCHW float32: the existing `imageFileToModelInput`. Not a plain stretch to 224×224, so frames keep the aspect ratio the model was trained on.
- **Delegates:** Core ML (iOS) / GPU (Android), then CPU, from the shared loader (`ACCELERATION_BY_PLATFORM`). **No NNAPI**, although the original brief asked for it (M0 decision).
- **`src/ml/config/treadWearConfig.ts`** only gives the manifest values a typed shape (`TREAD_MODEL_CONFIG`, `TREAD_WEAR_CLASSES`, `TreadWearClass`). The class list is checked against the manifest and the file.
- **Severity:** `critical` when any wear class is at **≥ 0.60** confidence (`TREAD_WEAR_SEVERITY`, owner value, uncalibrated). Below that it is `detected`; with no findings it is `none`. It is an indicator in `useTyreInspection` only and **never changes the tyre status**. (Superseded 2026-11-10: some damage classes now raise the status, see "M7 Phase 3b".)
- **State:** `useTyreInspection(tyreId)` keeps wear detections in hook state. They are not persisted, and the store's tyre, result and `sidewallDetails` are not written. `scanTreadWear()` runs only on saved tread frames, after capture; `demo://` frames are reported as `no_frames`, never as a result.
- **Diagnostics:** `setTreadDebug(true)` (`src/ml/services/treadDebug.ts`), off by default, device log only, tag `[TreadWear]`. Logs frame indexes, not paths.
- **File location:** `assets/models/tread_wear.tflite`. The native copies (`ios/tread_wear.tflite` with its 4 `project.pbxproj` lines, and `android/app/src/main/assets/tread_wear.tflite`) were **removed on owner request**. They were byte-identical and the loader never used them.

### Tyre result card (2026-11-06)
- **Layout change (owner request):** Tyre result has a **`Tread Pattern & Wear` card** below the rows and above the automated-check notice. It isn't in `19-tyre-result.png`. The header, status badge and every row (size, rim, make, model, DOT/TIN, age, wear pattern, damage) are unchanged. The `Wear pattern` row still shows the analyzer's `wearPattern`, which the card doesn't fill.
- **Labels:** `TREAD_WEAR_PRESENTATION` / `describeTreadWear` in `treadWearConfig.ts` hold the owner's titles, causes and advice for 10 classes. The 4 unlisted classes (`Eccentric and Out-of-Round Wear`, `River_Channel Erosion Wear`, `Shoulder Step Chamfer Wear`, `Wavy Wear`) get a cleaned title only, with no cause or advice.
- **Card states:**
  - checking: spinner and `Checking tread wear on this phone…`
  - `Not checked`: model missing, no saved tread frames, or no frame could be read
  - `Normal Wear Distribution`: the model ran on at least one frame and found nothing
  - `Wear pattern found` (< 0.60): title, likely cause and advice
  - `Maintenance needed` (≥ 0.60): title, likely cause, and `Get this checked as soon as possible: …`
  - Other classes found are listed under `Also seen`. The outcome is announced to screen readers.
- **No status colours on the card.** CLAUDE.md keeps green / amber / red for tyre status only. A red wear alert next to a `Good` status badge would read as a status, so the card uses theme tokens: muted grey (normal), a navy outline (warning) and navy fill with white text (critical), each with a text label and its own icon.
- **When it runs:** when Tyre result opens (`useTyreInspection(tyreId, { autoScan: true })`), on the tyre's saved tread frames only, after capture and analysis. Finished scans are cached in memory for the session (up to 24 tyres) and are never saved. Reopening a tyre doesn't rerun the model; scanning the tyre again (new frames) does.
- **Fix:** if every frame fails (e.g. files missing), the detector now returns `unavailable: unreadable` instead of an empty `done`, so the card can't say `Normal Wear Distribution` for a tyre it never checked.

- Colours and placement approved by the owner (2026-11-06).

### Saved wear and report (owner decision 2026-11-06)
- **Saved with the result.** `TyreResult.treadWear` (`TreadWearRecord`) is not in the spec's model. It holds the severity, the strongest raw class, title, cause, recommendation, confidence, other titles found, the model version and the check time. `wearPattern` is set to the record's title, so the `Wear pattern` row matches the card. The field is optional, so results saved before it (inspections are stored as JSON) still load. `status` is never changed.
- **When:** the check runs when Tyre result opens and is saved into the tyre's result (`store.setTreadWear`). It isn't saved if the tyre has no result, or if its tread frames changed while the check ran (scanned again). A tyre whose result already has a check shows it without running the model again, including after a restart. The in-memory cache was removed. Nothing is saved when the check couldn't run (`Not checked`), so the row keeps the analyzer's value (`Not read` for real results).
- **Wording** comes from one place (`features/inspection/treadWear.ts`). Recommendation: the class advice below 0.60, and `Get this checked as soon as possible: …` at 0.60 or above. Classes without owner wording get no recommendation below 0.60.
- **Report screen and PDF:** each analysed tyre gets a `Wear: {title}` line, adding ` · Wear pattern found` or ` · Maintenance needed`, and the recommendation below it in navy. The PDF escapes them like other values. Results without a wear check show the analyzer's pattern, or nothing. **The summary headline is unchanged:** it still comes from the tyre status only, so wear can't make the summary say a tyre needs replacing. Adding the wear lines changes the layout of `21-final-report.png`.
- Demo inspections: the demo analyzer's `Even` now also appears in the demo report (`Wear: Even`), under the existing `Demo data` notice.
- Layout change and demo `Wear: Even` approved by the owner (2026-11-06).
- **Summary advisory (owner decision 2026-11-06):** if the summary status is Good and any analysed tyre's wear check is `critical`, the report screen and the PDF show `Maintenance attention recommended for detected wear patterns.` beneath the headline (`ReportSummary.advisory`). The headline and status are unchanged. There's no advisory when the status is already Replace soon or Replace now, for wear below 0.60, or for normal or no wear check.

### Not done yet
- The card and the report lines aren't in the design images. Check them on a phone (small screens, large text) and in a shared PDF.

### Needs a real phone
- Loading through `core-ml` / `android-gpu` with CPU fallback, and the loaded tensors matching the manifest.
- That real output boxes are 0–1 and land on worn areas; the 0.25 confidence and 0.60 critical values on real tread frames.
- Time, memory and heat for 10 tread frames on a low-end Android phone.

## iOS release: "Analysis pending" on iPhone 13 (2026-11-06)

**Status: diagnosed; no bundling or loader change needed. Covered by `src/ml/inference/__tests__/iosBundleAssets.test.ts`.**
- **Cause:** `modelManifest.tread` and `modelManifest.damage` are `null`. The tread status classifier (Good / Replace soon / Replace now) and the damage classifier haven't been supplied. `TfliteTyreAnalyzer` needs both, so it throws `ModelUnavailableError('missing')` (`not_in_manifest`), which shows `The tyre models aren't in this app yet`. This is the intended result for this build on every phone. `tread_wear.tflite` is a wear-pattern detector and can't stand in for the tread status model.
- **Bundling is correct.** `react-native bundle --platform ios --dev false` (Xcode's "Bundle React Native code and images" phase) copies both models into `TyreKitBay.app/assets/assets/models/`, byte-identical to `assets/models/`. React Native's resolver maps them to `file://…/TyreKitBay.app/assets/assets/models/<name>.tflite`, which the loader checks and opens (Core ML, then CPU). No Copy Bundle Resources entries or `MainBundlePath` lookup are needed. Adding them would bundle each model twice (they were removed on owner request).
- **Consequence:** in a release build no tyre gets a result, so Tyre result (and its wear card) is never shown. Tread wear doesn't run in release builds until the tread and damage models exist, or the owner decides it should run for `Analysis pending` tyres.
- **Sidewall `Not read` on iOS:** not explained by bundling (the detector resolves and loads in the tests above). It needs device logs: `setSidewallDebug(true)` in a Release-configuration build run from Xcode, then read the `[SidewallOCR]` lines (detector loaded with delegate, regions found, OCR runs).

## Staging demo analyzer in Release builds (owner decision 2026-11-06)

- **Asked for:** a fallback that gives tyres a status (from tread-depth heuristics, or `Good`) when the tread status and damage models are missing. **Not built:** there's no depth model, so there is no depth to base a heuristic on, and a default `Good` would be an invented safety result shown as real.
- **Chosen instead:** `diagnosticsConfig.allowDemoAnalyzerInRelease` (`src/config/diagnostics.ts`), currently **on** for staging. While `tread` or `damage` is missing from the manifest, `createAnalyzer` gives Release builds the demo analyzer. Inspections are saved with `demo-1`, so Tyre result, Inspection progress, Home, History, the report and the PDF all show `Demo data`. Capture, sidewall OCR and the tread wear check run for real on the captured frames, so the Tread Pattern card and the report's wear lines are real model output inside a demo-labelled inspection.
- With the flag off (store builds): unchanged, `Analysis pending`. Once the real tread and damage models are in the manifest, the flag is ignored and the real analyzer runs.
- **Mixed inspections:** the `Demo data` label comes from `inspection.analyzerVersion`, set when the inspection starts. An inspection started without the flag (`tflite-unconfigured`, tyres pending) and resumed with it on would otherwise get demo results with no label. `AnalysingScreen` now switches the inspection to the demo version before saving a demo result into it (`store.setAnalyzerVersion`). An inspection with any demo result is labelled demo as a whole.
- It never turns on capture simulation (still `__DEV__` only). CLAUDE.md's demo rule now names this exception. The release checklist requires the flag to be off.

## M7 Phase 3b: tread wear model replaced with SSDLite (2026-11-10)

**Status: unit-tested against the real file's tensors and synthetic outputs. Not run on a phone.**

### Why
- The YOLOv8 `tread_wear.tflite` was Ultralytics AGPL-3.0 (release blocker, Phase 3). The owner replaced it with torchvision `ssdlite320_mobilenet_v3_large` trained on a tyre wear dataset.
- **Licences (owner, 2026-11-10):** model code torchvision BSD-3-Clause; dataset from Roboflow under CC BY 4.0. **The AGPL blocker is cleared for the tread wear model only.** ~~`tyre_detector.tflite` (sidewall text detector) is still Ultralytics YOLOv8 AGPL-3.0 and still blocks release (Phase 2a).~~ Removed later on 2026-11-10 ("Sidewall text without a detector").
- **CC BY 4.0 attribution (owner, 2026-11-10):** dataset title, provider and notice text recorded in `docs/LICENSES.md` and `src/config/licenses.ts` (`LICENSE_NOTICES`). Creator (`smart-inspection`) and URL (`https://universe.roboflow.com/smart-inspection/tire-tread-wear`) supplied by the owner 2026-11-10; the attribution is complete. The `tyre_detector.tflite` replacement is scheduled as its own milestone before App Store submission.

### What the file is (read from the file, 2026-11-10)
- Converted with onnx2tf. Input `input` `[1, 320, 320, 3]` **NHWC** float32. The export notes said NCHW `[1, 3, 320, 320]`; onnx2tf changed the layout, and the manifest follows the file.
- Outputs, in order: `raw_boxes` `[1, 3234, 4]` and `raw_scores` `[1, 3234, 16]`, float32, not quantized. No metadata or labels in the file.
- No ImageNet mean/std constants in the graph. That fits the owner's statement that the input is plain 0–1, but doesn't prove it: a converter can fold the normalisation into the first convolution's weights.

### Values (owner answers, 2026-11-10)
- Labels: 16, index 0 `background`, then `center_wear` … `normal_even_wear` (owner's labels.json).
- Preprocessing: plain stretch to 320 × 320 (no letterbox), RGB / 255, no ImageNet mean/std (the torchvision transform was left out of the export).
- Scores: softmax is in the graph, so the app doesn't apply it again (`scores: 'probabilities'`).
- Anchors: stock torchvision `DefaultBoxGenerator([[2, 3]] * 6, min_ratio=0.2, max_ratio=0.95)` on 20², 10², 5², 3², 2², 1² maps, 6 per cell = 3234. Box coder weights (10, 10, 5, 5) and dw/dh clamp log(1000/16), as in torchvision `BoxCoder`.
- Filtering: argmax over classes 1–15 per anchor (background never reported, even when it scores highest), confidence ≥ 0.35, greedy per-class NMS at IoU 0.45, at most 300 boxes.

### Code
- `manifest.ts`: new `SsdDetectorManifestEntry` (`outputFormat: 'ssd_raw'`, named outputs, anchor and box coder settings). `treadWear` moved from `YOLO_MODELS` to `SSD_MODELS`. The loader validates the entry (label count vs score shape, anchor count vs output shape, box coder) and checks both output tensors by name, type and shape at load. Swapped or missing outputs fail as `manifest_mismatch`.
- `inference/tensorUtils.ts`: `ssdDefaultAnchors` / `decodeSsdDetections`, shared, with no model values in the code. The sidewall YOLO decoder is unchanged.
- `TreadWearDetector`: same after-capture flow (never in a frame processor, spec §4.15). Feeds a stretched NHWC tensor and maps boxes back to frame pixels by scaling x and y separately.
- `tyre_detector.tflite`, the sidewall OCR and ML Kit are untouched.

### Product rules (owner decisions, 2026-11-10)
- **Titles only for now:** `TREAD_WEAR_PRESENTATION` is empty, so titles are cleaned-up class names (`center_wear` → `Center Wear`), with no cause or advice. At ≥ 0.60 the recommendation is `Get this checked as soon as possible.` Owner wording will follow. The old 2026-11-06 wording was for classes that no longer exist and was removed.
- **`normal_even_wear` is never a finding.** It's dropped before severity and titles, so a tyre with only that class shows `Normal Wear Distribution`. Other classes found with it still count. (The owner's wording, "if the top detection is `normal_even_wear` … treat the tyre as defect-free", would also hide a weaker defect such as exposed cords found in the same scan. The safer reading was chosen; **confirmed by the owner 2026-11-10.**)
- **Damage classes raise the tyre status** (`TREAD_WEAR_STATUS_RULES`). This reverses the 2026-11-06 rule that wear never changes the status:
  - `exposed_cords`, `sidewall_bulge` at ≥ 0.50 → at least **Replace now**.
  - `cracking_dry_rot`, `puncture_object` → at least **Replace soon**. The owner gave no confidence value for these, so any detection that passes the model's 0.35 threshold counts; **confirmed by the owner 2026-11-10.**
  - The status is only ever raised, never lowered (`withTreadWear`, `TreadWearRecord.minimumStatus`). A raising finding is shown first, ahead of stronger wear patterns, and makes the severity `critical`. Records saved before this change have no `minimumStatus` and leave the status alone.
  - Because the status changes, the report headline can now say a tyre needs replacing because of this model. (Before, wear could only add the advisory line.)
  - **Staging demo builds:** the status being raised is the demo analyzer's made-up status. The result is still labelled `Demo data` everywhere, but a real `Replace now` from this model then sits inside a demo inspection. **Owner confirmed 2026-11-10:** intended, so real defects can be tested on a phone in staging builds.

### Needs a real phone
- Loading with Core ML (iOS) and the GPU delegate (Android), then CPU fallback. onnx2tf graphs sometimes have ops these delegates don't support.
- **Normalisation and box decoding on real tread frames:** boxes should land on the worn or damaged areas. If every frame shows nothing, or only `background`/`normal_even_wear`, check the 0–1 input first (ImageNet mean/std may be needed).
- The 0.35 / 0.45 / 0.50 values on real tyres, and false Replace-now rates for exposed cords and bulges (they now change the status).
- Time, memory and heat for 10 frames at 320 × 320 on a low-end Android phone.

## M7 Phase 3c: tread wear model retrained on Adtronics Tire Crack Detection v19 (2026-11-12)

**Status: unit-tested against the real file's tensors. Not run on a phone.**

### What changed
- The owner replaced `assets/models/tread_wear.tflite` with a new checkpoint of the same architecture (torchvision `ssdlite320_mobilenet_v3_large`, BSD-3-Clause), trained on the Adtronics Tire Crack Detection v19 dataset (6,359 images). Manifest version `ssdlite320-mobilenetv3-large-adtronics-crack-v19-2026-11-12`; file SHA-256 `23422e7dcdc5e064e4fbafe0f9567786b125b0fbb7e9fbb795e758418d4a9871` (recorded in the manifest comment; no hash is checked at runtime).
- **Read from the file:** input `input` `[1, 320, 320, 3]` NHWC float32; outputs `raw_boxes` `[1, 3234, 4]` and `raw_scores` `[1, 3234, 16]` float32. Same as Phase 3b, so every manifest value (preprocessing, anchors, box coder, 0.35 / 0.45 / 300) is unchanged and `manifest.test.ts` passes on the new file.

### Class mapping (owner, 2026-11-12)
The dataset's classes were mapped onto the existing 16-class layout at training time. Index 0 is still `background`.

| Dataset class | Index | App class | Effect (existing `TREAD_WEAR_STATUS_RULES`) |
|---|---|---|---|
| `Bulge` | 11 | `sidewall_bulge` | at least **Replace now** |
| `Crack`, `Fine Crack` | 13 | `cracking_dry_rot` | at least **Replace soon** |
| `Nail` | 14 | `puncture_object` | at least **Replace soon** |

The status is raised only after `TREAD_WEAR_CONSENSUS`: the class must be found at ≥ 0.70 in at least 3 frames of one scan (2026-11-11). That gate sits in front of the rule table's own values (0.50 for bulges, any detection ≥ 0.35 for cracks and nails). Below it, the finding is shown as `Wear pattern found` with the `Beta / Model Unverified` note and the status is not changed.

- The other 11 non-background indices (`center_wear` … `diagonal_wear`, `exposed_cords`, `normal_even_wear`) are **untrained in this checkpoint** and should not fire. They stay in the labels, because the score tensor still has 16 columns, until the owner merges more datasets.
- **No code change:** the mapping matches the existing labels and status rules. `treadWearLabels.test.ts` pins the three indices.
- **Severity wording:** the owner described cracks as "moderate/warning". The app has no such level. Severity is `none` / `detected` / `critical` (≥ 0.60, and only after the `TREAD_WEAR_CONSENSUS` agreement across frames). The tyre status (Replace soon) is what carries the warning. No new level was added.
- **No-finding title (owner decision 2026-11-12):** `NORMAL_WEAR_TITLE` is now `No Surface Defects Detected` (was `No Abnormal Wear Pattern Detected`). This checkpoint finds surface defects (cracks, bulges, nails), not alignment wear patterns, so the old wording claimed a check the model doesn't do. It is used on the tread wear card badge, the Wear pattern row, and the report and PDF wear line. Records saved earlier keep their saved title. Revisit when wear-pattern classes are trained again.

### Licence
- Dataset attribution replaced in `docs/LICENSES.md` and `src/config/licenses.ts` (title, creator `Adtronics (adtronics-pmfgf)`, source URL, CC BY 4.0, owner notice). The smart-inspection Tire Tread Wear notice was removed, since that dataset no longer trained the shipped file. **Owner to confirm** that this checkpoint was trained from torchvision's weights, not fine-tuned from the 2026-11-10 smart-inspection checkpoint. If it was fine-tuned, the smart-inspection attribution must come back.

### Needs a real phone
- Detections on real cracked, bulged and punctured tyres, and false Replace-now rates for bulges on normal sidewalls.
- The iOS CPU-only setting (`acceleration: { ios: [] }`) and its timing, measured again for this file.

## Third-Party Licenses overlay (owner decision 2026-11-10)
- **No new screen.** The app keeps the spec's 21 screens. There's no Settings or About screen or modal to add to, so the notices open in a bottom-sheet `Modal` (`src/components/LicensesModal.tsx`), an overlay, not a navigation route.
- **Entry point:** a small `Third-Party Licenses` text link (caption, secondary text, 48 pt touch target) at the bottom of Home, below Recent inspections. **This differs from `06-home.png`**, which has no such link.
- **Content:** `LICENSE_NOTICES` (`src/config/licenses.ts`): the tread wear model's dataset (CC BY 4.0, creator, source URL, the owner's notice; Adtronics Tire Crack Detection v19 since 2026-11-12), torchvision (BSD-3) and Inter (OFL 1.1). Same list as `docs/LICENSES.md`.
- **No network:** URLs are selectable text, not links. The app opens nothing and fetches nothing.
- Theme tokens only. The backdrop is the black token at 50% alpha.
- **Needs a real phone:** sheet height and scrolling with large text, VoiceOver focus staying inside the sheet, and swipe or back-gesture dismissal on Android.

## Sidewall text without a detector: `tyre_detector.tflite` removed (owner decision 2026-11-10)

**Status: unit-tested with mocked ML Kit results. Not run on a phone since the change. The device-proven 2026-11-06 results came from the detector pipeline, so sidewall reading must be re-tested on real tyres.**

### Why
- `assets/models/tyre_detector.tflite` (Ultralytics YOLOv8n sidewall text detector) was AGPL-3.0, the last copyleft release blocker. The owner deleted the file and asked for the sidewall to be read by ML Kit alone.
- Bundled models are now `tread_wear.tflite` only (torchvision BSD-3-Clause; dataset CC BY 4.0). ML Kit Text Recognition is Google's on-device SDK through `rn-mlkit-ocr` (MIT wrapper). The ML Kit SDK's own terms still need checking in the release licence review.

### New flow
Saved sidewall frame (full resolution, cropped to the guide) → `recognizeLines` (`rn-mlkit-ocr`, Latin, bundled, on-device) → `filterSidewallText` (`src/ml/sidewallTextFilter.ts`) → 2-frame agreement → suggestions on Sidewall captured → the user confirms or corrects.
- **Library kept: `rn-mlkit-ocr` 0.3.1** (spec §8), not `@react-native-ml-kit/text-recognition` as the request named. It's the same ML Kit recogniser, already in the build and on device, so there's no new package, no compatibility check and no substitution.
- **Size:** spec §5 `parseTyreSize` (`TYRE_SIZE_PATTERN`, now exported) per line, within `FULL_FRAME_SIZE_LIMITS`. It covers `205/55R16`, `195/65 R15` and `225/45ZR17`. The request's `[R|r]` regex would also match `|` and miss `ZR`, so it wasn't used. With several matches in a frame, a size followed by a load/speed index wins, then the taller line, then reading order (`rankedSizeCandidate`). With none, split lines are joined by `recoverSize` (width/aspect plus a rim on the same or an adjacent line; rim-gated width exception unchanged).
- **Load/speed index:** 2–3 digits (or dual `121/118`) and an ISO speed symbol (not I, O or X), right after the size or after the size's rim on a split line. Load index at most 279 (the ISO table's range). **Only used for ranking and logs. It isn't a sidewall field** (spec §5 / screen 14 have four fields), so it isn't shown or saved. Showing it needs a spec and screen change.
- **DOT/TIN:** `fullFrameDotCandidate`, unchanged: the word `DOT`, then 8–13 letters and digits ending in a valid week/year (O→0 first date-code exception unchanged). The request's `DOT\s?[A-Z0-9]{4,13}` was not used. The 8-character minimum for whole frames is the earlier owner decision, because a lone `DOT 2319`-length read on a busy frame is too loose. The single-date-code rule across frames still applies.
- **Make:** `fullFrameMakeCandidate`, unchanged: a `tyreBrands.ts` name read exactly as a whole word, kept as read. The list already has every brand the request named. `General` stays as `General Tire` only, as before.
- **"Prioritise higher OCR confidence": not possible as written.** `rn-mlkit-ocr` returns no confidence values. Ranking uses the load/speed index and text height instead.

### Lost with the detector (CLAUDE.md rules, not choices)
- **Model is no longer suggested.** It needed a detector `Model` crop; picking the model from a whole frame would be a guess. The user types it.
- **Fuzzy and logo-fragment brand matching** (Levenshtein 1, `Ontnem` → Continental) is gone. CLAUDE.md allows it only inside a detector `Brand` crop. On the 2026-11-06 Continental test tyre the full frame read `iental`, so Make will likely be `Not read` on that tyre now.
- **DOT crop marker clean-up** (`D0T`, `DQT`, `1D0T`) is gone. It was crop-only. A misread `DOT` word now means no whole-frame DOT read.
- **Size+Model band crop and lengthened Size crop** are gone. On the test tyre the size came from those crops (the full frame read `A95/55` with no adjacent rim), so Size may also be `Not read` there.
- Removed code: `sidewallTextDetector` manifest entry, `YoloDetectorManifestEntry`, `YOLO_MODELS`, `decodeYoloDetections`, `createSidewallTextDetector`, `detectionToFrameRect` / `ocrCropRect` / `extendAlongText`, `SidewallTextRegion`, `AnalysisModels.sidewallText`, `PipelineDeps.onSidewallTextRegions`, the crop OCR config values (`sidewallRegionMarginRatio`, `sidewallMinCropPx`, `sidewallSizeExtraLengthRatio`), and the crop parsers (`sizeCandidate`, `nameCandidate`, `brandCandidate`, `fieldCandidate`, `nearSameModel`). Kept: generic letterbox preprocessing and NMS (tested with a synthetic entry), and `tyreDetector: null`, the spec's separate YOLOX-Nano preview detector, which was never this file.
- `SidewallReadOutcome` is now `{ status: 'done', suggestions, ocrRuns }`. The screen only reads `suggestions`.

### Demo analyzer
- Unchanged. `createAnalyzer` still picks the demo analyzer in development, or in Release with `allowDemoAnalyzerInRelease`, while the tread and damage models are missing, labelled `Demo data`. It never read sidewall text.
- **Not done:** filling sidewall fields with demo values when no tyre text is read (a reading of the request). That would show made-up OCR values as if they were read, which CLAUDE.md forbids. Unread fields stay `Not read`, and the user types them.

### Needs a real phone
- Whole-frame ML Kit accuracy on moulded black-on-black sidewall text, across several tyres and brands, on iOS and Android. Expect fewer suggestions than the detector pipeline gave on 2026-11-06.
- Whether the 2-frame agreement and 24-run cap still fit (one OCR run per frame now, so at most one run per saved frame).


### iPhone 13: every sidewall field `Not read` (2026-11-10, round 1 fixes)
**Status: unit-tested. Not yet re-run on the iPhone 13. The cause isn't known yet: the new logs are there to find it.**
- **Raw text logging (TEMPORARY, owner request):** each ML Kit read logs its raw lines (text and height), the saved frame's pixel size, the parsed values, and a reason for each empty field (`explainRejections`: regex mismatch, outside the size limits, width/aspect without a rim, DOT line too short or bad date, no listed brand). At the end, each field that wasn't suggested logs whether no frame read it or the reads disagreed. These logs go through `sidewallLog`, which `diagnosticsConfig.sidewallOcrLogs` keeps on in every build, so they reach the Xcode console. This reverses the earlier rule that whole-frame text is never logged, so the flag must be off for store builds (already on the release checklist). **Update 2026-11-10:** the flag is now `__DEV__`, so these logs are development-only (see "iPhone 13 verification" below).
- **Centre crop before ML Kit (owner value 0.6, UNCALIBRATED):** saved frames are already cropped to the guide, so this takes the central 60% of the guide crop (`ocrConfig.sidewallCentreCropRatio`), written to a temporary JPEG with Nitro Image and deleted after OCR. The idea is that ML Kit scales small images up, as with the old detector crops. That's **unverified on iOS**. If the crop gives nothing still needed, or fails, the whole frame is read too (up to 2 OCR runs per frame, still capped at 24).
- **Size without 2-frame agreement (owner decision 2026-11-10):** this reverses the 2026-11-06 removal of the 1-frame relaxation, **for size only**. With no 2-frame agreement, the size read in the most frames wins; ties go to a read with a load/speed index, then the longer value, then the earliest frame (`bestSizeRead`). It's always one real read. With divergent single reads (`205/65 R16` vs `205/55 R16`, no load/speed on either) the earliest wins, which may be the wrong one. The user confirms. DOT keeps its date-code-only rule, and make still needs 2 frames.
- **Deferred (owner decision 2026-11-10):** fuzzy or substring brand matching on whole frames, O/D→0 in DOT/TIN, and l/I→1 in sizes all conflict with CLAUDE.md. The owner chose to decide after seeing the iPhone 13 raw-text logs. Brand matching was already case-insensitive.

#### iPhone 13 logs: round 2 rules (owner decision 2026-11-10)

The `[SidewallOCR]` logs showed that ML Kit reads text on the test tyre (Continental 195/55 R15 85V), but the filter rejected it. The owner approved three rule changes, which are also added to the CLAUDE.md exceptions:

- **Make, brand roots** (`BRAND_ROOTS` in `src/ml/sidewallTextFilter.ts`). When no listed brand is read whole, a token containing `TINENTAL`, `ICHELIN`, `BRIDGEST` or `GOODYEAR` (any case) gives Continental, Michelin, Bridgestone or Goodyear. There's no edit distance, and adding roots needs owner approval. Of the logged fragments, only `tinentals` matches; `inental`, `nentalY`, `ienla` and `Lental` still give nothing. An exact whole-word read is still preferred and kept as read.
- **Size, rim token and window** (`recoverSize` in `src/ml/ocr/sidewallFields.ts`):
  - A rim may have the load/speed index glued on (`R1585V`) or a digit before it (`3R1525V`).
  - A full width/aspect is joined with a rim up to two lines away, nearest first.
  - The width hundreds-digit inference still needs the rim on the same or an adjacent line, as CLAUDE.md says.
  - `S5815 85v` and `R58SV` contain no usable `R` rim, so they still give nothing; the rim isn't guessed from `5815`.
  - The aspect is kept as read: `195/56` stays `195/56`, and the user corrects it.
- **DOT marker** (`DOT_MARKER` in `src/ml/ocr/parsers.ts`):
  - `D0T`, `OOT` and `DTS` (which also covers `0DTS` and `ODTS`), glued or not, are now accepted as the DOT marker along with the word `DOT`.
  - This only finds where the TIN starts. The TIN is kept as read and still needs 8–13 letters/digits ending in a valid week/year, plus agreement across two frames.
  - Risk: if `DTS` was really `DOT` followed by a TIN starting with `S`, that `S` is dropped. The user confirms the value.
- Still off: O/D→0 anywhere else in DOT/TIN, and l/I→1 in sizes.

#### iPhone 13 logs: round 3 rules (owner decision 2026-11-10)

The first size was suggested (`195/35 R15`, misread from `LLSS I95/35 R15`), but the true size and the make were still missed. The owner approved these changes, also added to CLAUDE.md:

- **More Continental roots:** `NENTAL` and `TINEN` (5 letters, below round 2's minimum of 6). This covers `ntinenals`, `tinenlal`, and now also `inental` and `nentalY`.
- **Model-family word** (`MODEL_FAMILY_BRANDS`): a token containing `CONTACT` gives Continental. It's tried last, after brand names and roots. Risk: any other brand's model with "Contact" in its name would be labelled Continental. The user confirms the value. `Comfortc` and `coniactc` don't contain `CONTACT`, so they still give nothing; matching those would need fuzzy matching, which wasn't approved.
- **`B` as the rim marker** in split sizes (`5B15 85VE C`). The joined size is always written with `R`. `95/55` + `5B15` gives `195/55 R15` through the existing rim-gated width rule.
- **Make from a single frame:** the same rule as size (`bestSizeRead`: most frames, then the longer value, then the earliest frame). DOT/TIN still needs 2 frames, except for the date-code rule.
- **Not done: preferring aspect 55 over 35.** That would need a table of how common each size is, and CLAUDE.md doesn't allow inventing those values. On these logs `195/55` (frame 3) and `195/35` (frame 4) are each read once with equal scores, so the earlier frame wins and `195/55 R15` is suggested. If the frames came in the other order, `195/35` would win. A frequency-based prior needs a size list from the owner.

#### iPhone 13 logs: round 4 size rules (owner decision 2026-11-10)

Make now works on the device. These rules cover the size reads that were still missed:

- **Slash-less sizes** (`COMPACT_SIZE_PATTERN` in `src/ml/ocr/parsers.ts`): 5 digits then a rim marker and a rim from 13 to 22 on the same line, such as `19555 R15` → `195/55 R15`. The width must be 160–295 and end in 0 or 5. The aspect must be 30–75 and end in 0 or 5, which is stricter than the owner's regex: that allowed aspects like 33, and real aspects are multiples of 5.
- **Slash-less short width** (`COMPACT_SHORT_SIZE_PATTERN`): `9555 R15` → `195/55 R15`, only through the existing rim-gated width rule (R13–R17, widths 175–225). `9335 R15` stays empty: no allowed width ends in 93, and making it `195/55` would mean changing two characters.
- **`8` read as `R`** (`RIM_TOKEN_8` in `sidewallFields.ts`): only for rims 13–22, only when nothing is glued before the `8`, and only when a letter or a load/speed index follows directly. So `815W5V`, `815 85V` and the 2026-11-06 device line `81545Vt` count, but a bare `815`, `815 KG` and `5815 85V` don't. In slash-less sizes the `8` needs a space before it (`19555 815`): `19555815` is not split.
- `195/ER` + `815W5V` stays empty, because the aspect was never read and is not invented.
- The load/speed index is still used only for ranking and is never rebuilt (`W5V` doesn't become `85V`).

#### iPhone 13 logs: round 5 size rules (owner decision 2026-11-10)

- **Already handled, no change:** a trailing letter (`195/55 p`) never blocked the width/aspect. That frame failed only because no rim was read nearby. `195/55 p` + `55 R15` and `195/55` + `85 R1585VC` already gave `195/55 R15`.
- **`l`/`I` for the `1` of a rim** (`RIM_TOKEN_L1`): `Rl565V` and `RI585V` → R15. Only rims 13–19, and only when a load/speed index follows directly. A lone `Rl5` doesn't count, and `95/56 Ri` + `S85VE` stays empty because no rim digit was read. This is the only l/I→1 rule; it doesn't apply anywhere else in a size.
- **`55 R15` + a width on its own line** (`joinAspectRimWithWidth`): a line holding only `195` or `195/`, directly before or after, is joined as read. `95/` is completed only by the rim-gated width rule. A bare `95` isn't used, because it could be a load index.
- **Not done:**
  - Taking the width from a nearby brand or model (`Continental` + `55 R15` → `195`). Continental makes several widths in 55 R15, so that would be a guess.
  - A bare `15` or `815` as a rim, because any number could match.

#### iPhone 13 logs: round 6 size rules (owner decision 2026-11-10)

- **Rim marker split across lines** (`joinMarkerWithRimDigits`): a line ending in width/aspect plus `R`, `B` or `ZR` (`195/55 R`) is joined with rim digits 13–22 at the start of the very next line (`158s`, `15`, `15 85`, `1585V`). `B` is written as `R` and `ZR` is kept. Four plain digits (`1555`, which could be a date code), digits two lines away, and digits before the marker don't count.
- **Not done: `o3/55 R15` → `195/55 R15`.** No width digits were read, so `195` would be made up; Continental also sells 175, 185 and 205 in 55 R15. The existing rim-gated rule fills in only the hundreds digit, and only when the last two width digits were read (`95/55`).

#### iPhone 13 logs: round 7 size rules (owner decision 2026-11-10)

- **`19555` on its own line** (`COMPACT_ALONE`): joined with a marked rim (R, B or 8 as before, or Rl/RI) within two lines, or with an unmarked rim plus load/speed index at the start of the very next line (`1585V6:`, `15 85V`; `RIM_LOAD_UNMARKED_AT_START`). A bare `15` doesn't count.
- **Space, dot, dash or `)` instead of the slash** (`SPACED_WIDTH_ASPECT`): only for a width 160–295 and an aspect 30–75, each ending in 0 or 5. `195 55` + `R15` → `195/55 R15`. `A95 55` + `R15` → `195/55 R15` only through the rim-gated width rule, which needs a marked rim.
- **Not done: `A95 55` + `15` and `A95) 55 F` + `158`.** Each is missing the slash, the rim marker and a width digit at once. A size would be built from three loose numbers, and sidewalls carry many other numbers (load index, pressure, ply counts). The rim-gated width rule in CLAUDE.md needs "a rim R13–R17 read"; a bare `15` isn't one. Changing that would need the owner to amend the CLAUDE.md rule itself.

#### iPhone 13 logs: round 8 size rules (owner decision 2026-11-10)

- **`Rl5`/`RI5` loosened** (`RIM_TOKEN_L1`): the rim may now be followed by a lone speed symbol (`Rl5 V`, `RI5 H`), whitespace, or the end of the token, as well as by a load/speed index. Letters glued on (`Rl5VAN`) still don't count. Run 1 frame 8/8 (`195/55`, then `Rl5 V` two lines down) gives `195/55 R15`.
- **Size pieces joined across frames** (`sizeParts` in `sidewallFields.ts`, `dominantValue` in `sidewallReader.ts`): only when no frame in the scan read a whole size.
  - Each frame without a size gives its full 3-digit width/aspect (`195/55`, `195 55`, or `19555` alone on its line) and its rim, but only a rim with a load/speed index (`R15 85Vt`, `Rl565V`).
  - The width/aspect read in the most frames is joined with the rim read in the most frames. If either is tied, nothing is joined.
  - Not used: a stray `R15`, a bare `15`, or a two-digit width (`95/55`).
  - Risk: a width/aspect from one frame and a rim from another are taken to come from the same size marking. That's true when the whole scan is one tyre's sidewall. The user confirms the value.

#### iPhone 13 logs: round 9 DOT/TIN rules (owner decision 2026-11-10)

- **More marker misreads** (`DOT_MARKER` in `parsers.ts`): `TELDT` and `T1DT` anywhere, glued on. As whole tokens only: `D` + `0/O/Q` + `T/I/L`, or one or two of `0/O/Q` + `T/I/L` (`OT`, `0T`, `OOI`). The owner's regex used `\b` word boundaries, which matched none of the device samples (`oTELDT`, `OT1DT` are glued to letters and digits), so the glued forms are listed separately. Words like `TOTAL` or `POT` don't count (round 10 below later accepted `POT` as a whole token). The TIN after the marker is kept as read (`OT1DT IOES 2421` → `IOES 2421`; the user corrects `IOES`). `otS1OUUSs` and `100ULSS` have no date code, so they give nothing.
- **Single-frame DOT/TIN:** a valid marked read with no competing read in any other frame is now suggested whole, not just its date code. If frames read different TINs, the earlier rules still apply: an agreed date code only, or nothing.
- **TIN with no marker** (`markerlessTinCandidate`): accepted only with a strict shape:
  - 2 or more tokens, with a valid date code as the last token.
  - 8–13 letters and digits in all, with at least one letter before the date.
  - No load, pressure or grading word (MAX, LOAD, KG, LBS, PSI, kPa, TREADWEAR…).
  - It also needs **2 agreeing frames, never one**, and is used only when no frame read a marker.
  - This is stricter than asked, because sidewalls carry other 4-digit numbers that pass as dates (`600 KG (1323 LBS)` is week 13 of 2023). A wrong date code gives a wrong tyre age.

#### iPhone 13 + Redmi 13 logs: round 10 size lines and DOT markers (owner request 2026-11-11)

The logs on both phones read Make `Continental` but rejected size lines such as `195/55 3R585V`, `495/35 R1585VLT:` and `ES 195/55`, and never read a DOT marker. The owner asked for a parser calibration. What changed, and what was deliberately left as it was:

- **Size lines already handled (tests added, no code change):** `195/55 R15 85V`, `195/55 R1585VLt:`, `195/55 3R1585V`, `ES 195/55 3R1585VLT:` and `ES 195/55` with `R1585V` within two lines all give `195/55 R15`. `RIM_TOKEN` already accepts a stray digit before the `R`, the load/speed glued on, and trailing letters (`LT:`). Letters before the width (`ES`) were never a problem.
- **`195/55 3R585V` stays empty (CLAUDE.md):** the token is `R` + `5` + `85V`. The rim's `1` was not read, so making it `R15` would invent a digit. The request's "strip `3R` → `R` and extract the rim `15`" isn't possible from this text without that guess. The frame still gives `195/55` to the round-8 cross-frame parts join (`sizeParts`), which is how the device already arrived at `195/55 R15`.
- **`495/35 R1585VLT:` stays empty (CLAUDE.md):** the rim is read fine; the width `495` is outside `FULL_FRAME_SIZE_LIMITS` (100–395 mm) and the aspect was read as `35`. Neither is corrected. The frame gives `rim: 15` to the parts join.
- **Clearer rejection reasons** (`explainRejections`, dev logs only): a width outside 100–395 now says so (`width/aspect "495/35" read but the width is outside 100–395 mm`), instead of the misleading "no usable rim" text. The no-rim reason now says `no rim 13–22 read within two lines`.
- **DOT markers** (`DOT_MARKER` in `parsers.ts`): added `00T` glued to other text, unless a digit is directly before it (`1000T` is a number), and `POT` / `P0T` as whole tokens only (`P` read for `D`). This reverses the round-9 note that `POT` doesn't count. `TEAPOT`, `SPOT`, `POTS` and `TOTAL` still don't. `D0T` and `OOT` were already listed.
- **Marker-less TIN wrapped over two lines** (`markerlessTinCandidate`): a round-9-shaped TIN body (`EX2H 4KR`) followed by a line that is exactly one valid 4-digit date code (`3721`) is joined, as marked TINs already are in `fullFrameDotCandidate`. The body line must contain a digit and a letter (a plant/size code), so `OUTSIDE` above `1323` gives nothing. Still only when **2 frames agree** and no frame read a marker.
- **Tightening (both one- and two-line marker-less TINs):** a line with a width/aspect (`195/55`) or a rim with load/speed (`R15 85V`) is size text and is never a TIN, so `195/55 R15 1323` no longer passes the marker-less shape.
- **Not done: a bare 4-digit WWYY code as a DOT read.** The request asked for a fallback that accepts a lone 4-digit week/year (weeks 01–53, years 10–26) "near the bead/rim line or within the TIN crop". There is no TIN crop any more (the text detector was removed, "Sidewall text without a detector"), and in a whole frame nothing marks the bead line, so this would mean accepting any 4-digit number on the sidewall: `1323` from `600 KG (1323 LBS)` is week 13 of 2023, and a wrong date code gives a wrong tyre age shown as a result. It conflicts with CLAUDE.md ("never guess OCR values") and with the round-9 decision above. The two-line join is the conservative version of the same idea: a date code is accepted on its own line only when a TIN body sits directly above it. If the owner still wants the bare-code fallback, it needs an explicit CLAUDE.md exception and a UI label that the age is unconfirmed.
- Tests: `parsers.test.ts` (markers), `sidewallFields.test.ts` (round 10 size lines, wrapped TIN, guards), `sidewallTextFilter.test.ts` (reasons, markers), `sidewallReader.test.ts` (2-frame rule for the wrapped TIN; a bare number in every frame gives nothing). Not yet verified on a phone.

#### Screen-capture OCR noise: round 11 rim prefixes, unmarked rim lines, two-digit width across frames (owner request 2026-11-11)

The owner asked for three things from the screen-capture and device logs. Each was checked against the parser first; only the gaps changed.

- **Already handled (tests added):** `$815 85V`, `#815 85V`, `$81525NE` (a symbol is not a letter or digit, so the `8`-for-`R` rule already applied), `R1545V`, `3R15` next to a width/aspect, and `A95/55` or `I95/55` with a marked rim R13–R17 on the same or adjacent line (the one-non-digit prefix in `SHORT_WIDTH_ASPECT`).
- **`3815 85V`** (`RIM_TOKEN_8`): one `3` directly before the `8` marker is now allowed, at a token start, when a load/speed index or letter follows. Any other digit before the `8` still rules it out (`5815 85V`, the 2026-11-10 decision), as does a double `33815` or a bare `3815`. The owner's pattern `[$#3B8]?R?(1[3-9]|2[0-4])` was not used as written: it would make a bare `15` a rim and accept rims 23–24, both against earlier decisions.
- **Unmarked rim + load/speed line** (`RIM_LOAD_UNMARKED_LINE`, `1545V)`, `15 85V`, `1585V6:`): accepted when it is the whole line and nothing but non-letters follows the speed symbol, so `1323 LBS` and `MAX LOAD 1545V` don't count. It joins a full width/aspect on the previous line (the slash-less path already did this), and counts as a cross-frame rim part. Not used to complete a two-digit width within a frame: that still needs a marked rim (CLAUDE.md).
- **Cross-frame parts** (`sizeParts`): the rim part now also takes `8`-for-`R` rims with a load/speed (`RIM_8_WITH_LOAD`) and the unmarked line above. A two-digit width/aspect (`A95/55` → `95/55`) is returned separately when no 3-digit width was read in that frame.
- **Two-digit width completed across frames** (`completeShortWidthAspect`, `sidewallReader.ts`): when no frame read a 3-digit width, the most-read two-digit width/aspect is completed with the most-read rim part under the same gate as within a frame: rim 13–17, width 175–225 only, a tie on either part joins nothing, and any frame that read a 3-digit width/aspect takes precedence. **This changes the CLAUDE.md width-digit exception**, which until now required the rim on the same or an adjacent line; CLAUDE.md now records the cross-frame case as an owner decision of 2026-11-11.
- **Not done: `AO5/35` → 195 or 205.** `O` is a letter; turning it into `0` and then adding a hundreds digit would be two invented characters, and the request itself couldn't say whether it meant 195 or 205. The `O`→`0` swap is approved only for the first character of a DOT date code. `AO5/…` stays empty, as `o3/55 R15` already did.
- Tests: `sidewallFields.test.ts` (round 11 block; the round-8 and round-10 `sizeParts` assertions compare named fields since the result gained `shortWidthAspect`), `sidewallReader.test.ts` (cross-frame joins; rim gate, tie, 3-digit precedence, `1323 LBS` give nothing). Not yet verified on a phone.

#### Redmi 13 burst: size in the first frames, DOT in the last (owner report 2026-11-11, round 12)

- **Report:** in one 8-frame burst, frames aimed at the size block miss the DOT stamp and vice versa; the owner asked that `readSidewall()` keep the best read of each field independently and combine `make`, `size` and `dotTin` from different frames.
- **Finding:** the reader already does this. Each field has its own read list; a frame contributes whichever fields it read; the loop only stops when every field has agreed or the OCR cap is hit; and the single-read rules (size and make: best single read; DOT/TIN: one valid marked read with no competing read) apply per field at the end. New tests in `sidewallReader.test.ts` ("round 12") run an 8-frame burst with the size block in frames 1–4 and `DOT 16092UT 0124` in frames 5–8 (and reversed, and the DOT in one frame only) and get `{ make: 'Continental', size: '195/55 R15', dotTin: '16092UT 0124' }`. No reader code changed.
- **OCR cap:** `sidewallMaxOcrRuns` is 24 and a frame costs at most 2 runs (centre crop, then the whole frame when the crop gave nothing still needed), so 8 frames fit (16). The test asserts this bound.
- **If the phone still shows one field:** the `read done` log line (dev builds, `setSidewallDebug(true)`) carries `suggestions`, `cancelled` and `hitOcrCap`; each frame's `parsed`/`rejected` lines show which fields it read. Leaving the screen cancels the read, and Sidewall captured fills only fields that are empty and untouched (`applySuggestions`), so a field the user already edited keeps the user's value.
- **DOT marker noise (`DOT:tYe0e`):** punctuation anywhere around the marker was already dropped (`dotCandidate` replaces everything but letters, digits and spaces), so `DOT:16092UT 0124`, `DOT: 16092UT` + `0124`, `.D0T …` all read (tests added). `tYe0e` is letters and digits, not punctuation. Dropping it would be a guess about where the TIN starts, and with it the read is 16 characters, over the 13 of a TIN, so that line stays empty (CLAUDE.md). It also reads nothing when `tYe0e` is alone on the marker line and the TIN is on the next one. The owner can revisit this with the raw log line if it recurs.

#### Model from a listed family list (owner decision 2026-11-11, Redmi 13 logs)

- **Request:** ML Kit reads `ComfortContact`, `Comfort Contact` and `CC7` in most frames, but the model word was used only to infer Make. The owner asked for `suggestions.model`, a cross-frame combination of family and code, and auto-fill of the Model field.
- **Reverses:** "Model is never read from a whole frame" (2026-11-10, "Sidewall text without a detector"). The reason for that rule was that picking which free text is the model is a guess. The new rule avoids the guess the same way Make does: only a name from a list, read whole.
- **List:** `src/config/tyreModels.ts`: family names and variant codes for Continental, Michelin, Bridgestone, Goodyear and Pirelli (not exhaustive; edit freely). Codes are letters+digits, 3+ characters, unique across families, never bare numbers (`Primacy 4` is suggested as `Primacy`; `P7`, `4S` left out because they look like TIN plant codes). Everyday-word families were left out.
- **Matching** (`fullFrameModelCandidate`, `sidewallFields.ts`): whole word, any case, spaces optional between words and at camel-case joins (`Comfort Contact`, `COMFORTCONTACT`, `ECO CONTACT`), tallest line first; the value is the listed spelling. A family's listed code read as a whole token anywhere in the frame is attached. Fragments (`orContact`, `ComfortContacts`) and a code of another family never count. `fullFrameModelCode` also reports a code read without its family (`CC7` alone) for cross-frame use; it is never suggested alone.
- **Reader** (`sidewallReader.ts`): `model` is a read field like make: 2-frame agreement, else the best single read (most frames, then longer, then earliest), always a listed family. If the chosen model has no code and the most-read code from any frame belongs to that family, it is appended (`ComfortContact` + `CC7` → `ComfortContact CC7`); a tie between codes appends nothing. Disagreeing families follow the majority, never a mix.
- **UI:** no change needed. `applySuggestions` already fills every empty, untouched field including Model (`FIELDS`), and the Sidewall captured screen already renders it; the comment there was updated.
- **Diagnostics:** `explainRejections` now gives a `model` reason, and the filter reading carries `model` and `modelCode`.
- Tests: `sidewallFields.test.ts` (matcher, list invariants), `sidewallTextFilter.test.ts` (reading shape), `sidewallReader.test.ts` (cross-frame combine, code alone gives nothing, other-family code, tie, majority). Not yet verified on a phone.

#### Model family with OCR noise (owner decision 2026-11-11, Redmi 13 logs, round 2)

- **Logs:** `CC7` is read whole in most frames (`modelCode`), but the family comes out as `Comfortontact`, `ComiortContae`, `Comforto Contact`, `ComioriContac`, so the exact match failed and the code had nothing to attach to.
- **Rule** (`nearestModelFamily` in `sidewallFields.ts`, used by `fullFrameModelCandidate` after the exact match): on each line, every run of 1–3 consecutive letter tokens with the spaces removed is compared (Levenshtein) with each listed family's letters. Allowed distance by family length: 2 edits for 10+ letters, 1 for 6–9, exact only under 6; 3 edits for 12+ letters when one of that family's listed codes was read as a whole token in the same frame (`ComiortContae` + `CC7`). The closest family must be unique; a tie gives nothing. The value is always the listed spelling.
- **What this means in practice:** `Comfortontact` (1), `Comforto Contact` (1, compared as `COMFORTOCONTACT`), `ComfortContacts` (1) and `ComioriContac` (3, with `CC7`) give `ComfortContact`; `ComiortContae` alone (3, no code) gives nothing; `Comfort`, `Contact`, `orContact`, brand names and load/grading words are far from every family. The owner's suggested character-swap tables (`f`↔`i`, `rn`↔`m`) were not added: plain edit distance already covers those and keeps the rule a single number.
- **Make:** a matched model family (exact or noisy) names its brand, after the brand-name, root and `CONTACT` rules. This extends the 2026-11-10 "model-family word gives the brand" decision to every listed family.
- **Threshold values** are owner values, not calibrated on other tyres. The release checklist note from round 9 stands: test other brands before a store build, since a 2-edit match on a 10-letter name is loose.
- Tests: `sidewallFields.test.ts` (logged reads, limits per length, code-gated 3 edits, non-matches, `editDistance`), `sidewallTextFilter.test.ts`, `sidewallReader.test.ts` (three noisy frames + `CC7` → `ComfortContact CC7` with make, size and DOT). Not yet verified on a phone.

#### Model code glued to a family fragment (owner decision 2026-11-11, Redmi 13 frame 6)

- **Log:** `OntactCC7`: the end of `ComfortContact` and the code `CC7` read as one token, so the whole-token code pattern missed it and `model` stayed `ComfortContact`.
- **Rule** (`wholeTokenPattern` in `sidewallFields.ts`): a listed code may be preceded by letters (a fragment of the family name), but not by a digit, and nothing may follow it. `OntactCC7`, `ComfortContactCC7` and `CC7` give `CC7`; `CC70`, `1CC7`, `CC7X` and `Ontact1CC7` don't. The fragment itself is never used as the family: the family still comes from an exact or noise-tolerant family match in the same or another frame, and the code attaches to it there (`ComfortContact CC7`). A code with no family in any frame still gives nothing. The owner's `/[a-zA-Z]*(CC7|UC6|PC6)/i` was generalised to every listed code and given the no-digit-before and nothing-after limits.
- Tests: `sidewallFields.test.ts` (glued forms and the non-matches), `sidewallReader.test.ts` (noisy family in frames 1–2 plus `OntactCC7` in frame 6 → `ComfortContact CC7`; glued code alone in every frame → nothing). Not yet verified on a phone.

#### iPhone 13 verification and release logging (owner, 2026-11-10)

- **Device result (owner-verified, iPhone 13):** the SSDLite tread wear model runs on the device, and ML Kit sidewall OCR suggests Make `Continental` and Size `195/55 R15` on the test tyre (Continental ComfortContact, 195/55 R15 85V). The size came from the cross-frame parts join (round 8). Not covered: DOT/TIN, Android, and other tyres. These are still open on the release checklist.
- **Logging:** `diagnosticsConfig.sidewallOcrLogs` changed from `true` to `__DEV__`. Release builds no longer log any `[SidewallOCR]` line, including raw ML Kit text, parsed values and rejection reasons. Development builds keep them all for calibrating on new tyres. No separate timing or count metrics were kept for release: the per-read summary (`read done`, OCR run count) is a `sidewallLog` line too, so it's dev-only as well. `releaseGuards.test.ts` checks that a release build logs nothing.
- **Caution:** rounds 2–8 were tuned on one tyre. Before a store release, test sidewall OCR on other brands and sizes to check that the looser rules don't suggest wrong values.

#### Tyre result: Wear pattern row pending state (owner decision 2026-11-11)

- **Problem:** on Tyre result, the Wear pattern row showed the value saved with the result (`result.wearPattern`, possibly an initial or demo value) while the tread wear check was still running. It then switched to the model's title a few seconds later, so the row showed one reading and then flipped to another.
- **Decision (owner-approved):** while the check is idle or scanning, the row shows `Checking…` in the muted colour (`textSecondary`, the same colour as `Not read`). This matches the Tread Pattern & Wear card's busy state, and both come from one helper, `isTreadWearBusy`. Card and row show the final title in the same render, once the scan across all frames has finished (`wearPatternRowValue` in `TreadWearCard.tsx`).
  - The wording isn't in the spec or the screen images. It was added so the row never shows a value that is about to change, and so a placeholder isn't mistaken for a result. The muted colour marks it as a placeholder; status colours aren't used.
  - If the model can't run (`unavailable`), the row is left as it was, as before. The card says `Not checked`.
- **Frame drops (owner-approved):** `useFrameOutput` in VisionCamera v5 calls `console.warn` for every dropped frame when no `onFrameDropped` handler is given. With `dropFramesWhileBusy: true`, `frame-was-late` drops are expected, so they flooded LogBox during capture.
  - Both frame outputs now use `onFrameDropped` from `src/features/capture/frameDrops.ts`. It only counts drops, and `frameDropCounts()` reads the counts for diagnostics. It warns once in development builds for `out-of-buffers`, which usually means a frame wasn't disposed, and never warns in release builds.
  - `useTyreCapture` no longer calls JS for every passing frame. A run of `ok` frames is sent once. Every rejected frame is still sent, because the session counts rejections.
- **Device check:** still needed. Check that LogBox stays quiet during sidewall and tread capture, and that capture speed hasn't changed.

#### Camera buffers and `[TreadWear]` diagnostics (owner request 2026-11-11)

- **`out-of-buffers` warning on iPhone.** An `out-of-buffers` drop means the camera's buffer pool ran dry. The check against the code found:
  - Both worklets (`useTyreCapture`, `useTextScanner`) already disposed every frame in `finally`, including inactive, throttled, rejected and failed frames.
  - `HybridFrame.dispose()` invalidates the sample buffer and releases the planes.
  - `convertFrameToImage` renders a new `CGImage`, and Nitro's `dispose()` removes the native state. So no JS path left a camera buffer held.
- **What was tightened:**
  - Planes are released in `finally` if reading the luminance throws (before, the frame's own dispose covered this on iOS only).
  - If `scheduleOnRN` fails, an image that was never handed over is disposed and `busy` is freed.
  - Tests check that every path disposes the frame exactly once.
- **Per-output drop counts:** `frameDropHandler('tyre-capture' | 'text-scanner')`. If `out-of-buffers` happens again, the development warning names the output and includes its counts so far.
- **If it still happens on the phone,** the likely holder is native: Core Image's Metal texture cache inside `convertFrameToImage`, which can keep camera buffers after the image is freed. That would need a VisionCamera patch (e.g. a `CIContext` without cached intermediates) or fewer conversions. Neither is done without owner approval.
- **`[TreadWear]` logs** (`diagnosticsConfig.treadWearLogs: true`, set at start-up in `index.js`, using the existing `treadDebug.ts`):
  - Every line has a wall-clock timestamp.
  - Logged:
    - Scan start, with the saved frame count.
    - Each delegate tried (Core ML on iOS, then CPU) and why it failed.
    - The tensors fast-tflite allocated.
    - Per frame: decode and inference time, the highest raw score of each class, and every detection with its box.
    - The result across frames and the winning pattern.
    - When `scanTreadWear` resolves, and when the card and Wear pattern row change on screen.
  - Frames are referred to by index. No paths, plates or OCR text are logged.
  - On in all builds for phone verification. It must be off for store builds (release checklist).
- **Flow check:** capture saves the tread frames (`setTreadCaptured`), Analysing sets the result and replaces the route with Tyre result, and the screen's auto-scan runs on those frames. `Checking…` is shown until `scanTreadWear` resolves and commits its state. A cancelled or replaced scan never updates the state.

#### Tread wear model: CPU only on iOS (owner decision 2026-11-11, iPhone 13 logs)

- **Device result (owner-verified, iPhone 13):** `Checking…` held until the scan resolved. The card and Wear pattern row then changed to `Exposed Cords` in the same render, with no flicker. The critical finding was the one chosen.
- **Problem:** the Core ML delegate can't build an interpreter for `ssdlite320-mobilenetv3-large` ("Failed to create TFLite interpreter!"). The failed attempt took 2,033 ms before the CPU fallback. On CPU, inference is about 16 ms per frame.
- **Change:**
  - Manifest entries can now set their own delegates per platform (`acceleration`). That list replaces `ACCELERATION_BY_PLATFORM` for that model, and `[]` means CPU straight away.
  - The tread wear entry sets `acceleration: { ios: [] }`. Android keeps GPU, then CPU.
  - `validateManifestEntry` rejects unknown delegate names.
  - The `[TreadWear]` log says when a model uses its own delegates.
- **CPU path:** fast-tflite opens the model with no delegate (`TfLiteInterpreterCreate`, TensorFlowLiteC 2.17.0). TFLite then uses its default CPU kernels. Prebuilt TFLite applies XNNPACK to float models by default, which fits the 16 ms result, but nothing in our code or logs confirms it.
- **Revisit:** when the model file or `version` changes, measure Core ML again on a phone before removing the override.

#### Tread wear safeguards: unverified note, no escalation without consensus (owner decision 2026-11-11, Redmi 13 logs)

- **What happened (Redmi 13, 2404ARN45A, Android GPU delegate):** two scans of images shown on a screen. A tread close-up gave no detections (`Normal Wear Distribution`). A *sidewall* image in the tread step gave `camber_wear` on frames 1–6 (0.62–0.98) and at most 0.01 on frames 7–10, shown as `Camber Wear` / `Maintenance needed`.
- **Checked:** the 10 saved frames run on a Mac CPU with the same file gave the same scores (0.641, 0.858, 0.984, 0.922, 0.740, 0.981; background on 7–10), so decoding, the stretch and the GPU delegate are right. The false positive is the model's. Feeding −1…1 instead of 0–1 gave the same pattern on these frames and on 11 public tyre photos, so the normalisation question (torchvision's SSDLite transform rescales to −1…1; the owner said 0–1) is **still open** and the manifest is unchanged.
- **Staging note:** every wear finding (`detected` or `critical`) carries `Beta / Model Unverified`: next to the card badge, in the Wear pattern row (`Camber Wear (Beta / Model Unverified)`), and in the report and PDF wear line. One helper, `wearUnverifiedNote`, switched by `diagnosticsConfig.treadWearModelUnverified` (on). A result with no finding carries no note.
- **No finding:** the title is now `No Abnormal Wear Pattern Detected` (was `Normal Wear Distribution`; changed to `No Surface Defects Detected` 2026-11-12, see "M7 Phase 3c"), with the existing neutral check badge. It never escalates: severity `none`, no advice, status untouched. Records saved earlier keep the old title in the Wear pattern row.
- **Consensus (`TREAD_WEAR_CONSENSUS`, owner values, uncalibrated):** a class becomes `critical` (`Maintenance needed`), or raises the tyre status, only when it was detected at **≥ 0.70 in at least 3 frames** of one scan (`consensusFrames`, counted once per frame in `summariseTreadWear`). Without that it is still shown, as `Wear pattern found`, with no urgent advice and no status change.
  - This applies to every class, including the status rules of 2026-11-10. In effect `exposed_cords`/`sidewall_bulge` now need 3 × 0.70 instead of one detection at 0.50, and `cracking_dry_rot`/`puncture_object` need 3 × 0.70 instead of any detection at 0.35. The rule table itself is unchanged.
  - Records saved before this change keep their saved severity and status.
  - **Limit:** the sidewall scan above had 5 frames at ≥ 0.70, so this rule alone would still call it critical. It stops single-frame and weak flickers, not a consistent false positive. Only the note covers that until the model is validated.
- **Not done:** nothing checks that a tread frame shows tread (the tyre detector is still missing from the manifest).
- **Needs a real phone:** the longer Wear pattern row text on a small screen; real tyres in daylight.

### Device findings, Purfect KB-27 on a mounted tyre (2026-11-12)
- **Rotated OCR passes:** on the left and right arcs of a tyre on the car, the sidewall text runs vertically and the upright ML Kit passes read nothing. When the centre and whole-frame passes give no size, make or model, the whole frame is read again turned 90° clockwise, then 90° counter-clockwise (`SIDEWALL_ROTATIONS`, `sidewallReader.ts`), using nitro-image `rotateAsync` (physical rotation, no new library). Every pass counts toward `sidewallMaxOcrRuns`. The turn that worked is tried first on later frames. Rotated reads go through the same filter, so no OCR rule changes.
- **Rim spacing:** `185/65 R 15 88H`. The main size pattern already allowed it. The rim-token, rim + load/speed and slash-less patterns now allow any whitespace after `R`/`ZR`/`B` too.
- **Brands and models:** Purfect, Panther and Chaoyang added. GT Radial is still left out (see round 4). Model `KB-27` (Purfect) added, read as `KB-27`, `KB27` or `KB 27`. A hyphen in a listed family name is now optional, like a space.

### Staging log collector (2026-11-12)
- **What it does:** `src/utils/debugLogBuffer.ts` keeps the last 300 `[SidewallOCR]` and `[TreadWear]` lines in memory when `diagnosticsConfig.enableStagingLogs` is on, Release builds included. **Copy logs** on Tyre result and Sidewall captured copies them to the clipboard. Nothing goes to disk or the network. Console logging still follows `sidewallOcrLogs` / `treadWearLogs`, so a Release build still logs no raw OCR text to the device log.
- **Clipboard:** uses React Native 0.88's own `Clipboard` module, which is deprecated but still in core on iOS and Android, instead of installing `@react-native-clipboard/clipboard`. This means no new native dependency and no pod or gradle change. If a later React Native release removes it, switch to the community package.

## M7 Phase 2c: YOLO11n-seg sidewall text detector, Stage 1 (owner task 2026-11-13)

**Status: unit-tested against the real file's tensors and with synthetic outputs. Not yet run on a phone. Nothing fills a sidewall field from it yet (Stage 2+).**

### What the file is (read from the file, 2026-11-13)
- `assets/models/sidewall_detector.tflite` (11.7 MB; the task called it `best.tflite`, the owner bundled it under this name). Ultralytics 8.4.211 YOLO11n-seg, `task: segment`, `end2end: false`, trained on Roboflow `tyre-to-text` v3 (424 flat-tyre images, CC BY 4.0, see docs/LICENSES.md).
- Input `serving_default_args_0` **float32 `[1, 3, 640, 640]` (NCHW)**. Outputs **`[1, 40, 8400]`** (cx, cy, w, h, 4 class scores, 32 mask coefficients × 8400 anchors = 80² + 40² + 20²) and **`[1, 32, 160, 160]`** (mask prototypes), float32. Embedded `names`: 0 Brand, 1 DOT, 2 Model, 3 Size. These match the owner's spec exactly; `manifest.test.ts` checks them against the file.
- **Licence: AGPL-3.0** (file metadata, "Ultralytics"). This is the same copyleft blocker that led to `tyre_detector.tflite` being removed on 2026-11-10. The owner asked for this model to be integrated knowing the dataset licence; **the model licence is re-opened on the release checklist** and needs an owner decision (Ultralytics Enterprise licence, or a non-AGPL architecture) before any store build. The code written here (letterbox, decoder, NMS) is ours and does not depend on Ultralytics code.

### Manifest (`modelManifest.sidewallText`, new `YoloSegDetectorManifestEntry`)
- Letterbox on grey 114, RGB / 255, NCHW float32: the owner's spec and the Ultralytics defaults. The existing `letterboxPlan` / `padPixels` / `imageFileToModelInput` are reused unchanged.
- `boxFormat: 'cxcywh_normalised'`: the graph contains Ultralytics' `_NormalizeCoords` (Ultralytics scales TFLite boxes to 0–1 of the input). **Unverified on a phone.** The service reads the raw box range on every frame (`yoloSegOutputStats`, `inferBoxFormat`): if the values are clearly pixels (max > 1.5) it decodes as pixels and flags `overridden` in the log and on the card, so a wrong manifest value shows up instead of producing boxes 640× too large. Once a phone run confirms the range, the manifest value is fixed and the override stays as a guard only.
- **Thresholds are starting values, configurable in the manifest entry:** confidence 0.25 (Ultralytics default), IoU 0.45 (the owner's 2026-11-06 value; Ultralytics' own default is 0.7), 300 detections. The staging card and `detectFrame` accept overrides (`YoloSegDecodeOptions`) for tuning. The model saw only flat tyres, so expect to raise or lower the confidence after the phone test.
- Delegates: platform defaults (iOS Core ML then CPU, Android GPU then CPU). Whether Core ML builds this Segment graph is unknown; the loader falls back and logs the attempt. If Core ML fails and costs seconds like the SSDLite model did, set `acceleration: { ios: [] }` from the measurement.
- The loader validates the entry (attribute count = 4 + labels + mask coefficients, anchor count from the input size and strides 8/16/32, prototype channels, letterbox) and checks both output tensors by name, type and shape at load.

### Code
- `src/ml/inference/yoloSeg.ts`: `decodeYoloSegOutput` (attribute-major read, best label per anchor, scores used as output since the export applies sigmoid, clamp to the input, greedy NMS per label), `yoloSegOutputStats` (raw ranges for the readout), `inferBoxFormat`, `detectionToFrameRect` (undoes the letterbox, clips to the frame, drops boxes in the padding). Mask coefficients are kept on each detection for Stage 4; prototypes are only range-checked.
- `nonMaxSuppression` is now generic over the detection type (same behaviour).
- `src/ml/services/SidewallTextDetector.ts`: loads once, `detectFrame(frame, index, options)` → `done` (detections in input and frame pixels, timings, stats, tensors, delegate) | `unavailable` (model missing, with the loader's reason; or a `demo://` frame) | `failed`. Never throws. Every decoded image is disposed.
- `[SidewallDetector]` logs (`sidewallDetectorDebug.ts`, `diagnosticsConfig.sidewallDetectorLogs`, on): load, delegates, tensors, per-frame timings, ranges and boxes. Frames by index; no paths or text. Also kept in the staging "Copy logs" buffer.
- **Staging card** (`SidewallDetectorDebugCard`, `diagnosticsConfig.sidewallDetectorDebugCard`, on): shown at the bottom of Sidewall captured. One saved frame at a time (Previous / Next), the frame drawn with the detector's boxes in camera blue, each labelled `Brand 0.82` etc., and a monospace readout: model version, delegate and load time, frame size, letterbox geometry, decode / inference / post times, input and output tensor shapes, raw box range and the format used, best score per class, mask coefficient and prototype ranges, anchors above the threshold, and every detection's frame box. Labelled `STAGING · Diagnostics only`. It is not one of the 21 screens and renders nothing when the flag is off. **MUST be off for store builds** (release checklist).
- The whole-frame ML Kit flow (`sidewallReader.ts`) is unchanged and still produces the suggestions.

### Not done (later stages)
- Stage 2: crops with ~10 % padding from the saved frame → ML Kit at 0° and 180° → raw text per class on the card.
- Stage 3: crop text → the existing parsers (`sidewallFields.ts`, `tyreBrands.ts`, `tyreModels.ts`) under the CLAUDE.md crop exceptions, with tests.
- Stage 4: mask decode (coefficients × prototypes → sigmoid → min-area rectangle → warped, landscape crop; CLAHE only if a native binding exists without new heavy dependencies) behind a flag.
- Stage 5: review screen wiring, confidence, crop previews, fallbacks.

### Needs a real phone
- Does the model load, and on which delegate (iOS Core ML vs CPU; Android GPU vs CPU)? Load and inference time at 640 × 640 on iPhone 13 and Redmi 13.
- The raw box range (0–1 expected). If the card says `(manifest says cxcywh_normalised!)`, the manifest value is wrong and must be changed to `cxcywh_pixels`.
- Boxes landing on the real text on mounted tyres, and the confidence threshold that keeps the four classes without noise.
- Memory: 640 × 640 × 3 float32 input (4.9 MB) plus the 1.3 MB and 3.3 MB outputs per frame, on a low-end Android phone.
