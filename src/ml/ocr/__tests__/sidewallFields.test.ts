import {
  agreedValue,
  dotCandidate,
  fullFrameDotCandidate,
  fullFrameMakeCandidate,
  fullFrameSizeCandidate,
} from '../sidewallFields';
import type { OcrLineLike } from '../textCandidates';

const NOW = new Date(Date.UTC(2026, 10, 6));
const line = (text: string, y = 0, height = 20, x = 0): OcrLineLike => ({
  text,
  frame: { x, y, width: 100, height },
});

describe('size', () => {
  test('uses the tyre size parser', () => {
    expect(fullFrameSizeCandidate([line('205/55R16 91V')])).toBe('205/55 R16');
    expect(fullFrameSizeCandidate([line('MADE IN'), line('lt265/70 r17', 30)])).toBe('LT265/70 R17');
  });

  test('joins lines when OCR splits the size', () => {
    expect(fullFrameSizeCandidate([line('R16', 0, 20, 120), line('205/55', 0, 20, 0)])).toBe('205/55 R16');
  });

  test('no size-shaped text → no suggestion', () => {
    expect(fullFrameSizeCandidate([line('TUBELESS'), line('2O5/55R16')])).toBeNull();
  });
});

describe('DOT/TIN', () => {
  test('full TIN, DOT prefix removed, as read', () => {
    expect(dotCandidate([line('DOT 4B 7Y'), line('ABC 2319', 30)], NOW)).toBe('4B 7Y ABC 2319');
  });

  test('date code alone is a valid read', () => {
    expect(dotCandidate([line('2319')], NOW)).toBe('2319');
  });

  test('rejects invalid date codes and wrong lengths', () => {
    expect(dotCandidate([line('DOT 4B7Y ABC 5719')], NOW)).toBeNull(); // week 57
    expect(dotCandidate([line('DOT 4B7Y ABC 0127')], NOW)).toBeNull(); // future year
    expect(dotCandidate([line('DOT 4B7Y ABC23I9')], NOW)).toBeNull(); // I not swapped for 1
    expect(dotCandidate([line('319')], NOW)).toBeNull();
    expect(dotCandidate([line('DOT ABCDEFGHIJK 2319')], NOW)).toBeNull(); // 15 chars
  });
});

test('no OCR lines → no candidate for any field', () => {
  expect(fullFrameSizeCandidate([])).toBeNull();
  expect(fullFrameDotCandidate([], NOW)).toBeNull();
  expect(fullFrameMakeCandidate([])).toBeNull();
});

describe('agreement across frames', () => {
  test('needs enough matching reads (ignoring case and spaces)', () => {
    expect(agreedValue([{ value: 'MICHELIN', score: 0.9 }], 2)).toBeNull();
    expect(
      agreedValue(
        [
          { value: 'MICHELIN', score: 0.6 },
          { value: 'Michelin', score: 0.9 },
          { value: 'MICHELN', score: 0.95 },
        ],
        2,
      ),
    ).toBe('Michelin');
  });

  test('ties go to the higher total score', () => {
    expect(
      agreedValue(
        [
          { value: 'A1', score: 0.3 },
          { value: 'B2', score: 0.9 },
          { value: 'A1', score: 0.3 },
          { value: 'B2', score: 0.4 },
        ],
        2,
      ),
    ).toBe('B2');
  });
});

