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

  test('the tread wear dataset carries the owner’s CC BY 4.0 notice', () => {
    const d = LICENSE_NOTICES.find(n => n.id === 'tread-wear-dataset')!;
    expect(d.license).toBe('Creative Commons Attribution 4.0 International (CC BY 4.0)');
    expect(d.notice).toContain('CC BY 4.0');
    expect(d.notice).toContain('Roboflow Universe');
  });

  test('the dataset creator and link are still missing (release blocker)', () => {
    expect(incompleteNotices()).toEqual(['tread-wear-dataset']);
  });
});
