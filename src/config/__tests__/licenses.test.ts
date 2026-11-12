import { incompleteNotices, LICENSE_NOTICES } from '../licenses';

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

  test('the old smart-inspection tread wear dataset is no longer credited', () => {
    expect(JSON.stringify(LICENSE_NOTICES)).not.toMatch(/smart-inspection|tire-tread-wear/);
  });

  test('every notice has its creator and source', () => {
    expect(incompleteNotices()).toEqual([]);
  });
});
