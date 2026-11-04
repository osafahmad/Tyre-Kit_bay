# Tyre Kit Bay: Build Specification

This file is the source of truth for the app. Screen images are in `docs/design/screens/`. The original design markup, including exact SVG artwork, is in `docs/design/source/`.

## 1. Product

**Name:** Tyre Kit Bay. Code identifier: `TyreKitBay`.

**Purpose:** A React Native app for iOS and Android that uses the phone camera to check tyre health. It identifies the vehicle (optional), captures each tyre, analyses the frames on the phone, and produces a shareable report.

**Users:** Tyre shop staff, mechanics, and fleet workers, often in bright or dim workshops and using one hand.

**Core decisions**
- All inference runs on the phone. No server is needed to scan or see a result.
- The app must work without internet after installation.
- Inspection data stays on the phone unless the user shares a report.
- Number plate and chassis number are optional.
- Don't copy another company's name, logo, artwork, or screens. Anyline was only a product reference.

## 2. Complete user flow

```text
First launch only: Welcome → Walkthrough 1 → 2 → 3 → Camera access → Home
Later launches:    Home

Home → Scan number plate (optional) → Confirm plate
     → Scan chassis number (optional) → Vehicle details
     → Select tyres
     → For each selected tyre:
         Sidewall capture → Sidewall captured → Tread capture
         → Frames captured → Analysing → Tyre result → Inspection progress
     → Final report → Home
```

Capture problems can open **Capture problem** from Sidewall capture or Tread capture.

### One-time walkthrough
- Store `hasSeenWalkthrough` in on-device storage.
- Set it to `true` when the user taps **Get started** on Walkthrough 3 or **Skip** on Walkthrough 1 or 2.
- If `true`, open Home on launch and remove Welcome and Walkthrough from the back stack.
- If the camera permission is missing when a scan starts, show Camera access first.
- Reinstalling or clearing app data can show the walkthrough again. That's expected.

## 3. Design system

Use the values below as theme tokens. Don't hardcode other colours in screens.

### Colours
| Token | Hex | Use |
|---|---|---|
| `black` | `#0A0A0A` | Headers, camera screens, primary text |
| `navy` | `#12357A` | Primary buttons, selected states, walkthrough background |
| `cameraBlue` | `#4DA3FF` | Scan guides and button borders on black |
| `white` | `#FFFFFF` | Content screens, text on dark |
| `border` | `#E3E6EB` | Dividers, card borders, inactive progress on white |
| `inputBorder` | `#AEB4BE` | Input and unselected control borders |
| `surfaceMuted` | `#F4F5F7` | Muted panels |
| `textSecondary` | `#5A606B` | Secondary text on white |
| `textBody` | `#4A505B` | Walkthrough body text |
| `textOnDark` | `#C7CCD4` | Secondary text on black |
| `cameraSurface` | `#17191E` | Camera viewfinder fallback |
| `darkLine` | `#2B2F36` | Lines and inactive progress on black |
| `darkLineStrong` | `#3A3F47` | Input borders and artwork on black |
| `darkMuted` | `#596170` | Secondary button border on black |
| `searchSurface` | `#1C1F24` | History search field |
| `illustrationBlue` | `#264C99` | Walkthrough car window only |

### Status colours
Use these only for tyre condition, and always pair them with text.

| Status | Background | Text |
|---|---|---|
| Good | `#E3F5EB` | `#14693C` |
| Replace soon | `#FBF0D5` | `#7A5408` |
| Replace now | `#FBE5E5` | `#932B2B` |

### Typography
Bundle Inter with weights 400, 500, 600, and 700. Use a monospace system font for chassis numbers.

| Style | Size / line height | Weight |
|---|---|---|
| Hero title | 44 / 48 | 700 |
| Result number | 44 / 52 | 700 |
| Walkthrough title | 32 / 38 | 700 |
| Screen title, light | 30 / 36 | 700 |
| Header title | 26 to 28 / 32 to 34 | 700 |
| Camera title | 24 / 30 | 700 |
| Sheet title | 22 / 28 | 700 |
| Body large | 17 / 26 | 400 |
| Body | 15 to 16 / 22 to 25 | 400 |
| Row label | 14 to 15 | 400 to 600 |
| Caption and badge | 12 to 13 | 500 to 600 |

Support Dynamic Type and Android font scaling without clipping important content.

