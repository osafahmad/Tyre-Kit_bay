# Third-party licences

The in-app copy is `src/config/licenses.ts` (`LICENSE_NOTICES`), shown in the Third-Party Licenses sheet opened from Home. Keep both lists the same.

## Models and training data

### Tire Tread Wear Computer Vision Project — CC BY 4.0
- **Used for:** training `assets/models/tread_wear.tflite` (SSDLite tread wear detector).
- **Creator:** smart-inspection (Roboflow Community Contributor).
- **Source:** <https://universe.roboflow.com/smart-inspection/tire-tread-wear> (Roboflow Universe).
- **Licence:** [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- **Notice shown in the app** (owner wording, 2026-11-10):
  > Tire Tread Wear Computer Vision Project by smart-inspection, available at https://universe.roboflow.com/smart-inspection/tire-tread-wear, used under CC BY 4.0. Model adaptations and exports were produced for mobile on-device tread wear classification.

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
