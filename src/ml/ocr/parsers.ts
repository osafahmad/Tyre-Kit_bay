// Parser reference from spec §5. OCR clean-up stays separate so the user can
// correct messy text before it's parsed.

export type ParsedTyreSize = {
  value: string;
  widthMm: number;
  aspectRatio: number;
  construction: string;
  rimInches: number;
};

export function parseTyreSize(text: string): ParsedTyreSize | null {
  const match = text
    .toUpperCase()
    .match(/\b(P|LT|ST|T)?\s*(\d{3})\s*\/\s*(\d{2})\s*(ZR|R|D|B)?\s*(\d{2}(?:\.\d)?)\b/);
  if (!match) return null;
  const [, prefix = '', width, aspectRatio, construction = 'R', rim] = match;
  return {
    value: `${prefix}${width}/${aspectRatio} ${construction}${rim}`,
    widthMm: Number(width),
    aspectRatio: Number(aspectRatio),
    construction,
    rimInches: Number(rim),
  };
}

export type ParsedDotAge = { week: number; year: number; ageYears: number; ageMonths: number };

export function parseDotAge(tin: string, now = new Date()): ParsedDotAge | null {
  const clean = tin.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/(\d{2})(\d{2})$/);
  if (!match) return null;
  const week = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (week < 1 || week > 53 || year > now.getFullYear()) return null;
  const made = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  let months =
    (now.getUTCFullYear() - made.getUTCFullYear()) * 12 + now.getUTCMonth() - made.getUTCMonth();
  if (now.getUTCDate() < made.getUTCDate()) months -= 1;
  if (months < 0) return null;
  return { week, year, ageYears: Math.floor(months / 12), ageMonths: months % 12 };
}
