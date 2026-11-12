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

### Removed: Tire Tread Wear Computer Vision Project (smart-inspection, CC BY 4.0)
- Trained the previous `tread_wear.tflite` (`ssdlite320-mobilenetv3-large-torchvision-2026-11-10`). That checkpoint was replaced on 2026-11-12 by the Adtronics-trained one, so the notice was removed from the app. See DECISIONS.md, "M7 Phase 3c".

### torchvision — BSD 3-Clause
- **Used for:** the SSDLite MobileNetV3 architecture and training code behind `tread_wear.tflite`.
- Copyright (c) Soumith Chintala 2016. All rights reserved. [Licence](https://github.com/pytorch/vision/blob/main/LICENSE).
- BSD-3 asks binary redistributions to reproduce the notice in their documentation. Listing it here and in the app covers that.

### Removed: `tyre_detector.tflite` (was AGPL-3.0)
- The Ultralytics YOLOv8 sidewall text detector was deleted on 2026-11-10 and is no longer bundled. Sidewall text is read by Google ML Kit Text Recognition alone (via `rn-mlkit-ocr`). No AGPL-licensed model remains. See DECISIONS.md, "Sidewall text without a detector".

## Fonts

### Inter — SIL Open Font License 1.1
- Copyright (c) 2016 The Inter Project Authors. Full text: `assets/fonts/Inter-LICENSE.txt`.

## Libraries
npm dependency licences haven't been collected here yet. That's part of the release checklist's licence check.