### Layout and components
- Base frame: 390 x 844. Layouts must also work from 320 to 430 wide and on tablets.
- Use safe areas. Don't draw a fake status bar.
- Side padding: 20 to 24. Spacing follows a 4 and 8 point scale.
- Touch targets: at least 44 x 44.
- Radius: controls and cards 12, large cards 16, sheets 24 to 28, badges 999.
- Primary button: navy, white text, height 56, radius 12. On black add a 1 point `cameraBlue` border.
- Walkthrough button: height 58, radius 14.
- Text button: height 44 to 48. Navy on white and white on black.
- Icons: use one outline set. Preferred: `lucide-react-native`.
- Don't use gradients, glow, or decorative left-border cards.
- Give every status a label. Colour alone isn't enough.
- Respect reduced motion. Use haptics as a supplement, never the only feedback.

## 4. Screens

`Image` means the file in `docs/design/screens/`. `Source` means the file in `docs/design/source/`.

Prototype shortcuts in the design must not be copied into the real app:
- Report opens with a four-tyre sample even if fewer tyres were scanned.
- The next tyre returns to Left front tyre.
- Capture and Show result are manual to allow click-through.

### 01 Welcome
Image `01-welcome.png`. Source `Main.dc.html`.
- Black background, logo mark, large tyre artwork.
- Title: `Tyre Kit Bay`
- Text: `Check tyre condition, size, and age with your phone camera.`
- Button: `Get started` → Walkthrough 1.

### 02 Walkthrough: scan vehicle
Image `02-walkthrough-scan-vehicle.png`. Source `Walkthrough1.dc.html`.
- Navy hero, car and plate artwork, white bottom panel, step 1 of 3 progress.
- Title: `Scan the vehicle`
- Text: `Point your camera at the number plate and chassis number. Both are optional, so you can skip them.`
- Back → Welcome. Skip → Camera access. Next → Walkthrough 2.
- Support horizontal swipe as well as buttons.

### 03 Walkthrough: capture tyres
Image `03-walkthrough-capture-tyres.png`. Source `Walkthrough2.dc.html`.
- Tyre artwork and `Distance OK` pill. Step 2 of 3.
- Title: `Capture every tyre`
- Text: `Follow the on-screen guides for the sidewall and tread. The app tells you when each capture is done.`
- Back → Walkthrough 1. Skip → Camera access. Next → Walkthrough 3.

### 04 Walkthrough: see report
Image `04-walkthrough-see-report.png`. Source `Walkthrough3.dc.html`.
- Sample report card with `Good`, `Replace soon`, and `Replace now`. Step 3 of 3.
- Title: `Know what to replace`
- Text: `See each tyre's condition, size, rim diameter, and age. Then share the report in one tap.`
- Back → Walkthrough 2. `Get started` → Camera access. Save the walkthrough flag.

### 05 Camera access
Image `05-camera-access.png`. Source `Permission.dc.html`.
- Title: `Allow camera access`
- Text: `The camera reads number plates, chassis numbers, and tyres.`
- Notes: `Tyre scans are analysed on this phone.` and `Inspections work without an internet connection.`
- `Allow camera` shows the system prompt. After either answer, go to Home.
- `Not now` → Home.
- If permission is denied permanently, a later scan shows `Camera access is off`, `Turn it on in Settings to scan tyres.`, and `Open Settings`.

### 06 Home
Image `06-home.png`. Source `Home.dc.html`.
- Black header, logo, title `Ready to inspect`.
- Card: `New inspection`, `Scan the vehicle, then capture each tyre.`, button `Start scan`.
- `Recent inspections` shows the latest three saved inspections, with `View all` → History.
- Each row shows plate or `No plate`, date and time, tyre count, and worst status. Tap → Report.
- Empty state: `Your inspections will appear here`.
- Bottom tabs: Home and History.
- If an unfinished inspection exists, show `Continue inspection` before starting a new one.

### 07 History
Image `07-history.png`. Source `History.dc.html`.
- Title `History`, search field `Search number plate`.
- Group into Today and Earlier. Filter live and ignore case and hyphens.
- Row action opens Report.
- Empty state: `Your inspections will appear here`.
- No results: `No inspections match that plate`.

