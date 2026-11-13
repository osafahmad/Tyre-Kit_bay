import { incompleteNotices, LICENSE_NOTICES } from '../licenses';
import { LICENSE_TEXTS } from '../licenseTexts';

// No Node types in this project (same pattern as ml/inference/__fixtures__/tfliteFile.ts).
const { readFileSync } = require('fs') as { readFileSync(path: string, encoding: 'utf8'): string };

const notice = (id: string) => LICENSE_NOTICES.find(n => n.id === id)!;

describe('licence notices', () => {
  test('ids are unique and every notice has a licence and its link', () => {
    expect(new Set(LICENSE_NOTICES.map(n => n.id)).size).toBe(LICENSE_NOTICES.length);
    for (const n of LICENSE_NOTICES) {
      expect(n.title).not.toBe('');
      expect(n.notice).not.toBe('');
      expect(n.licenseUrl).toMatch(/^https:\/\//);
    }
  });

  test('the tread wear dataset carries the full CC BY 4.0 attribution', () => {
    const d = LICENSE_NOTICES.find(n => n.id === 'tread-wear-dataset')!;
    expect(d).toEqual(
      expect.objectContaining({
        title: 'Tire Crack Detection Computer Vision Dataset (Version 19)',
        creator: 'Adtronics (Roboflow workspace adtronics-pmfgf)',
        sourceUrl: 'https://universe.roboflow.com/adtronics-pmfgf/tire-crack-detection-4z5ei/dataset/19',
        license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      }),
    );
    expect(d.notice).toBe(
      'Trained SSDLite320-MobileNetV3-Large (Torchvision BSD-3-Clause) on Adtronics Tire Crack Detection v19 (6,359 images).',
    );
  });

  test('the sidewall text dataset carries the full CC BY 4.0 attribution (owner task 2026-11-13)', () => {
    const d = LICENSE_NOTICES.find(n => n.id === 'sidewall-text-dataset')!;
    expect(d).toEqual(
      expect.objectContaining({
        creator: 'Hetvi EWW (Roboflow workspace hetvi-eww-zdjt2)',
        sourceUrl: 'https://universe.roboflow.com/hetvi-eww-zdjt2/tyre-to-text-cm4fa',
        license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      }),
    );
  });

  test('the old smart-inspection tread wear dataset is no longer credited', () => {
    expect(JSON.stringify(LICENSE_NOTICES)).not.toMatch(/smart-inspection|tire-tread-wear/);
  });

  test('every notice has its creator and source', () => {
    expect(incompleteNotices()).toEqual([]);
  });

  // Dependency audit 2026-11-13.
  test('Apache-2.0 runtime and Google libraries carry the full Apache licence text', () => {
    for (const id of ['tensorflow-lite', 'google-support-libraries']) {
      expect(notice(id).license).toBe('Apache License 2.0');
      expect(notice(id).licenseTextId).toBe('apache-2.0');
    }
    expect(LICENSE_TEXTS['apache-2.0']).toMatch(/Apache License\s+Version 2\.0, January 2004/);
    expect(LICENSE_TEXTS['apache-2.0']).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION');
    expect(LICENSE_TEXTS['apache-2.0']).toContain('END OF TERMS AND CONDITIONS');
  });

  test('ML Kit shows Google’s terms and points to the SDK’s NOTICES file', () => {
    const d = notice('google-ml-kit');
    expect(d.licenseUrl).toBe('https://developers.google.com/ml-kit/terms');
    expect(d.notice).toMatch(/NOTICES file/);
  });

  test('MMKV carries the Tencent copyright and the mandatory OpenSSL and Eric Young acknowledgements', () => {
    const d = notice('mmkv');
    expect(d.notice).toContain('Copyright (C) 2018 THL A29 Limited, a Tencent company.');
    expect(d.notice).toContain(
      'This product includes software developed by the OpenSSL Project for use in the OpenSSL Toolkit (http://www.openssl.org/).',
    );
    expect(d.notice).toContain('This product includes cryptographic software written by Eric Young (eay@cryptsoft.com).');
    const text = LICENSE_TEXTS[d.licenseTextId!];
    expect(text).toContain('BSD 3-Clause License');
    expect(text).toContain('OpenSSL License:');
    expect(text).toContain('Original SSLeay License:');
  });

  test('Lucide credits Feather and Cole Bemis, with the package’s own licence text', () => {
    const d = notice('lucide');
    expect(d.notice).toContain('Lucide Icons and Contributors');
    expect(d.notice).toContain('Cole Bemis');
    const shipped = readFileSync('node_modules/lucide-react-native/LICENSE', 'utf8');
    const clean = (t: string) => t.replace(/[ \t]+$/gm, '').trim();
    // Fails when the package is updated without re-running scripts/generate-license-texts.js.
    expect(LICENSE_TEXTS.lucide).toBe(clean(shipped));
  });

  test('every licence text id points at a text', () => {
    for (const n of LICENSE_NOTICES) {
      if (n.licenseTextId) expect(LICENSE_TEXTS[n.licenseTextId].length).toBeGreaterThan(500);
    }
  });
});
