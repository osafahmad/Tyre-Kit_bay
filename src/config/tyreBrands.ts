/**
 * Tyre brand names for reading Make from a whole sidewall frame
 * (`fullFrameMakeCandidate`, used by `sidewallTextFilter.ts`).
 *
 * An OCR line becomes a Make suggestion only when it contains one of these
 * names exactly, as a whole word. Case doesn't matter, and the spacing between
 * the words of a multi-word name doesn't either (`GENERAL  TIRE`). The value is
 * kept as read. Fragments (e.g. `iental`), look-alikes (`Contnental`) and
 * spelling variants (`Good Year`) never match; nothing is completed or
 * corrected (CLAUDE.md allows fuzzy matching only inside a detector Brand
 * crop, and there is no detector). Not exhaustive: an unlisted brand just
 * stays `Not read`, and the user types it. Edit freely.
 *
 * Left out on purpose: brand names that are everyday words likely to appear
 * elsewhere on a sidewall (e.g. Federal, Atlas, Torque, General on its own).
 */
export const KNOWN_TYRE_BRANDS: readonly string[] = [
  'Achilles',
  'Aeolus',
  'Apollo',
  'Austone',
  'Avon',
  'Barum',
  'BFGoodrich',
  'Bridgestone',
  'Ceat',
  'Continental',
  'Cooper',
  'Davanti',
  'Debica',
  'Delinte',
  'Dunlop',
  'Falken',
  'Firestone',
  'Fulda',
  'General Tire',
  'Gislaved',
  'Giti',
  'Goodride',
  'Goodyear',
  'Hankook',
  'Hifly',
  'Kenda',
  'Kleber',
  'Kormoran',
  'Kumho',
  'Landsail',
  'Lassa',
  'Laufenn',
  'Linglong',
  'Marshal',
  'Matador',
  'Maxxis',
  'Michelin',
  'MRF',
  'Nankang',
  'Nexen',
  'Nitto',
  'Nokian',
  'Petlas',
  'Pirelli',
  'Riken',
  'Roadstone',
  'Sailun',
  'Sava',
  'Semperit',
  'Servis',
  'Sumitomo',
  'Tigar',
  'Toyo',
  'Triangle',
  'Uniroyal',
  'Vredestein',
  'Wanli',
  'Westlake',
  'Yokohama',
  'Zeetex',
];