### 08 Scan number plate
Image `08-scan-number-plate.png`. Source `PlateScan.dc.html`.
- Label `Step 1 of 3`. Title `Scan number plate`. Subtitle `Optional`.
- Guide: `Place the whole plate inside the box`.
- Controls: Flash toggle, Capture, Type it. Skip at top right.
- Run OCR only inside the guide. When the same value repeats across three reads, vibrate and open Confirm plate.
- Capture is the fallback. Type it → Vehicle details. Skip → Scan chassis number.

### 09 Confirm plate
Image `09-confirm-plate.png`. Source `PlateConfirm.dc.html`.
- Title `Plate found`. Show plate and `Edit`.
- `Confirm plate` → Scan chassis number. `Scan again` → Scan number plate. Edit → Vehicle details.

### 10 Scan chassis number
Image `10-scan-chassis-number.png`. Source `ChassisScan.dc.html`.
- Label `Step 2 of 3`. Title `Scan chassis number`. Subtitle `Optional`.
- Guide: `Place the whole number inside the box`.
- Show `Move closer` when text is too small.
- Same controls as plate scan. Skip → Select tyres. Successful capture → Vehicle details.

### 11 Vehicle details
Image `11-vehicle-details.png`. Source `Vehicle.dc.html`.
- Title `Check vehicle details`.
- Editable fields: Number plate (optional), Chassis number (optional).
- Helper: `Some vehicles have fewer than 17 characters.`
- Links: `Scan plate again`, `Scan chassis number again`.
- Convert input to uppercase. Allow empty fields. `Continue` → Select tyres.

### 12 Select tyres
Image `12-select-tyres.png`. Source `TyreSetup.dc.html`.
- Label `Step 3 of 3`. Title `Select tyres to scan`.
- Number of tyres: 2, 4, or 6. Default 4.
- Changing the number selects all positions in that layout.

| Count | Positions, in scan order |
|---|---|
| 2 | Front, Rear |
| 4 | Left front, Right front, Left rear, Right rear |
| 6 | Left front, Right front, Left rear outer, Right rear outer, Left rear inner, Right rear inner |

- Each position toggles on or off. Selected is navy with white text. Unselected is white with black text.
- Button: `Scan 1 tyre` or `Scan N tyres`.
- If none are selected, show `Select at least one tyre` and block continuing.
- A custom count can be added later, but isn't in the first release.

### 13 Sidewall capture
Image `13-sidewall-capture.png`. Source `Sidewall.dc.html`.
- Show tyre name, `Tyre X of N`, `Step 1 of 2: sidewall`, circular guide, and status pill.
- Status messages: `Focusing…`, `Move closer`, `Move back`, `Hold steady`, `Too dark`, `Distance OK`.
- Guide text: `Fit the whole tyre inside the circle`.
- Controls: Flash toggle and Capture.
- Run the tyre detector during preview. Capture automatically when the tyre stays in position and quality passes. Save the best 5 to 10 frames.
- Success → Sidewall captured.

### 14 Sidewall captured
Image `14-sidewall-captured.png`. Source `SidewallDone.dc.html`.
- Title `Sidewall captured`. Text `Check the details and correct anything that's wrong.`
- Editable fields: Tyre size, DOT/TIN, Make, Model.
- If OCR can't read a field, leave it empty and show `Not read`. Never guess.
- `Scan tread` → Tread capture. `Scan sidewall again` → Sidewall capture.

### 15 Tread capture
Image `15-tread-capture.png`. Source `Tread.dc.html`.
- Show tyre name, `Tyre X of N`, `Step 2 of 2: tread`, status pill, direction arrows, and progress.
- Instruction: `Move slowly across the tread, from edge to edge`.
- Progress label: `Capturing frames` and percent.
- Progress = accepted tread frames / target frames. Target default: 10.
- Finish automatically at the target.
- `Finish sweep` is enabled once at least 5 clear frames exist. If tapped earlier, show `Keep going. A few more clear frames are needed.`
- `Having trouble` → Capture problem.
- Run heavy tread and damage models only after capture to limit heat and battery use.

### 16 Capture problem
Image `16-capture-problem.png`. Source `TreadRetry.dc.html`.
Show the real reason.

| Reason | Title | Tips |
|---|---|---|
| Dark | `Too dark to read the tread` | `Turn on the flash`, `Move more slowly`, `Wipe away mud or water` |
| Blur | `The frames are too blurred` | `Hold the phone steady`, `Move more slowly`, `Clean the camera lens` |
| Distance | `The tyre is out of range` | `Follow the distance message`, `Keep the tyre inside the guide` |
| Not found | `The tyre wasn't detected` | `Keep the tyre inside the guide`, `Try more light` |

