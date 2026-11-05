import {
  chassisCandidate,
  cleanPlateText,
  explainPlateCandidate,
  plateCandidate,
  type OcrLineLike,
} from '../textCandidates';

const line = (text: string, height = 40, elements?: string[]): OcrLineLike => ({
  text,
  frame: { x: 0, y: 0, width: 200, height },
  elements: elements?.map(t => ({ text: t, frame: { x: 0, y: 0, width: 50, height } })),
});

describe('plateCandidate', () => {
  test('takes the largest text in the guide', () => {
    expect(plateCandidate([line('Dealer Motors', 12), line('ABC-1234', 48)])).toBe('ABC-1234');
  });

  test('uppercases and drops punctuation but keeps spaces and hyphens', () => {
    expect(cleanPlateText(' kh·44 20. ')).toBe('KH44 20');
    expect(plateCandidate([line('abc 1234')])).toBe('ABC 1234');
  });

  test('never swaps letters and digits', () => {
    expect(plateCandidate([line('O0I1-B8')])).toBe('O0I1-B8');
  });

  test('no country format is enforced', () => {
    expect(plateCandidate([line('LEB7781')])).toBe('LEB7781');
    expect(plateCandidate([line('KH44 20')])).toBe('KH44 20');
  });

  test('OCR-only shape: values that are not letters…digits are no result (DECISIONS: plate reading rules)', () => {
    // Previously accepted; superseded by the owner's plate reading rules.
    expect(plateCandidate([line('BOSS')])).toBeNull();
    expect(plateCandidate([line('12 345')])).toBeNull();
  });

  test('nothing plausible gives null instead of a guess', () => {
    expect(plateCandidate([])).toBeNull();
    expect(plateCandidate([line('-')])).toBeNull();
    expect(plateCandidate([line('THIS IS A LONG SENTENCE')])).toBeNull();
  });
});

describe('chassisCandidate', () => {
  test('reads a 17-character chassis number', () => {
    expect(chassisCandidate([line('JT2BG22K0W0123456', 30)], 100).value).toBe('JT2BG22K0W0123456');
  });

  test('accepts shorter numbers and never pads to 17', () => {
    expect(chassisCandidate([line('KE30123456', 30)], 100).value).toBe('KE30123456');
    expect(chassisCandidate([line('A1234', 30)], 100).value).toBe('A1234');
  });

  test('joins words split by OCR and drops a leading VIN label', () => {
    const read = chassisCandidate(
      [line('VIN WVWZZZ 1JZ3W386752', 30, ['VIN', 'WVWZZZ', '1JZ3W386752'])],
      100,
    );
    expect(read.value).toBe('WVWZZZ1JZ3W386752');
  });

  test('keeps I, O and Q exactly as read', () => {
    expect(chassisCandidate([line('JT2IOQ2K0W0123456', 30)], 100).value).toBe('JT2IOQ2K0W0123456');
  });

  test('ignores words without digits and runs over 17 characters', () => {
    expect(chassisCandidate([line('CHASSIS', 30)], 100).value).toBeNull();
    expect(chassisCandidate([line('JT2BG22K0W01234567890', 30)], 100).value).toBeNull();
  });

  test('small text asks the user to move closer instead of guessing', () => {
    expect(chassisCandidate([line('JT2BG22K0W0123456', 10)], 100)).toEqual({
      value: null,
      tooSmall: true,
    });
  });
});

// Owner's plate reading rules (docs/DECISIONS.md). Separate OCR lines with
// positions as ML Kit reports them: box(x, y, width, height).
describe('plate reading rules', () => {
  const at = (text: string, x: number, y: number, width: number, height: number): OcrLineLike => ({
    text,
    frame: { x, y, width, height },
  });

  test('small "PUNJAB", tall "ABH514" -> "ABH514"', () => {
    expect(plateCandidate([at('PUNJAB', 120, 10, 90, 18), at('ABH514', 40, 40, 260, 60)])).toBe('ABH514');
  });

  test('"ABH 514" -> keeps the existing valid result', () => {
    expect(plateCandidate([at('ABH 514', 20, 40, 280, 60)])).toBe('ABH 514');
  });

  test('similar-height "BKE", "2090" -> "BKE 2090"', () => {
    expect(plateCandidate([at('BKE', 70, 10, 150, 50), at('2090', 50, 70, 190, 52)])).toBe('BKE 2090');
  });

  test('similar-height "LEA-12", "8197" -> "LEA-12 8197"', () => {
    expect(plateCandidate([at('LEA-12', 40, 10, 220, 48), at('8197', 60, 66, 180, 50)])).toBe('LEA-12 8197');
  });

  test('the line order from ML Kit does not matter', () => {
    expect(plateCandidate([at('2090', 50, 70, 190, 52), at('BKE', 70, 10, 150, 50)])).toBe('BKE 2090');
  });

  test.each(['BKE', '2090', 'PUNJAB', 'HONDA', 'PTLUI4T'])('"%s" alone -> no result', text => {
    expect(plateCandidate([at(text, 40, 40, 260, 60)])).toBeNull();
  });

  test('small text above or below the number is not joined', () => {
    // Similar position but much smaller: not part of the plate.
    expect(plateCandidate([at('ABH514', 40, 10, 260, 60), at('ET&NC', 60, 76, 200, 20)])).toBe('ABH514');
    expect(plateCandidate([at('ET 12', 60, 0, 200, 20), at('ABH514', 40, 30, 260, 60)])).toBe('ABH514');
  });

  test('lines side by side, or far apart, are not joined', () => {
    // Same row (overlap vertically): not stacked.
    const sideBySide = plateCandidate([at('BKE', 0, 10, 100, 50), at('2090', 120, 12, 120, 50)]);
    expect(sideBySide).toBeNull();
    // Stacked but no horizontal overlap.
    expect(plateCandidate([at('BKE', 0, 10, 100, 50), at('2090', 200, 70, 100, 50)])).toBeNull();
    // Stacked but a big gap.
    expect(plateCandidate([at('BKE', 50, 0, 150, 50), at('2090', 50, 200, 150, 50)])).toBeNull();
  });

  test('a joined value that is not plate-shaped is still no result', () => {
    expect(plateCandidate([at('HONDA', 40, 10, 200, 50), at('CIVIC', 40, 66, 200, 50)])).toBeNull();
  });

  test('explainPlateCandidate gives the reason for each group', () => {
    const ex = explainPlateCandidate([at('PUNJAB', 120, 10, 90, 18), at('ABH514', 40, 40, 260, 60)]);
    expect(ex.value).toBe('ABH514');
    expect(ex.groups).toEqual([
      expect.objectContaining({ value: 'PUNJAB', ok: false, reason: 'must start with a letter and end with a digit' }),
      expect.objectContaining({ value: 'ABH514', ok: true, reason: 'ok' }),
    ]);
  });
});
