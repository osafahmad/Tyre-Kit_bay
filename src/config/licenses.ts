// Third-party notices shown in the app (docs/LICENSES.md has the same list).
// One source of truth for a future Legal & Licenses screen; no screen reads
// it yet (not one of the spec's 21 screens, owner to approve).

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
    // Owner-supplied wording, 2026-11-10. CC BY 4.0 §3(a) also asks for the
    // creator's name and a link to the dataset: still needed from the owner.
    id: 'tread-wear-dataset',
    title: 'Tire Tread Wear Detection Dataset',
    creator: null,
    sourceUrl: null,
    license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    notice:
      'Tyre tread wear computer vision models were trained using dataset annotations provided under the Creative Commons Attribution 4.0 International (CC BY 4.0) license via Roboflow Universe.',
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