- Primary: scan the same stage again.
- Secondary: `Skip this tyre` → Inspection progress and mark `Not scanned`.
- Open automatically if the target isn't reached after 20 seconds. Keep this value in config.

### 17 Frames captured
Image `17-frames-captured.png`. Source `TreadDone.dc.html`.
- Show large check, success haptic, title `Frames captured`, and `{Tyre name} is ready to analyse.`
- Rows: Sidewall and Tread clear-frame counts from real capture data.
- `Analyse tyre` → Analysing. `Scan tread again` → Tread capture.

### 18 Analysing on phone
Image `18-analysing-on-phone.png`. Source `Analysing.dc.html`.
- Title `Analysing tyre`. Text `{Tyre name} · Running on this phone`.
- Steps: `Sidewall details read`, `Tread checked`, `Checking for cracks and damage`.
- Advance automatically to Tyre result. Don't show the prototype's `Show result` button in production.
- If analysis fails, show `This tyre couldn't be analysed.` with `Try again` and `Scan this tyre again`.

### 19 Tyre result
Image `19-tyre-result.png`. Source `TyreResult.dc.html`.
- Header: tyre name, tread depth, status, `Average tread depth`.
- Rows: Tyre size, Rim diameter, Make, Model, DOT/TIN, Tyre age, Wear pattern, Cracks or damage.
- If `depthMm` is null, show the status as the main result and hide the mm value.
- Missing values show `Not read`.
- `Next tyre` → Inspection progress. `Scan this tyre again` → Sidewall capture for this tyre.
- Below the rows or in a help sheet: `Automated check. It doesn't replace a professional inspection.`

### 20 Inspection progress
Image `20-inspection-progress.png`. Source `Progress.dc.html`.
- Header: plate or `No plate`, `X of N tyres scanned`, segmented progress.
- Rows: scanned tyres show result and badge, next shows `Next`, remaining show `Waiting`, skipped show `Not scanned`.
- Primary: `Scan {next tyre} tyre`. If none remain: `View report`.
- Secondary: `Finish and view report` when at least one tyre is analysed.
- Scanned rows open Tyre result.

### 21 Final report
Image `21-final-report.png`. Source `Report.dc.html`.
- Header: plate or `No plate`, date and time, chassis number if present. Title `Tyre report`.
- Summary uses the worst real result. Examples: `Right rear needs replacing now`, `Right front should be replaced soon.`, or `All scanned tyres are in good condition`.
- List every selected tyre, with depth when available, size, and status or `Not scanned`.
- Tap a scanned tyre → Tyre result.
- `Share report` creates a PDF and opens the system share sheet.
- `Done` → Home.
- PDF footer: `Automated check. It doesn't replace a professional inspection.`

## 5. Business rules

Put thresholds in `src/config/inspection.ts`. These are starting defaults, not legal or safety advice. The owner must confirm them before release.

```ts
export const inspectionConfig = {
  tread: { replaceNowMaxMm: 1.6, replaceSoonMaxMm: 4.0 },
  age: { replaceSoonYears: 6 },
  capture: {
    sidewallMinFrames: 5,
    sidewallTargetFrames: 8,
    treadMinFrames: 5,
    treadTargetFrames: 10,
    timeoutSeconds: 20,
  },
};
```

Status rules:
1. Use the model class when the tread model returns a class.
2. If only mm is available: at or below `replaceNowMaxMm` is Replace now, at or below `replaceSoonMaxMm` is Replace soon, otherwise Good.
3. If damage is detected with enough confidence, the tyre is at least Replace soon. Serious damage is Replace now once the model supports that class.
4. If age is at or above `replaceSoonYears`, the tyre is at least Replace soon.
5. Final status is the worst result.
6. The inspection status is the worst tyre status. Ignore `Not scanned` when calculating condition, but show it clearly.

### Parser reference
These functions need unit tests. Keep OCR clean-up separate so messy text can be corrected by the user.

