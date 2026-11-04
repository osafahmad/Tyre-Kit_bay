import { chassisCandidate, cleanPlateText, plateCandidate, type OcrLineLike } from '../textCandidates';

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
    expect(plateCandidate([line('BOSS')])).toBe('BOSS');
    expect(plateCandidate([line('12 345')])).toBe('12 345');
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
