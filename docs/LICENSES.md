# Third-party licences

The in-app copy is `src/config/licenses.ts` (`LICENSE_NOTICES`). Keep both lists the same.

## Models and training data

### Tire Tread Wear Detection Dataset — CC BY 4.0
- **Used for:** training `assets/models/tread_wear.tflite` (SSDLite tread wear detector).
- **Provider:** Roboflow Universe (Tread & Defect Inspection Dataset).
- **Licence:** [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- **Notice shown in the app** (owner wording, 2026-11-10):
  > Tyre tread wear computer vision models were trained using dataset annotations provided under the Creative Commons Attribution 4.0 International (CC BY 4.0) license via Roboflow Universe.
- **Still needed (release blocker):** CC BY 4.0 §3(a) asks for the creator's name and, where practical, a link to the dataset. Roboflow Universe is the host, not the creator. Add the dataset author (the Roboflow workspace or project owner) and its Universe URL here and in `licenses.ts`.

### torchvision — BSD 3-Clause
- **Used for:** the SSDLite MobileNetV3 architecture and training code behind `tread_wear.tflite`.
- Copyright (c) Soumith Chintala 2016. All rights reserved. [Licence](https://github.com/pytorch/vision/blob/main/LICENSE).
- BSD-3 asks binary redistributions to reproduce the notice in their documentation. Listing it here and in the app covers that.

### `tyre_detector.tflite` — AGPL-3.0 (release blocker)
- Ultralytics YOLOv8 sidewall text detector. Not to be shipped in a store build. Replacement scheduled as its own milestone (owner, 2026-11-10). See DECISIONS.md, M7 Phase 2a.

## Fonts

### Inter — SIL Open Font License 1.1
- Copyright (c) 2016 The Inter Project Authors. Full text: `assets/fonts/Inter-LICENSE.txt`.

## Libraries
npm dependency licences haven't been collected here yet. That's part of the release checklist's licence check.