```ts
export function parseTyreSize(text: string) {
  const match = text
    .toUpperCase()
    .match(/\b(P|LT|ST|T)?\s*(\d{3})\s*\/\s*(\d{2})\s*(ZR|R|D|B)?\s*(\d{2}(?:\.\d)?)\b/);
  if (!match) return null;
  const [, prefix = '', width, aspectRatio, construction = 'R', rim] = match;
  return {
    value: `${prefix}${width}/${aspectRatio} ${construction}${rim}`,
    widthMm: Number(width),
    aspectRatio: Number(aspectRatio),
    construction,
    rimInches: Number(rim),
  };
}

export function parseDotAge(tin: string, now = new Date()) {
  const clean = tin.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/(\d{2})(\d{2})$/);
  if (!match) return null;
  const week = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (week < 1 || week > 53 || year > now.getFullYear()) return null;
  const made = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  let months =
    (now.getUTCFullYear() - made.getUTCFullYear()) * 12 +
    now.getUTCMonth() - made.getUTCMonth();
  if (now.getUTCDate() < made.getUTCDate()) months -= 1;
  if (months < 0) return null;
  return { week, year, ageYears: Math.floor(months / 12), ageMonths: months % 12 };
}
```

Validation:
- Plate: allow letters, numbers, spaces, and hyphens. Don't force a country format.
- Chassis: allow 5 to 17 letters and numbers. Warn but don't block unusual values. Don't silently change letters or digits.
- Tyre size: read rim diameter from the size code.
- DOT: only support the modern four-digit week and year code. Show age as unknown if it can't be parsed.
- Use `215/65 R15` as the display format. Commercial sizes such as `7.50R16` need a separate parser later.

## 6. Technical architecture

### Project handling
- If this is an existing React Native project, keep its structure and tooling.
- If there is no app yet, create a TypeScript React Native project. Use Expo with a development build only if the owner prefers Expo. Expo Go can't run the required native modules.
- Target the New Architecture.

### Preferred libraries
Check current compatibility with the project's React Native version before installing. Pin versions. If one doesn't fit, choose an equivalent and record the reason in `docs/DECISIONS.md`.

| Need | Preferred |
|---|---|
| Language | TypeScript strict mode |
| Navigation | `@react-navigation/native`, native stack, bottom tabs |
| App state | `zustand` |
| Camera | `react-native-vision-camera` v5 |
| Frame processing | `react-native-vision-camera-worklets`, `react-native-worklets`, `react-native-nitro-modules`, `react-native-nitro-image` |
| Frame resizing | `react-native-vision-camera-resizer` |
| TFLite | `react-native-fast-tflite` v3 |
| OCR | `rn-mlkit-ocr`, bundled offline models; use an equivalent ML Kit package if it fails compatibility checks |
| Simple storage | `react-native-mmkv` |
| Inspection database | SQLite package compatible with the project |
| Files | Compatible file-system package |
| PDF | `react-native-html-to-pdf` |
| Sharing | `react-native-share` |
| Haptics | `react-native-haptic-feedback` |
| Artwork | `react-native-svg` |
| Icons | `lucide-react-native` |
| Tests | Jest and React Native Testing Library |

VisionCamera v5 is a new output-based API. Read the installed package's type definitions and current docs. Don't use v4 examples. Every frame must be disposed. Frame callbacks must be worklets.

### Native setup checklist
- iOS: `NSCameraUsageDescription` with `Scan number plates, chassis numbers, and tyres.`
- Android: `CAMERA` permission.
- Metro: add `tflite` to `assetExts`.
- iOS acceleration: enable the CoreML delegate in the Podfile or Expo plugin.
- Android acceleration: enable the required GPU libraries in the manifest or Expo plugin.
- Load order: try `core-ml` on iOS or `android-gpu` on Android, then fall back to CPU.
- Avoid NNAPI because it's deprecated on Android 15.

```ts
import { Platform } from 'react-native';
import { loadTensorflowModel } from 'react-native-fast-tflite';

export async function loadModel(source: number) {
  const delegate = Platform.OS === 'ios' ? 'core-ml' : 'android-gpu';
  try {
    return await loadTensorflowModel(source, [delegate]);
  } catch {
    return loadTensorflowModel(source);
  }
}
```

### Folder structure

```text
src/
  app/            navigation, providers
  theme/          colours, type, spacing, components tokens
  components/     Button, Badge, CameraOverlay, TyreArtwork, ResultRow
  screens/        one folder per screen
  features/
    inspection/   store, repository, status rules
    capture/      camera hooks, quality checks, frame selection
    report/       HTML template, PDF, sharing
  ml/
    analyzer.ts   interface
    demoAnalyzer.ts
    tfliteAnalyzer.ts
    manifest.ts
    ocr/          OCR and parsers
  config/
assets/
  fonts/
  models/
docs/
```

