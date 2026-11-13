// Third-party notices shown in the app (docs/LICENSES.md has the same list).
// Shown by `LicensesModal`, an overlay opened from Home's "Third-Party
// Licenses" link (not a route: the app keeps the spec's 21 screens).

export type LicenseNotice = {
  id: string;
  /** What it is, as shown to users. */
  title: string;
  /** Who made it. Null where the owner hasn't supplied it yet. */
  creator: string | null;
  /** Where it comes from. Null where the owner hasn't supplied it yet. */
  sourceUrl: string | null;
  license: string;
  licenseUrl: string;
  /** The notice text shown as written. */
  notice: string;
};

export const LICENSE_NOTICES: readonly LicenseNotice[] = [
  {
    // Owner-supplied title, creator, URL and notice, 2026-11-12 (the dataset
    // behind tread_wear.tflite ssdlite320-mobilenetv3-large-adtronics-crack-v19-2026-11-12).
    id: 'tread-wear-dataset',
    title: 'Tire Crack Detection Computer Vision Dataset (Version 19)',
    creator: 'Adtronics (Roboflow workspace adtronics-pmfgf)',
    sourceUrl: 'https://universe.roboflow.com/adtronics-pmfgf/tire-crack-detection-4z5ei/dataset/19',
    license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    notice: 'Trained SSDLite320-MobileNetV3-Large (Torchvision BSD-3-Clause) on Adtronics Tire Crack Detection v19 (6,359 images).',
  },
  {
    // Owner task 2026-11-13: the dataset behind sidewall_detector.tflite
    // (yolo11n-seg-tyre-to-text-v3-2026-11-13). Roboflow Universe dataset
    // `tyre-to-text`, version 3, workspace `hetvi-eww-zdjt2`, 424 images.
    id: 'sidewall-text-dataset',
    title: 'tyre-to-text Computer Vision Dataset (Version 3)',
    creator: 'Hetvi EWW (Roboflow workspace hetvi-eww-zdjt2)',
    sourceUrl: 'https://universe.roboflow.com/hetvi-eww-zdjt2/tyre-to-text-cm4fa',
    license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    notice: 'Sidewall text detector trained on the tyre-to-text dataset v3 by Hetvi EWW (424 images, CC BY 4.0).',
  },
  {
    id: 'torchvision',
    title: 'torchvision (SSDLite MobileNetV3 model architecture)',
    creator: 'Soumith Chintala and the torchvision contributors',
    sourceUrl: 'https://github.com/pytorch/vision',
    license: 'BSD 3-Clause License',
    licenseUrl: 'https://github.com/pytorch/vision/blob/main/LICENSE',
    notice: 'Copyright (c) Soumith Chintala 2016. All rights reserved.',
  },
  {
    id: 'inter',
    title: 'Inter typeface',
    creator: 'The Inter Project Authors',
    sourceUrl: 'https://github.com/rsms/inter',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    notice: 'Copyright (c) 2016 The Inter Project Authors.',
  },
];

/** Notices still missing details their licence asks for (blocks release). */
export function incompleteNotices(notices: readonly LicenseNotice[] = LICENSE_NOTICES): string[] {
  return notices.filter(n => n.creator === null || n.sourceUrl === null).map(n => n.id);
}
