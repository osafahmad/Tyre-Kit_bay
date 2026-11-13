# Third-party licences

The in-app copy is `src/config/licenses.ts` (`LICENSE_NOTICES`), shown in the Third-Party Licenses sheet opened from Home. Keep both lists the same.

## Models and training data

### Tire Crack Detection Computer Vision Dataset (Version 19) — CC BY 4.0
- **Used for:** training `assets/models/tread_wear.tflite` (SSDLite detector, version `ssdlite320-mobilenetv3-large-adtronics-crack-v19-2026-11-12`).
- **Creator:** Adtronics (Roboflow workspace `adtronics-pmfgf`).
- **Source:** <https://universe.roboflow.com/adtronics-pmfgf/tire-crack-detection-4z5ei/dataset/19> (Roboflow Universe).
- **Licence:** [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- **Notice shown in the app** (owner wording, 2026-11-12):
  > Trained SSDLite320-MobileNetV3-Large (Torchvision BSD-3-Clause) on Adtronics Tire Crack Detection v19 (6,359 images).

### tyre-to-text Computer Vision Dataset (Version 3) — CC BY 4.0
- **Used for:** training `assets/models/sidewall_detector.tflite` (YOLO11n-seg sidewall text detector, version `yolo11n-seg-tyre-to-text-v3-2026-11-13`), 424 images.
- **Creator:** Hetvi EWW (Roboflow workspace `hetvi-eww-zdjt2`).
- **Source:** <https://universe.roboflow.com/hetvi-eww-zdjt2/tyre-to-text-cm4fa> (Roboflow Universe).
- **Licence:** [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- **Notice shown in the app** (2026-11-13):
  > Sidewall text detector trained on the tyre-to-text dataset v3 by Hetvi EWW (424 images, CC BY 4.0).

### `sidewall_detector.tflite` — Ultralytics YOLO11n-seg, **AGPL-3.0 (release blocker, re-opened 2026-11-13)**
- The file's embedded metadata says `Ultralytics`, `AGPL-3.0 License (https://ultralytics.com/license)`. Ultralytics YOLO11 weights, training code and exports are AGPL-3.0; a closed-source app that ships them needs an Ultralytics Enterprise licence or must open its source under AGPL.
- This is the same situation as the YOLOv8 `tyre_detector.tflite` removed on 2026-11-10 (below). The owner supplied this model for the Stage 1–5 detector work (DECISIONS.md, "M7 Phase 2c"); **before any store build the owner must either hold an Ultralytics Enterprise licence or replace the architecture.** Tracked on the release checklist.
- The decoder, letterbox and NMS in `src/ml/inference/` are this project's own code and don't include Ultralytics code.

### Removed: Tire Tread Wear Computer Vision Project (smart-inspection, CC BY 4.0)
- Trained the previous `tread_wear.tflite` (`ssdlite320-mobilenetv3-large-torchvision-2026-11-10`). That checkpoint was replaced on 2026-11-12 by the Adtronics-trained one, so the notice was removed from the app. See DECISIONS.md, "M7 Phase 3c".

### torchvision — BSD 3-Clause
- **Used for:** the SSDLite MobileNetV3 architecture and training code behind `tread_wear.tflite`.
- Copyright (c) Soumith Chintala 2016. All rights reserved. [Licence](https://github.com/pytorch/vision/blob/main/LICENSE).
- BSD-3 asks binary redistributions to reproduce the notice in their documentation. Listing it here and in the app covers that.

### Removed: `tyre_detector.tflite` (was AGPL-3.0)
- The Ultralytics YOLOv8 sidewall text detector was deleted on 2026-11-10 and is no longer bundled. Sidewall text was then read by Google ML Kit Text Recognition alone (via `rn-mlkit-ocr`). ~~No AGPL-licensed model remains.~~ **2026-11-13: a new Ultralytics (AGPL-3.0) sidewall text detector was added, see above.** See DECISIONS.md, "Sidewall text without a detector".

## Fonts

### Inter — SIL Open Font License 1.1
- Copyright (c) 2016 The Inter Project Authors. Full text: `assets/fonts/Inter-LICENSE.txt`.

## Libraries
npm dependency licences haven't been collected here yet. That's part of the release checklist's licence check.