### Data model

```ts
export type TyreStatus = 'good' | 'replace_soon' | 'replace_now';
export type TyreFlowState =
  | 'waiting' | 'capturing_sidewall' | 'capturing_tread'
  | 'captured' | 'analysing' | 'done' | 'skipped' | 'failed';

export type TyreResult = {
  status: TyreStatus;
  treadDepthMm: number | null;
  treadConfidence: number | null;
  wearPattern: string | null;
  damageFound: boolean | null;
  damageConfidence: number | null;
  size: string | null;
  rimInches: number | null;
  make: string | null;
  model: string | null;
  dotTin: string | null;
  ageYears: number | null;
  ageMonths: number | null;
};

export type TyreInspection = {
  id: string;
  position: string;
  state: TyreFlowState;
  sidewallFrames: string[];
  treadFrames: string[];
  result: TyreResult | null;
  errorReason: 'dark' | 'blur' | 'distance' | 'not_found' | 'analysis_failed' | null;
};

export type Inspection = {
  id: string;
  createdAt: string;
  completedAt: string | null;
  plate: string | null;
  chassis: string | null;
  tyres: TyreInspection[];
  reportPath: string | null;
  analyzerVersion: string;
};
```

Save after every important step so a closed app can resume. Store frame files in app storage, keep only the best frames, and delete abandoned frames.

### Analyzer contract
Screens must not call TFLite directly.

```ts
export type AnalysisStep = 'sidewall' | 'tread' | 'damage';

export interface TyreAnalyzer {
  version: string;
  isDemo: boolean;
  load(): Promise<void>;
  analyse(
    input: { sidewallFrames: string[]; treadFrames: string[]; userDetails: Partial<TyreResult> },
    onStep: (step: AnalysisStep) => void,
  ): Promise<TyreResult>;
}
```

Build `DemoTyreAnalyzer` first so the full UI can be tested before models exist.

**Safety rule:** The demo analyzer may run only in development. Results must show a visible `Demo data` label. A release build must fail clearly if real models are missing. It must never present demo or made-up results as a real inspection.

## 7. On-device ML

### Pipeline

```text
Live preview
  → Tyre detector: position and distance
  → Quality checks: blur, brightness, stability
  → Save best frames

After capture
  ├─ Sidewall crop → unwrap text band → ML Kit OCR → parsers → user review
  ├─ Tread model: status, depth later if validated
  └─ Damage model: normal or cracked
  → Combine results → save locally
```

### Model files
| Model | Starting architecture | Input | File | Size target |
|---|---|---|---|---|
| Tyre detector | YOLOX-Nano | 320 x 320 | `assets/models/tyre_detector_int8.tflite` | Under 5 MB |
| Tread | MobileNetV3-Small | 224 x 224 | `assets/models/tread_model_int8.tflite` | Under 5 MB |
| Damage | MobileNetV3-Small | 224 x 224 | `assets/models/damage_model_int8.tflite` | Under 5 MB |

Sizes and speed are targets to adjust after testing. Run the detector at about 10 frames per second during preview. Never run all models during preview.

`src/ml/manifest.ts` must define for each model: file, version, input shape, input type, normalisation, labels, output format, and confidence threshold. Don't guess these values. If they aren't known, stop model integration and ask for the training output.

### Quality checks
Use configurable starting values and calibrate them with real tyres:
- Brightness: reject if the guide area is too dark or overexposed.
- Blur: use a Laplacian variance score.
- Distance: tyre box should fill about 55 to 90 percent of the guide.
- Stability: require the same tyre position across several frames.

### Training path
No ready-made public tyre health model was found. Train your own or use a licensed SDK.
1. Build the detector first and test its speed on a low-end Android phone.
2. Collect tread videos from tyre shops or fleets, and measure the same tyres with a physical gauge. Starting target: 300 to 500 tyres across brands, wear levels, and lighting.
3. Split train and test data by tyre, not by frame.
4. Train tread classes first: Good, Replace soon, Replace now.
5. Add mm output only after it matches gauge readings on a separate test set.
6. Export int8 models and test the exported `.tflite` files on phones.

```python
import tensorflow as tf

def representative_data():
    for image in calibration_images.take(200):
        yield [tf.expand_dims(image, 0)]

converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.representative_dataset = representative_data
converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
converter.inference_input_type = tf.uint8
converter.inference_output_type = tf.uint8

open("tread_model_int8.tflite", "wb").write(converter.convert())
```