describe('full-frame parsers', () => {
  test('size: one line at a time, real tyre ranges only', () => {
    expect(fullFrameSizeCandidate([line('MICHELIN'), line('205/55R16 91V', 30)])).toBe('205/55 R16');
    // Joined with a rim read on the same row or the next line (owner request, round 5).
    expect(fullFrameSizeCandidate([line('205/55'), line('R16', 0, 20, 120)])).toBe('205/55 R16');
    expect(fullFrameSizeCandidate([line('205/55'), line('MADE IN'), line('R16', 60)])).toBe('205/55 R16'); // two lines away (2026-11-10)
    expect(fullFrameSizeCandidate([line('205/55'), line('MADE IN', 30), line('USA', 60), line('R16', 90)])).toBeNull();
    expect(fullFrameSizeCandidate([line('900/99R40')])).toBeNull();
    expect(fullFrameSizeCandidate([line('100/90R17')])).toBe('100/90 R17'); // motorcycle
    expect(fullFrameSizeCandidate([line('095/90R17')])).toBeNull(); // width below 100
  });

  test('DOT: needs a line starting with DOT and a whole TIN, maybe wrapped to the next line', () => {
    expect(fullFrameDotCandidate([line('DOT 4B7Y ABC 2319')], NOW)).toBe('4B7Y ABC 2319');
    expect(fullFrameDotCandidate([line('DOT 4B7Y ABC'), line('2319', 30)], NOW)).toBe('4B7Y ABC 2319');
    expect(fullFrameDotCandidate([line('4B7Y ABC 2319')], NOW)).toBeNull(); // no DOT
    expect(fullFrameDotCandidate([line('DOT 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124'); // device tyre
    expect(fullFrameDotCandidate([line('DOT 2319')], NOW)).toBeNull(); // too short
    expect(fullFrameDotCandidate([line('ENDOT 4B7Y ABC 2319')], NOW)).toBeNull();
    expect(fullFrameDotCandidate([line('DOT 4B7Y ABC 5719')], NOW)).toBeNull(); // week 57
  });
});

describe('OCR misreads around DOT', () => {
  test('stray characters before the word DOT are dropped', () => {
    expect(fullFrameDotCandidate([line('. DOT 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124');
    expect(fullFrameDotCandidate([line('4 DOT 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124');
    expect(fullFrameDotCandidate([line('~DOT 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124');
    expect(dotCandidate([line('i. DOT 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124');
  });

  test('DOT glued to letters is not the DOT word', () => {
    expect(fullFrameDotCandidate([line('ENDOT 1Y6 032MKT 0124')], NOW)).toBeNull();
    expect(fullFrameDotCandidate([line('DOTX 1Y6 032MKT 0124')], NOW)).toBeNull();
  });

  test('a letter O as the first date-code character is read as 0 (CLAUDE.md exception)', () => {
    expect(fullFrameDotCandidate([line('DOT 1Y6 032MKT O124')], NOW)).toBe('1Y6 032MKT 0124');
    expect(dotCandidate([line('DOT 1Y6 032MKT o124')], NOW)).toBe('1Y6 032MKT 0124');
  });

  test('no other swaps: O elsewhere, other letters, invalid results', () => {
    expect(dotCandidate([line('DOT 1Y6 032MKT 0O24')], NOW)).toBeNull(); // O at position 2
    expect(dotCandidate([line('DOT 1Y6 032MKT D124')], NOW)).toBeNull(); // D is not fixed
    expect(dotCandidate([line('DOT 1Y6 032MKT Q124')], NOW)).toBeNull();
    expect(dotCandidate([line('DOT 1Y6 032MKT O127')], NOW)).toBeNull(); // 0127 is a future year
    expect(dotCandidate([line('DOT 1Y6 O32MKT 0124')], NOW)).toBe('1Y6 O32MKT 0124'); // TIN body kept as read
  });

  test('misread DOT markers from the iPhone 13 logs locate the TIN (owner decision 2026-11-10)', () => {
    expect(fullFrameDotCandidate([line('D0TYG09RURT O124')], NOW)).toBe('YG09RURT 0124');
    expect(fullFrameDotCandidate([line('oot 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124');
    expect(fullFrameDotCandidate([line('ODTS 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124');
    expect(fullFrameDotCandidate([line('DTS1Y6 032MKT'), line('0124', 30)], NOW)).toBe('1Y6 032MKT 0124');
  });

  test('a misread marker still needs a full TIN with a valid date', () => {
    expect(fullFrameDotCandidate([line('oottDE')], NOW)).toBeNull();
    expect(fullFrameDotCandidate([line('ootDTO 1Y6')], NOW)).toBeNull();
    expect(fullFrameDotCandidate([line('DTS1D 032MKT 5724')], NOW)).toBeNull(); // week 57
  });
});

describe('round 9: DOT marker misreads and marker-less TINs (owner decision 2026-11-10)', () => {
  const { markerlessTinCandidate } = require('../sidewallFields') as typeof import('../sidewallFields');

  test('iPhone 13 marker misreads locate the TIN; the TIN is kept as read', () => {
    expect(fullFrameDotCandidate([line('OT1DT IOES 2421')], NOW)).toBe('IOES 2421');
    expect(fullFrameDotCandidate([line('oTELDT 4B8R 1222')], NOW)).toBe('4B8R 1222');
    expect(fullFrameDotCandidate([line('OT 4B8R 1222')], NOW)).toBe('4B8R 1222');
    expect(fullFrameDotCandidate([line('DQT EX2H 4KR 3721')], NOW)).toBe('EX2H 4KR 3721');
  });

  test('logged reads with no date code stay empty', () => {
    for (const text of ['otS1OUUSs', '100ULSS', 'oTELDT', 'OT1DT IOES']) {
      expect(fullFrameDotCandidate([line(text)], NOW)).toBeNull();
    }
  });

  test('short marker tokens only count as whole tokens', () => {
    expect(fullFrameDotCandidate([line('TOTAL 4B8R 1222')], NOW)).toBeNull();
    expect(fullFrameDotCandidate([line('TEAPOT 4B8R 1222')], NOW)).toBeNull();
    expect(fullFrameDotCandidate([line('POT 4B8R 1222')], NOW)).toBe('4B8R 1222'); // whole token: round 10 marker
  });

  test('date code: week 01–53, not in the future', () => {
    expect(fullFrameDotCandidate([line('OT 4B8R 5324')], NOW)).toBe('4B8R 5324');
    expect(fullFrameDotCandidate([line('OT 4B8R 5424')], NOW)).toBeNull(); // week 54
    expect(fullFrameDotCandidate([line('OT 4B8R 0024')], NOW)).toBeNull(); // week 00
    expect(fullFrameDotCandidate([line('OT 4B8R 0127')], NOW)).toBeNull(); // 2027
  });

  test('marker-less TIN: strict shape only', () => {
    expect(markerlessTinCandidate([line('EX2H 4KR 3721')], NOW)).toBe('EX2H 4KR 3721');
    expect(markerlessTinCandidate([line('MAX LOAD 600 KG (1323 LBS)')], NOW)).toBeNull(); // date not last; unit words
    expect(markerlessTinCandidate([line('600 KG 1323')], NOW)).toBeNull(); // unit word
    expect(markerlessTinCandidate([line('1234 5678 1323')], NOW)).toBeNull(); // no letter
    expect(markerlessTinCandidate([line('2421')], NOW)).toBeNull(); // date code alone
    expect(markerlessTinCandidate([line('EX2H 5719')], NOW)).toBeNull(); // week 57
    expect(markerlessTinCandidate([line('DOT EX2H 4KR 3721')], NOW)).toBeNull(); // has a marker: other path
  });
});

describe('make from a whole frame: known brand names only', () => {
  test('exact whole-word brand, as read', () => {
    expect(fullFrameMakeCandidate([line('OUTSIDE'), line('Continental', 30, 40)])).toBe('Continental');
    expect(fullFrameMakeCandidate([line('MICHELIN X-ICE')])).toBe('MICHELIN');
    expect(fullFrameMakeCandidate([line('general  tire')])).toBe('general tire');
  });

  test('fragments, look-alikes and other words never match', () => {
    for (const text of ['iental', 'Contnental', 'Comfortcontact', 'OUTSIDE', 'RADIAL TUBELESS', 'Continentals', 'XContinental']) {
      expect(fullFrameMakeCandidate([line(text)])).toBeNull();
    }
  });

  test('the most prominent brand line wins', () => {
    expect(fullFrameMakeCandidate([line('Made for Pirelli', 0, 10), line('Bridgestone', 30, 50)])).toBe('Bridgestone');
  });

  test('the list has the expected brands', () => {
    const { KNOWN_TYRE_BRANDS } = require('../../../config/tyreBrands') as typeof import('../../../config/tyreBrands');
    expect(KNOWN_TYRE_BRANDS).toEqual(expect.arrayContaining(['Continental', 'Michelin', 'Bridgestone', 'Roadstone']));
    expect(KNOWN_TYRE_BRANDS).not.toContain('GT Radial');
    expect(fullFrameMakeCandidate([line('ROADSTONE')])).toBe('ROADSTONE');
  });
});

describe('model from a whole frame: listed families only (owner decision 2026-11-11)', () => {
  const { fullFrameModelCandidate, fullFrameModelCode, modelText } = require('../sidewallFields') as typeof import('../sidewallFields');

  test('family read whole, any case or spacing, gives the listed spelling', () => {
    expect(fullFrameModelCandidate([line('ComfortContact CC7')])).toEqual({ brand: 'Continental', family: 'ComfortContact', code: 'CC7' });
    expect(fullFrameModelCandidate([line('Comfort Contact', 0, 30), line('CC7', 40)])).toEqual({ brand: 'Continental', family: 'ComfortContact', code: 'CC7' });
    expect(fullFrameModelCandidate([line('COMFORTCONTACT')])).toEqual({ brand: 'Continental', family: 'ComfortContact', code: null });
    expect(fullFrameModelCandidate([line('Primacy 4')])).toEqual({ brand: 'Michelin', family: 'Primacy', code: null });
    expect(fullFrameModelCandidate([line('TURANZA T005')])).toEqual({ brand: 'Bridgestone', family: 'Turanza', code: 'T005' });
    expect(modelText({ family: 'ComfortContact', code: 'CC7' })).toBe('ComfortContact CC7');
    expect(modelText({ family: 'ComfortContact', code: null })).toBe('ComfortContact');
  });

  test('fragments, glued letters and unlisted text never match', () => {
    for (const text of ['orContact', 'ComfortContacts', 'XComfortContact', 'Contact', 'Continental', 'OUTSIDE', 'ECOCONTACTS']) {
      expect(fullFrameModelCandidate([line(text)])).toBeNull();
    }
    // Spaces at a camel-case join are fine; the bare number after it is never added.
    expect(fullFrameModelCandidate([line('ECO CONTACT 6 X')])).toEqual({ brand: 'Continental', family: 'EcoContact', code: null });
  });

  test('a code only counts as a whole token, and only for its own family', () => {
    expect(fullFrameModelCandidate([line('ComfortContact'), line('CC70', 30)])?.code).toBeNull();
    expect(fullFrameModelCandidate([line('ComfortContact'), line('UC6', 30)])?.code).toBeNull();
    expect(fullFrameModelCode([line('CC7')])).toEqual({ family: 'ComfortContact', code: 'CC7' });
    expect(fullFrameModelCode([line('CC70'), line('ACC7', 30)])).toBeNull();
  });

  test('the most prominent family line wins', () => {
    expect(fullFrameModelCandidate([line('Primacy', 0, 10), line('ComfortContact', 30, 50)])?.family).toBe('ComfortContact');
  });

  test('listed codes are unique across families and never bare numbers or under 3 characters', () => {
    const { KNOWN_TYRE_MODELS } = require('../../../config/tyreModels') as typeof import('../../../config/tyreModels');
    const codes = KNOWN_TYRE_MODELS.flatMap(m => m.codes);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z0-9]{3,}$/);
      expect(code).toMatch(/[A-Z]/);
    }
    expect(new Set(KNOWN_TYRE_MODELS.map(m => m.family.toUpperCase())).size).toBe(KNOWN_TYRE_MODELS.length);
  });
});

describe('agreement keys', () => {
  const { readKey } = require('../sidewallFields') as typeof import('../sidewallFields');

  test('ignore case, spaces and punctuation', () => {
    expect(readKey('Primacy 4.')).toBe(readKey('PRIMACY4'));
  });
});

describe('size recovery (round 5)', () => {
  const { recoverSize } = require('../sidewallFields') as typeof import('../sidewallFields');
  const rows = (...texts: string[]) => texts.map((t, i) => line(t, i * 30));

  test('full width/aspect joined with a rim on the same or adjacent line', () => {
    expect(recoverSize(rows('195/55', 'R 15 85V'))).toBe('195/55 R15');
    expect(recoverSize(rows('R15 85V', '195/55'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55 xx R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', 'OUTSIDE', 'R15'))).toBe('195/55 R15'); // two lines away
    expect(recoverSize(rows('R15', 'OUTSIDE', '195/55'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', 'OUTSIDE', 'TUBELESS', 'R15'))).toBeNull(); // three lines away
  });

  test('iPhone 13 reads: load/speed glued to the rim (owner decision 2026-11-10)', () => {
    expect(recoverSize(rows('195/55', 'R1585V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '3R1525V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', 'R15 85V'))).toBe('195/55 R15');
    expect(recoverSize(rows('95/55', 'R1585V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/56', 'R1585V'))).toBe('195/56 R15'); // aspect kept as read
  });

  test('iPhone 13 reads with no R are never given a rim', () => {
    expect(recoverSize(rows('195/55', 'S5815 85v'))).toBeNull();
    expect(recoverSize(rows('195/55', 'R58SV'))).toBeNull(); // R58 is outside the rim limits
    expect(recoverSize(rows('195/55', 'STR15'))).toBeNull(); // letter glued before R
  });

  test('round 3: slash-less sizes (owner decision 2026-11-10)', () => {
    expect(recoverSize(rows('19555 R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('LLSS 19555R15a'))).toBe('195/55 R15');
    expect(recoverSize(rows('20555 B16'))).toBe('205/55 R16');
    expect(recoverSize(rows('19555 815'))).toBe('195/55 R15');
    expect(recoverSize(rows('9555 R15'))).toBe('195/55 R15'); // width digit via the rim-gated rule
  });

  test('round 3: slash-less reads that stay empty', () => {
    expect(recoverSize(rows('9335 R15'))).toBeNull(); // 93 is not the end of a 175–225 width
    expect(recoverSize(rows('19533 R15'))).toBeNull(); // aspect 33 is not a real aspect
    expect(recoverSize(rows('19555815'))).toBeNull(); // 8 glued to the digits is not split
    expect(recoverSize(rows('9555 R18'))).toBeNull(); // rim outside R13–R17 for inference
    expect(recoverSize(rows('MAX 61555 R15'))).toBeNull(); // 615 is not a 160–295 width
  });

  test('round 3: 8 read for R next to a width/aspect (owner decision 2026-11-10)', () => {
    expect(recoverSize(rows('195/55', '815W5V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '815 85V'))).toBe('195/55 R15');
    expect(recoverSize(rows('A95/55', '81545Vt'))).toBe('195/55 R15'); // 2026-11-06 device line
    expect(recoverSize(rows('195/55', '815 KG'))).toBeNull();
    expect(recoverSize(rows('195/55', '5815 85V'))).toBeNull(); // digit glued before the 8
    expect(recoverSize(rows('195/ER', '815W5V'))).toBeNull(); // aspect never read: not invented
  });

  test('round 4: device reads already handled (trailing letter, glued load/speed)', () => {
    expect(recoverSize(rows('195/55 p', '55 R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55p', 'R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '85 R1585VC'))).toBe('195/55 R15');
  });

  test('round 4: l or I read for the 1 of a rim, only before a load/speed (owner decision 2026-11-10)', () => {
    expect(recoverSize(rows('195/55', 'Rl565V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', 'RI585V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55 p', 'Rl5 85V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', 'Rl5'))).toBe('195/55 R15'); // end of token (round 8)
    expect(recoverSize(rows('195/55', 'Rl5X'))).toBeNull(); // X is not a speed symbol
    expect(recoverSize(rows('95/56 Ri', 'S85VE'))).toBeNull(); // no rim digit read
  });

  test('round 4: 55 R15 joined only with a width actually read next to it', () => {
    expect(recoverSize(rows('195', '55 R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('55 R15', '195/'))).toBe('195/55 R15');
    expect(recoverSize(rows('95/', '55 Rl565V'))).toBe('195/55 R15'); // rim-gated width digit
    expect(recoverSize(rows('55 R15'))).toBeNull(); // no width read: never added
    expect(recoverSize(rows('Continental', '55 R15'))).toBeNull(); // a brand doesn't give a width
    expect(recoverSize(rows('ComfortContact', '55 R15'))).toBeNull();
    expect(recoverSize(rows('95', '55 R15'))).toBeNull(); // bare 95 could be a load index
    expect(recoverSize(rows('MAX LOAD 195', '55 R15'))).toBeNull(); // width must be alone on its line
  });

  test('round 4: bare numbers are never a rim', () => {
    expect(recoverSize(rows('195/55 p', '15'))).toBeNull();
    expect(recoverSize(rows('195/55 p', '815'))).toBeNull();
  });

  test('round 5: rim marker ends a line, rim digits start the next (owner decision 2026-11-10)', () => {
    for (const next of ['158s', '15', '15 85', '15 85V', '1585V']) {
      expect(recoverSize(rows('195/55 R', next))).toBe('195/55 R15');
    }
    expect(recoverSize(rows('195/55 B', '15'))).toBe('195/55 R15');
    expect(recoverSize(rows('225/45 ZR', '17 94W'))).toBe('225/45 ZR17');
  });

  test('round 5: what stays empty', () => {
    expect(recoverSize(rows('195/55 R', '1555'))).toBeNull(); // 4 digits: could be a date code
    expect(recoverSize(rows('195/55 R', '58'))).toBeNull(); // not a rim 13–22
    expect(recoverSize(rows('195/55 R', 'OUTSIDE', '15'))).toBeNull(); // digits must be on the next line
    expect(recoverSize(rows('15', '195/55 R'))).toBeNull(); // digits before the marker
    expect(recoverSize(rows('o3/55 R15'))).toBeNull(); // no width digits read: width is never made up
    expect(recoverSize(rows('a0/55 R15'))).toBeNull();
  });

  test('round 7: frame 6/8, 19555 then 1585V6: (owner decision 2026-11-10)', () => {
    expect(recoverSize(rows('19555', '1585V6:'))).toBe('195/55 R15');
    expect(recoverSize(rows('19555', '15 85V'))).toBe('195/55 R15');
    expect(recoverSize(rows('19555', 'OUTSIDE', 'R15'))).toBe('195/55 R15'); // marked rim within two lines
    expect(recoverSize(rows('19555', '15'))).toBeNull(); // bare rim digits
    expect(recoverSize(rows('19555', 'OUTSIDE', '1585V'))).toBeNull(); // unmarked rim must be on the next line
    expect(recoverSize(rows('DOT 19555', '1585V'))).toBeNull(); // 19555 must be alone on its line
  });

  test('round 7: space, dot, dash or ) instead of the slash', () => {
    expect(recoverSize(rows('195 55', 'R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('195.55 R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('195-55', 'Rl565V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195) 55', '1585V'))).toBe('195/55 R15');
    expect(recoverSize(rows('A95 55', 'R15'))).toBe('195/55 R15'); // rim-gated width digit
  });

  test('round 7: frame 3/8 and 4/8 stay empty: no slash and no rim marker together', () => {
    expect(recoverSize(rows('A95 55', '15'))).toBeNull();
    expect(recoverSize(rows('A95) 55 F', '158'))).toBeNull();
    expect(recoverSize(rows('A95 55', '1585V'))).toBeNull(); // width digit is inferred only with a marked rim
    expect(recoverSize(rows('MAX PRESS 350 KPA (51 PSI)', 'R15'))).toBeNull();
  });

  test('round 8: run 1 frame 8/8, 195/55 then Rl5 V two lines down (owner decision 2026-11-10)', () => {
    expect(recoverSize(rows('Continental', '195/55', 'OUTSIDE', 'Rl5 V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', 'RI5 H'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', 'Rl5 T'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', 'Rl5VAN'))).toBeNull(); // letters glued on: a word, not a speed symbol
    expect(recoverSize(rows('195/55', 'RIS'))).toBeNull(); // no rim digit
  });

  test('round 8: size parts for joining across frames', () => {
    const { sizeParts } = require('../sidewallFields') as typeof import('../sidewallFields');
    expect(sizeParts(rows('195 55'))).toMatchObject({ widthAspect: '195/55', rim: null });
    expect(sizeParts(rows('19555'))).toMatchObject({ widthAspect: '195/55', rim: null });
    expect(sizeParts(rows('R15 85Vt'))).toMatchObject({ widthAspect: null, rim: 15 });
    expect(sizeParts(rows('Rl565V'))).toMatchObject({ widthAspect: null, rim: 15 });
    expect(sizeParts(rows('R15', '95/55', '15'))).toEqual({ widthAspect: null, shortWidthAspect: '95/55', rim: null }); // stray R15, bare 15; the short width is a round-11 part
  });

  test('width inference still needs the rim on the same or adjacent line', () => {
    expect(recoverSize(rows('95/55', 'OUTSIDE', 'R15'))).toBeNull();
  });

  test('device reads: missing hundreds digit inferred only with a rim R13–R17 nearby', () => {
    expect(recoverSize(rows('A95/55', 'R154'))).toBe('195/55 R15'); // stray digit after the rim
    expect(recoverSize(rows('95/55 R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('H85/65', 'R14'))).toBe('185/65 R14');
    expect(recoverSize(rows('05/55', 'R16'))).toBe('205/55 R16');
    expect(recoverSize(rows('25/45', 'R17'))).toBe('225/45 R17');
  });

  test('never inferred: no rim, big rims, or widths outside 175–225', () => {
    expect(recoverSize(rows('A95/55'))).toBeNull(); // no rim
    expect(recoverSize(rows('A95/55', '815'))).toBeNull(); // bare 8+rim: nothing follows, so not a rim
    expect(recoverSize(rows('85/45', 'R20'))).toBeNull(); // likely 285: rim gate
    expect(recoverSize(rows('95/55', 'R18'))).toBeNull();
    expect(recoverSize(rows('65/65', 'R15'))).toBeNull(); // 165 not allowed
    expect(recoverSize(rows('35/55', 'R15'))).toBeNull(); // 235 not allowed
  });

  test('a full width read is never changed', () => {
    expect(recoverSize(rows('295/55', 'R15'))).toBe('295/55 R15');
    expect(recoverSize(rows('A95/6S R15'))).toBeNull(); // aspect misread: no healing of S→5
  });

  describe('round 10: iPhone 13 + Redmi 13 size lines (owner request 2026-11-11)', () => {
    test('load/speed after the rim on the same line, glued or not, with OCR noise around it', () => {
      expect(recoverSize(rows('195/55 R15 85V'))).toBe('195/55 R15');
      expect(recoverSize(rows('195/55 R1585V'))).toBe('195/55 R15');
      expect(recoverSize(rows('195/55 R1585VLt:'))).toBe('195/55 R15');
      expect(recoverSize(rows('195/55 3R1585V'))).toBe('195/55 R15'); // stray digit before the R
      expect(recoverSize(rows('ES 195/55', 'R1585V'))).toBe('195/55 R15'); // letters before the width
      expect(recoverSize(rows('ES 195/55 3R1585VLT:'))).toBe('195/55 R15');
    });

    test('3R585V: the rim digits were not read (R5…), so no rim is invented', () => {
      expect(recoverSize(rows('195/55 3R585V'))).toBeNull();
      expect(recoverSize(rows('ES 195/55', '3R585V'))).toBeNull();
      expect(recoverSize(rows('Continental', 'ES 195/55', 'ComfortContact', '3R585V'))).toBeNull();
    });

    test('495/35 R1585VLT: the width 495 is outside the limits and is never corrected', () => {
      expect(recoverSize(rows('495/35 R1585VLT:'))).toBeNull();
      expect(fullFrameSizeCandidate(rows('495/35 R1585VLT:'))).toBeNull();
    });

    test('a size line with its load/speed still gives its parts for the cross-frame join', () => {
      const { sizeParts } = require('../sidewallFields') as typeof import('../sidewallFields');
      expect(sizeParts(rows('195/55 3R585V'))).toMatchObject({ widthAspect: '195/55', rim: null });
      expect(sizeParts(rows('495/35 R1585VLT:'))).toMatchObject({ widthAspect: null, rim: 15 });
    });
  });
});

describe('round 11: screen-capture noise around the rim and two-digit widths (owner request 2026-11-11)', () => {
  const { recoverSize, sizeParts, completeShortWidthAspect } = require('../sidewallFields') as typeof import('../sidewallFields');
  const rows = (...texts: string[]) => texts.map((t, i) => line(t, i * 30));
  const none = { widthAspect: null, shortWidthAspect: null, rim: null };

  test('symbol or a single 3 before the 8-for-R marker, next to a width/aspect', () => {
    expect(recoverSize(rows('195/55', '$815 85V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '#815 85V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '$81525NE'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '3815 85V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', 'R1545V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '3R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '5815 85V'))).toBeNull(); // other digits before the 8 still rule it out
    expect(recoverSize(rows('195/55', '33815 85V'))).toBeNull();
    expect(recoverSize(rows('195/55', '3815'))).toBeNull(); // nothing follows: not a rim
  });

  test('an unmarked rim + load/speed line directly after a full width/aspect', () => {
    expect(recoverSize(rows('195/55', '1545V)'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '15 85V'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '1585V6:'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', '1323 LBS'))).toBeNull(); // a letter after the speed symbol: a unit, not a rim
    expect(recoverSize(rows('195/55', 'OUTSIDE', '1545V'))).toBeNull(); // must be the next line
    expect(recoverSize(rows('195/55', '15'))).toBeNull(); // bare number
    expect(recoverSize(rows('A95/55', '1545V'))).toBeNull(); // the width digit still needs a marked rim
  });

  test('size parts for the cross-frame join take the noisy rims and a two-digit width', () => {
    expect(sizeParts(rows('$815 85V'))).toEqual({ ...none, rim: 15 });
    expect(sizeParts(rows('3815 85V'))).toEqual({ ...none, rim: 15 });
    expect(sizeParts(rows('$81525NE'))).toEqual({ ...none, rim: 15 });
    expect(sizeParts(rows('1545V)'))).toEqual({ ...none, rim: 15 });
    expect(sizeParts(rows('1323 LBS'))).toEqual(none);
    expect(sizeParts(rows('MAX LOAD 1545V'))).toEqual(none); // not a whole line
    expect(sizeParts(rows('A95/55'))).toEqual({ ...none, shortWidthAspect: '95/55' });
    expect(sizeParts(rows('I95/55'))).toEqual({ ...none, shortWidthAspect: '95/55' });
    expect(sizeParts(rows('A95 55'))).toEqual({ ...none, shortWidthAspect: '95/55' });
    expect(sizeParts(rows('195/55', 'A95/55'))).toEqual({ ...none, widthAspect: '195/55' });
    expect(sizeParts(rows('AO5/35'))).toEqual(none); // O is not a digit: never repaired
  });

  test('completing a two-digit width across frames uses the same rim gate', () => {
    expect(completeShortWidthAspect('95/55', 15)).toBe('195/55 R15');
    expect(completeShortWidthAspect('05/55', 16)).toBe('205/55 R16');
    expect(completeShortWidthAspect('95/55', 18)).toBeNull(); // rim outside 13–17
    expect(completeShortWidthAspect('35/55', 15)).toBeNull(); // 235 is not in 175–225
    expect(completeShortWidthAspect('O5/55', 15)).toBeNull();
  });
});

describe('round 10: marker-less TIN wrapped over two lines (owner request 2026-11-11)', () => {
  const { markerlessTinCandidate } = require('../sidewallFields') as typeof import('../sidewallFields');
  const rows = (...texts: string[]) => texts.map((t, i) => line(t, i * 30));

  test('TIN body then the date code alone on the next line', () => {
    expect(markerlessTinCandidate(rows('EX2H 4KR', '3721'), NOW)).toBe('EX2H 4KR 3721');
    expect(markerlessTinCandidate(rows('1Y6 032MKT', '0124'), NOW)).toBe('1Y6 032MKT 0124');
    expect(markerlessTinCandidate(rows('OUTSIDE', 'EX2H 4KR', '3721'), NOW)).toBe('EX2H 4KR 3721');
  });

  test('a bare 4-digit number is never a DOT/TIN read', () => {
    expect(markerlessTinCandidate(rows('3721'), NOW)).toBeNull();
    expect(markerlessTinCandidate(rows('OUTSIDE', '3721'), NOW)).toBeNull(); // a word, not a plant/size code
    expect(markerlessTinCandidate(rows('TUBELESS RADIAL', '1323'), NOW)).toBeNull();
    expect(markerlessTinCandidate(rows('MAX LOAD 600', '1323'), NOW)).toBeNull();
    expect(markerlessTinCandidate(rows('600 KG', '1323'), NOW)).toBeNull();
    expect(markerlessTinCandidate(rows('1234 5678', '1323'), NOW)).toBeNull(); // no letter
    expect(markerlessTinCandidate(rows('EX2H 4KR', '1323 LBS'), NOW)).toBeNull(); // next line must be the date code alone
    expect(markerlessTinCandidate(rows('EX2H 4KR', '5724'), NOW)).toBeNull(); // week 57
    expect(markerlessTinCandidate(rows('EX2H 4KR', 'OUTSIDE', '3721'), NOW)).toBeNull(); // not adjacent
  });

  test('size text is never a TIN, even followed by a 4-digit number', () => {
    expect(markerlessTinCandidate(rows('195/55 R15 1323'), NOW)).toBeNull();
    expect(markerlessTinCandidate(rows('195/55', '1323'), NOW)).toBeNull();
    expect(markerlessTinCandidate(rows('R15 85V', '1323'), NOW)).toBeNull();
    expect(markerlessTinCandidate(rows('R1585V 3721'), NOW)).toBeNull();
  });
});
