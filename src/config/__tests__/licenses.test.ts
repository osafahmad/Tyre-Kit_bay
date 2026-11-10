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
        title: 'Tire Tread Wear Computer Vision Project',
        creator: 'smart-inspection (Roboflow Community Contributor)',
        sourceUrl: 'https://universe.roboflow.com/smart-inspection/tire-tread-wear',
        license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      }),
    );
    expect(d.notice).toBe(
      'Tire Tread Wear Computer Vision Project by smart-inspection, available at https://universe.roboflow.com/smart-inspection/tire-tread-wear, used under CC BY 4.0. Model adaptations and exports were produced for mobile on-device tread wear classification.',
    );
  });

  test('every notice has its creator and source', () => {
    expect(incompleteNotices()).toEqual([]);
  });
});