YOLOX is Apache-2.0. Its project docs list ONNX deployment but not direct TFLite, so export through ONNX and verify the converted model. Ultralytics YOLO is AGPL-3.0 by default, so closed-source commercial use needs its enterprise licence. Check every dataset licence before commercial use.

## 8. Reliability, privacy, and accessibility

Handle these states:
- Camera denied, unavailable, or interrupted.
- No flash on the device.
- Low storage: `There isn't enough storage to save these frames. Free up some space and try again.`
- Model failed to load, with a clear retry.
- OCR unavailable or empty, with manual entry.
- App closed mid-inspection, with resume.
- Android back button and iOS swipe back. Leaving an unfinished inspection must ask `Leave this inspection?`, with `Keep scanning` and `Save and leave`.
- Rotation: lock camera flow screens to portrait in the first release unless testing shows landscape is needed.

Privacy:
- Plate and chassis numbers are personal or sensitive vehicle data. Store them locally and don't log them.
- Don't add analytics, crash reporting, or network calls without owner approval.
- Sharing a report is the only way inspection data leaves the app in the first release.

Accessibility:
- Label all icon buttons.
- Announce capture success, failures, and status changes.
- Keep text contrast at 4.5:1 or better.
- Don't depend on colour alone.

## 9. Build order

Finish each milestone before starting the next. Run type checking, lint, and tests where available.

| Milestone | Build | Done when |
|---|---|---|
| M0 Setup | Inspect project, install dependencies, configure native builds | Empty app runs on iOS and Android |
| M1 Foundation | Theme, Inter, base components, navigation | Theme matches this spec |
| M2 Static UI | All 21 screens with demo data | Screens match `docs/design/screens/` |
| M3 Inspection state | Store, database, one-time walkthrough, resume, history | Full flow persists after restart |
| M4 Vehicle scan | Camera, permission, plate and chassis OCR, editing | Real text can be scanned, skipped, or typed |
| M5 Tyre capture | Sidewall and tread camera, quality checks, retry, frame storage | Good frames save and bad frames retry |
| M6 Demo analysis | Analyzer interface, demo results, report rules, PDF, sharing | Full flow works with `Demo data` shown |
| M7 Real models | Manifest, TFLite integration, OCR parsers, acceleration fallback | Real models run on supported phones |
| M8 Release | Device testing, performance, accessibility, store assets | Release checklist passes |

## 10. Testing

Unit tests:
- `parseTyreSize`: `P215/65R15`, `215/65 R15`, `215/65ZR17`, invalid text.
- `parseDotAge`: `4B7K 2JX 2623`, spaces, invalid week, future year.
- Status rules, worst-tyre logic, and skipped tyres.
- Tyre selection and walkthrough flag.
- Demo analyzer can't load in release mode.

Screen and flow tests:
- First launch and later launch.
- Skip plate and chassis.
- Select 2, 4, and 6 tyres.
- Toggle positions, including none selected.
- Multi-tyre order and resume.
- Failed capture, skipped tyre, and failed analysis.
- Report with mixed statuses and PDF sharing.

Real-device checks:
- At least one recent iPhone, one older iPhone, one mid-range Android, and one low-end Android.
- Bright sun, workshop lighting, low light, wet tyres, muddy tyres, worn sidewalls.
- No crash during repeated scans.
- Check memory use, frame rate, heat, and battery during a four-tyre inspection.
- Compare tread output with a physical gauge.

## 11. Release checklist

- Thresholds confirmed by the owner.
- Real models bundled and manifest values verified.
- Tread accuracy tested on a separate gauge-measured set.
- Demo analyzer unavailable in release builds.
- Automated-check notice present in Tyre result and PDF.
- Minimum supported devices decided from real testing.
- Bundle ID, app icon, splash screen, and final logo provided.
- Privacy policy and store data disclosures completed.
- All dependency and model licences checked.
- Android release and iOS archive build succeed.

## 12. Owner inputs needed

The app can be built through M6 without these. They block a real release:
1. Trained `.tflite` files and exact input and output details.
2. Final thresholds for Good, Replace soon, and Replace now.
3. Final logo, app icon, bundle identifier, and store name.
4. Minimum supported phones and operating system versions.
5. Whether inspections should later sync to a server. They don't in the first release.
