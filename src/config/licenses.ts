// Third-party notices shown in the app (docs/LICENSES.md has the same list).
// Shown by `LicensesModal`, an overlay opened from Home's "Third-Party
// Licenses" link (not a route: the app keeps the spec's 21 screens).

import type { LicenseTextId } from './licenseTexts';

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
  /**
   * Full licence text in `LICENSE_TEXTS` (licenseTexts.ts), shown behind
   * "Show licence text". Set where the licence asks for its text to travel
   * with the app (Apache-2.0 §4a, BSD/OpenSSL binary redistribution, ISC/MIT).
   */
  licenseTextId?: LicenseTextId;
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
  {
    // Dependency audit 2026-11-13. The TFLite runtime behind react-native-fast-tflite:
    // TensorFlowLiteC 2.17.0 with the Core ML delegate (iOS), LiteRT and
    // LiteRT GPU 1.4.0 (Android). Copyright line as in the TensorFlow sources.
    id: 'tensorflow-lite',
    title: 'TensorFlow Lite / LiteRT (on-device model runtime)',
    creator: 'The TensorFlow Authors (Google)',
    sourceUrl: 'https://github.com/tensorflow/tensorflow',
    license: 'Apache License 2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    notice: 'Copyright The TensorFlow Authors. All rights reserved. Licensed under the Apache License, Version 2.0.',
    licenseTextId: 'apache-2.0',
  },
  {
    // Dependency audit 2026-11-13. Pulled in by ML Kit: GoogleDataTransport,
    // GoogleUtilities, GTMSessionFetcher, PromisesObjC, GoogleToolboxForMac
    // (iOS pods) and com.google.android.datatransport (Android).
    id: 'google-support-libraries',
    title: 'Google support libraries (GoogleDataTransport, GoogleUtilities, GTMSessionFetcher, Promises, Google Toolbox for Mac)',
    creator: 'Google LLC',
    sourceUrl: 'https://github.com/google/GoogleDataTransport',
    license: 'Apache License 2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    notice: 'Copyright Google LLC. Licensed under the Apache License, Version 2.0.',
    licenseTextId: 'apache-2.0',
  },
  {
    // Dependency audit 2026-11-13. Google's on-device SDK, used through
    // rn-mlkit-ocr (MIT). Not open source: Google's terms apply. Its 1.5 MB
    // NOTICES file is referenced, not embedded (docs/LICENSES.md).
    id: 'google-ml-kit',
    title: 'Google ML Kit Text Recognition',
    creator: 'Google LLC',
    sourceUrl: 'https://developers.google.com/ml-kit',
    license: 'ML Kit Terms of Service',
    licenseUrl: 'https://developers.google.com/ml-kit/terms',
    notice:
      'Text is read on the device with Google ML Kit, used under the ML Kit Terms of Service. ML Kit includes open-source software; its notices are in the NOTICES file distributed with the ML Kit SDK.',
  },
  {
    // Dependency audit 2026-11-13. MMKVCore 2.4.0 (behind react-native-mmkv)
    // compiles in OpenSSL AES code, so the OpenSSL and SSLeay
    // acknowledgements below are mandatory. Wording is from MMKV's LICENSE.TXT.
    id: 'mmkv',
    title: 'MMKV (key-value storage)',
    creator: 'THL A29 Limited, a Tencent company',
    sourceUrl: 'https://github.com/Tencent/MMKV',
    license: 'BSD 3-Clause License, with OpenSSL and SSLeay licensed components',
    licenseUrl: 'https://github.com/Tencent/MMKV/blob/master/LICENSE.TXT',
    notice:
      'Copyright (C) 2018 THL A29 Limited, a Tencent company. All rights reserved. This product includes software developed by the OpenSSL Project for use in the OpenSSL Toolkit (http://www.openssl.org/). This product includes cryptographic software written by Eric Young (eay@cryptsoft.com). This product includes software written by Tim Hudson (tjh@cryptsoft.com).',
    licenseTextId: 'mmkv',
  },
  {
    // Dependency audit 2026-11-13. lucide-react-native 1.68.0; some icons
    // come from Feather (MIT). Wording is from the package's LICENSE.
    id: 'lucide',
    title: 'Lucide icons',
    creator: 'Lucide Icons and Contributors; Feather icons by Cole Bemis',
    sourceUrl: 'https://github.com/lucide-icons/lucide',
    license: 'ISC License (Lucide); MIT License (icons derived from Feather)',
    licenseUrl: 'https://github.com/lucide-icons/lucide/blob/main/LICENSE',
    notice: 'Copyright (c) 2026 Lucide Icons and Contributors. Some icons are derived from the Feather project, Copyright (c) 2013-present Cole Bemis.',
    licenseTextId: 'lucide',
  },
];

/** Notices still missing details their licence asks for (blocks release). */
export function incompleteNotices(notices: readonly LicenseNotice[] = LICENSE_NOTICES): string[] {
  return notices.filter(n => n.creator === null || n.sourceUrl === null).map(n => n.id);
}
