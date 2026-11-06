/**
 * Tyre brand names for the full-frame sidewall fallback (no detector crop).
 *
 * A full-frame OCR line becomes a Make suggestion only when it contains one of
 * these names exactly, as a whole word (ignoring case and spacing). Fragments
 * (e.g. `iental`) and similar words never match; nothing is completed or
 * corrected. Not exhaustive: an unlisted brand just stays `Not read`, and the
 * user types it. Edit freely.
 *
 * Case, spaces and punctuation don't matter (`CONTINENTAL`, `Good Year`,
 * `B.F. Goodrich` all match), so spelling variants don't need their own entry.
 * Left out on purpose: brand names that are everyday words likely to appear
 * elsewhere on a sidewall (e.g. Federal, Atlas, Torque, General on its own).
 * More brands also make fragment matching stricter (a clear winner is needed).
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
