import { CaptureSession } from '../captureSession';

const sidewall = () =>
  new CaptureSession({
    stage: 'sidewall',
    minFrames: 5,
    targetFrames: 8,
    timeoutMs: 20000,
    extraCandidates: 4,
    settleMs: 1000,
  });
const tread = () => new CaptureSession({ stage: 'tread', minFrames: 5, targetFrames: 10, timeoutMs: 20000 });

describe('sidewall', () => {
  test('waits for Capture, then keeps the 8 sharpest of 12 in capture order', () => {
    const s = sidewall();
    s.addCandidate('early', 999);
    expect(s.lateDiscards).toEqual(['early']);
    s.start();
    for (let i = 1; i <= 12; i++) s.addCandidate(`f${i}`, i % 3 === 0 ? 1 : 100 + i);
    expect(s.state.outcome).toEqual({
      kind: 'done',
      keep: ['f1', 'f2', 'f4', 'f5', 'f7', 'f8', 'f10', 'f11'],
      discard: ['f3', 'f6', 'f9', 'f12'],
    });
  });

  test('with 8 frames it waits briefly for sharper ones, then finishes', () => {
    const s = sidewall();
    s.start();
    for (let i = 0; i < 8; i++) s.addCandidate(`f${i}`, 1);
    expect(s.state.outcome).toBeNull();
    s.tick(750);
    expect(s.state.outcome).toBeNull();
    s.tick(250);
    expect(s.state.outcome?.kind).toBe('done');
  });

  test('timeout with at least 5 frames keeps them', () => {
    const s = sidewall();
    s.start();
    for (let i = 0; i < 6; i++) s.addCandidate(`f${i}`, 1);
    s.tick(20000);
    expect(s.state.outcome).toMatchObject({ kind: 'done' });
    expect((s.state.outcome as { keep: string[] }).keep).toHaveLength(6);
  });

  test('timeout with fewer than 5 is a problem with the real reason, and frames are discarded', () => {
    const s = sidewall();
    s.start();
    s.addCandidate('a', 1);
    for (let i = 0; i < 10; i++) s.sample('too_dark');
    s.sample('blurry');
    s.tick(20000);
    expect(s.state.outcome).toEqual({ kind: 'problem', reason: 'dark', discard: ['a'] });
  });

  test('time and rejections only count after Capture', () => {
    const s = sidewall();
    s.sample('too_dark');
    s.tick(60000);
    expect(s.state.outcome).toBeNull();
    expect(s.state.status).toBe('too_dark');
    s.start();
    s.sample('moving');
    s.giveUp();
    expect(s.state.outcome).toMatchObject({ kind: 'problem', reason: 'unsteady' });
  });
});

describe('tread', () => {
  test('collects from the start and finishes at 10', () => {
    const s = tread();
    for (let i = 0; i < 9; i++) s.addCandidate(`t${i}`, 1);
    expect(s.state.accepted).toBe(9);
    expect(s.state.outcome).toBeNull();
    s.addCandidate('t9', 1);
    expect(s.state.outcome).toMatchObject({ kind: 'done' });
    expect((s.state.outcome as { keep: string[] }).keep).toHaveLength(10);
  });

  test('Finish sweep needs 5 clear frames', () => {
    const s = tread();
    for (let i = 0; i < 4; i++) s.addCandidate(`t${i}`, 1);
    expect(s.finish()).toBe(false);
    s.addCandidate('t4', 1);
    expect(s.finish()).toBe(true);
    expect((s.state.outcome as { keep: string[] }).keep).toHaveLength(5);
  });

  test('target not reached in 20 s of active time opens Capture problem', () => {
    const s = tread();
    for (let i = 0; i < 7; i++) s.addCandidate(`t${i}`, 1);
    s.tick(19750);
    expect(s.state.outcome).toBeNull();
    s.tick(250);
    expect(s.state.outcome).toMatchObject({ kind: 'problem', discard: expect.arrayContaining(['t0']) });
  });

  test('frames saved after the outcome are handed back for deletion', () => {
    const s = tread();
    s.giveUp();
    s.addCandidate('late', 1);
    expect(s.lateDiscards).toEqual(['late']);
  });
});
