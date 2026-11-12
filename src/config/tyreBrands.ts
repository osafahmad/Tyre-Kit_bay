/**
 * Tyre brand names for reading Make from a whole sidewall frame
 * (`fullFrameMakeCandidate`, used by `sidewallTextFilter.ts`).
 *
 * An OCR line becomes a Make suggestion only when it contains one of these
 * names exactly, as a whole word. Case doesn't matter, and the spacing between
 * the words of a multi-word name doesn't either (`GENERAL  TIRE`). The value is
 * kept as read. Look-alikes (`Contnental`) and spelling variants (`Good Year`)
 * never match. The only fragment rule is `BRAND_ROOTS` in
 * `src/ml/sidewallTextFilter.ts` (owner decision 2026-11-10: e.g. `tinentals`
 * → Continental), and its roots change only with owner approval. Not
 * exhaustive: an unlisted brand just stays `Not read`, and the user types it.
 * Edit the list freely.
 *
 * Left out on purpose: brand names that are everyday words likely to appear
 * elsewhere on a sidewall (e.g. Federal, Atlas, Torque, General on its own).
 *
 * Owner request 2026-11-12 (iPhone 13, Purfect KB-27 on a street car): added
 * Purfect, Panther and Chaoyang; the other regional brands asked for
 * (Servis, Sailun, Triangle, Linglong, Goodride, Kumho, Nexen, Giti, Maxxis,
 * Toyo, Falken, Nankang, General Tire) were already listed. GT Radial stays
 * out: `RADIAL`, on almost every tyre, matched it as a fragment (DECISIONS.md,
 * round 4).
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
  'Chaoyang',
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
  'Panther',
  'Petlas',
  'Pirelli',
  'Purfect',
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
