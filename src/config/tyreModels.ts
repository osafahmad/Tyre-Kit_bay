/**
 * Tyre model families for reading Model from a whole sidewall frame
 * (`fullFrameModelCandidate` in `src/ml/ocr/sidewallFields.ts`), owner
 * decision 2026-11-11 (Redmi 13 logs: `ComfortContact`, `Comfort Contact`,
 * `CC7` read in most frames).
 *
 * An OCR line gives a Model suggestion only when it contains a listed family
 * name exactly, as a whole word. Case doesn't matter, and the spacing between
 * the words of a name doesn't either (`Comfort Contact` and `ComfortContact`
 * both give the listed spelling `ComfortContact`), and so does a hyphen
 * (`KB-27`, `KB27` and `KB 27` all give `KB-27`). A variant code is added
 * only when one of the family's listed codes was read as a whole token, or
 * glued to the end of a fragment of the family name (`OntactCC7`)
 * (`CC7` → `ComfortContact CC7`), in the same frame or in another frame of
 * the same scan. Codes are letters and digits, never a bare number, because
 * numbers are everywhere on a sidewall (`Primacy 4` is suggested as
 * `Primacy`; the user adds the 4), and at least 3 characters (`P7` or `4S`
 * could be a plant code in a TIN). Nothing else is ever suggested as a model:
 * an unlisted model stays `Not read` and the user types it. Edit the list
 * freely; keep every code unique across families.
 *
 * Left out on purpose: family names that are everyday words likely to appear
 * elsewhere on a sidewall, or that are a brand name on their own.
 */
export type TyreModelFamily = {
  brand: string;
  /** Listed spelling, used as the suggestion. */
  family: string;
  /** Variant codes printed next to the family name, as whole tokens. */
  codes: readonly string[];
};

export const KNOWN_TYRE_MODELS: readonly TyreModelFamily[] = [
  // Continental
  { brand: 'Continental', family: 'ComfortContact', codes: ['CC5', 'CC6', 'CC7'] },
  { brand: 'Continental', family: 'UltraContact', codes: ['UC6', 'UC7'] },
  { brand: 'Continental', family: 'EcoContact', codes: [] },
  { brand: 'Continental', family: 'SportContact', codes: [] },
  { brand: 'Continental', family: 'PremiumContact', codes: [] },
  { brand: 'Continental', family: 'AllSeasonContact', codes: [] },
  { brand: 'Continental', family: 'WinterContact', codes: ['TS850', 'TS860', 'TS870'] },
  { brand: 'Continental', family: 'CrossContact', codes: [] },
  { brand: 'Continental', family: 'VanContact', codes: [] },
  { brand: 'Continental', family: 'ContiSportContact', codes: [] },
  { brand: 'Continental', family: 'ContiPremiumContact', codes: [] },
  { brand: 'Continental', family: 'ContiEcoContact', codes: [] },
  { brand: 'Continental', family: 'MaxContact', codes: ['MC6', 'MC7'] },
  // Michelin
  { brand: 'Michelin', family: 'Primacy', codes: [] },
  { brand: 'Michelin', family: 'Pilot Sport', codes: [] },
  { brand: 'Michelin', family: 'Energy Saver', codes: [] },
  { brand: 'Michelin', family: 'CrossClimate', codes: [] },
  { brand: 'Michelin', family: 'Alpin', codes: [] },
  { brand: 'Michelin', family: 'Latitude Sport', codes: [] },
  { brand: 'Michelin', family: 'Latitude Tour', codes: [] },
  { brand: 'Michelin', family: 'Agilis', codes: [] },
  // Bridgestone
  { brand: 'Bridgestone', family: 'Turanza', codes: ['T001', 'T005', 'ER300', 'ER33'] },
  { brand: 'Bridgestone', family: 'Potenza', codes: ['S001', 'S007', 'RE050A', 'RE003', 'RE004', 'RE980AS'] },
  { brand: 'Bridgestone', family: 'Ecopia', codes: ['EP150', 'EP300', 'EP422', 'EP25'] },
  { brand: 'Bridgestone', family: 'Dueler', codes: ['D684', 'D697', 'A001'] },
  { brand: 'Bridgestone', family: 'Blizzak', codes: ['LM005', 'LM001', 'WS90'] },
  { brand: 'Bridgestone', family: 'Weather Control', codes: ['A005'] },
  // Goodyear
  { brand: 'Goodyear', family: 'EfficientGrip', codes: [] },
  { brand: 'Goodyear', family: 'Eagle F1', codes: [] },
  { brand: 'Goodyear', family: 'Vector 4Seasons', codes: [] },
  { brand: 'Goodyear', family: 'UltraGrip', codes: [] },
  { brand: 'Goodyear', family: 'Wrangler', codes: [] },
  { brand: 'Goodyear', family: 'Assurance', codes: [] },
  // Pirelli
  { brand: 'Pirelli', family: 'P Zero', codes: [] },
  { brand: 'Pirelli', family: 'Cinturato', codes: [] },
  { brand: 'Pirelli', family: 'Scorpion', codes: [] },
  { brand: 'Pirelli', family: 'Sottozero', codes: [] },
  { brand: 'Pirelli', family: 'Powergy', codes: [] },
  // Purfect (owner request 2026-11-12, iPhone 13 street car). Read as `KB-27`,
  // `KB27` or `KB 27`; always suggested as `KB-27`.
  { brand: 'Purfect', family: 'KB-27', codes: [] },
];
