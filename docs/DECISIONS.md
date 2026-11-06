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
- **ACTIVE RELEASE BLOCKER: licence AGPL-3.0** (Ultralytics, from the file's metadata). Spec §7: closed-source commercial use needs an Ultralytics enterprise licence. **Owner decision (2026-11-06): this model must be replaced (or licensed) before any commercial release.** It is used for development only until then.
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

**Status: unit-tested with a mocked detector and mocked OCR. Not run on a phone. The model is AGPL-3.0, an active release blocker (see Phase 2a).**

### Where it runs
- **On Sidewall captured, not in the post-capture analyzer.** Suggestions must reach the user before they confirm, and the analyzer only runs after tread capture (and only once tread and damage models exist). `SidewallCapturedScreen` calls `getSidewallReader()` (`src/ml/sidewallReader.ts`) when it opens. Screens never touch TFLite or ML Kit directly.
- Read results **only fill fields that are still empty and that the user hasn't edited** (`applySuggestions`). Values already saved for the tyre are never replaced. Filled fields stay editable: the screen's existing "Check the details and correct anything that's wrong" is the confirmation step, and pressing `Scan tread` saves what's shown.
- **New placeholder (differs from spec):** while reading, empty fields show `Reading…` instead of `Not read`, so a field doesn't claim "not read" and then fill in a moment later. It becomes `Not read` once reading ends with nothing, or as soon as the user edits that field.

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
- Detector missing or failing to load: no suggestions. The load is retried next time, and a loaded detector is reused.
- Detector error on a frame, crop/save error, OCR error, no text, or text that fails its parser: that region or frame is skipped.
- **No full-frame OCR fallback** when the detector is unavailable. Without regions, which text is the make or model would be a guess.

### Offline
- Everything runs on the phone: TFLite (bundled model), ML Kit Latin (bundled models), and files in app storage and caches. No new packages and no network calls.

### Needs a real phone
- ML Kit accuracy on cropped sidewall regions (moulded black-on-black text), and whether the 10% crop margin and 2-frame agreement are right.
- Time to read 8 frames (8 detector runs + up to 24 OCR runs) on a low-end Android phone. The `Reading…` wait has no limit other than the run cap.
- The detector and a later analyzer each load their own copy of the model (about 3.3 MB each). That's acceptable for now; share a loader if memory is tight.
