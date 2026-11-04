import * as fs from '@dr.pogodin/react-native-fs';
import {
  LowStorageError,
  commitStageFrames,
  hasRoomForFrames,
  reconcileFrames,
} from '../frameFiles';
import type { Inspection, TyreInspection } from '../../inspection/types';
import { emptySidewallDetails } from '../../inspection/store';

// In-memory files for this suite.
const mockFiles = new Set<string>();
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/docs',
  CachesDirectoryPath: '/caches',
  mkdir: jest.fn(async () => {}),
  exists: jest.fn(async (p: string) => [...mockFiles].some(f => f === p || f.startsWith(`${p}/`))),
  moveFile: jest.fn(async (from: string, to: string) => {
    if (to.includes('FULL')) throw new Error('No space left on device');
    mockFiles.delete(from);
    mockFiles.add(to);
  }),
  unlink: jest.fn(async (p: string) => {
    for (const f of [...mockFiles]) if (f === p || f.startsWith(`${p}/`)) mockFiles.delete(f);
  }),
  readDir: jest.fn(async (dir: string) => {
    const names = new Set(
      [...mockFiles].filter(f => f.startsWith(`${dir}/`)).map(f => f.slice(dir.length + 1).split('/')[0]),
    );
    return [...names].map(name => ({ name, path: `${dir}/${name}` }));
  }),
  getFSInfo: jest.fn(async () => ({ freeSpace: 10 * 1024 * 1024 })),
}));

beforeEach(() => mockFiles.clear());

test('kept frames move into the tyre folder, replacing that stage only', async () => {
  mockFiles.add('/docs/frames/i1/t1/sidewall_1_1.jpg');
  mockFiles.add('/docs/frames/i1/t1/tread_1_1.jpg');
  mockFiles.add('/caches/capture-tmp/a.jpg');
  mockFiles.add('/caches/capture-tmp/b.jpg');
  const kept = await commitStageFrames('i1', 't1', 'sidewall', [
    '/caches/capture-tmp/a.jpg',
    '/caches/capture-tmp/b.jpg',
  ]);
  expect(kept).toHaveLength(2);
  kept.forEach(p => expect(p).toMatch(/^frames\/i1\/t1\/sidewall_\d+_\d\.jpg$/));
  expect([...mockFiles].sort()).toEqual(
    ['/docs/frames/i1/t1/tread_1_1.jpg', ...kept.map(p => `/docs/${p}`)].sort(),
  );
});

test('a full disk deletes what it moved and reports low storage', async () => {
  mockFiles.add('/caches/capture-tmp/a.jpg');
  await expect(commitStageFrames('FULL', 't1', 'tread', ['/caches/capture-tmp/a.jpg'])).rejects.toBeInstanceOf(
    LowStorageError,
  );
  expect(mockFiles.size).toBe(0);
});

test('free space check', async () => {
  expect(await hasRoomForFrames(5 * 1024 * 1024)).toBe(true);
  expect(await hasRoomForFrames(50 * 1024 * 1024)).toBe(false);
  (fs.getFSInfo as jest.Mock).mockRejectedValueOnce(new Error('unknown'));
  expect(await hasRoomForFrames()).toBe(true);
});

const tyre = (patch: Partial<TyreInspection>): TyreInspection => ({
  id: 't1',
  position: 'Left front',
  state: 'waiting',
  sidewallFrames: [],
  treadFrames: [],
  result: null,
  errorReason: null,
  sidewallDetails: emptySidewallDetails,
  ...patch,
});
const inspection = (tyres: TyreInspection[], id = 'i1'): Inspection => ({
  id,
  createdAt: '',
  completedAt: null,
  plate: null,
  chassis: null,
  tyres,
  reportPath: null,
  analyzerVersion: 'demo-1',
});

describe('reconcileFrames', () => {
  const sw = (n: number) => Array.from({ length: n }, (_, i) => `frames/i1/t1/sidewall_1_${i}.jpg`);
  const tr = (n: number) => Array.from({ length: n }, (_, i) => `frames/i1/t1/tread_1_${i}.jpg`);

  test('unchanged inspections are returned as the same objects', async () => {
    sw(5).forEach(p => mockFiles.add(`/docs/${p}`));
    const input = [inspection([tyre({ state: 'capturing_tread', sidewallFrames: sw(5) })])];
    const out = await reconcileFrames(input);
    expect(out[0]).toBe(input[0]);
  });

  test('missing sidewall frames send the tyre back to sidewall capture', async () => {
    sw(3).forEach(p => mockFiles.add(`/docs/${p}`));
    const [out] = await reconcileFrames([
      inspection([tyre({ state: 'capturing_tread', sidewallFrames: sw(6) })]),
    ]);
    expect(out.tyres[0]).toMatchObject({ state: 'capturing_sidewall', sidewallFrames: sw(3) });
  });

  test('missing tread frames send a captured tyre back to tread capture', async () => {
    [...sw(6), ...tr(2)].forEach(p => mockFiles.add(`/docs/${p}`));
    const [out] = await reconcileFrames([
      inspection([tyre({ state: 'captured', sidewallFrames: sw(6), treadFrames: tr(10) })]),
    ]);
    expect(out.tyres[0].state).toBe('capturing_tread');
  });

  test('demo frames are left alone and orphaned folders are deleted', async () => {
    mockFiles.add('/docs/frames/gone/t9/sidewall_1_1.jpg');
    const demo = ['demo://sidewall/1'];
    const [out] = await reconcileFrames([
      inspection([tyre({ state: 'capturing_tread', sidewallFrames: demo })]),
    ]);
    expect(out.tyres[0].sidewallFrames).toEqual(demo);
    expect(mockFiles.size).toBe(0);
  });
});
