// Vehicle field rules from spec §5. Nothing here blocks the user.

/** Uppercases and keeps letters, numbers, spaces and hyphens. No country format. */
export function normalisePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9 -]/g, '');
}

/** Uppercases only. Letters and digits are never swapped (e.g. O/0, I/1). */
export function normaliseChassis(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Warn, don't block: chassis numbers are usually 5 to 17 letters and numbers. */
export function isUnusualChassis(value: string): boolean {
  return value.length > 0 && (value.length < 5 || value.length > 17);
}

/** For search: ignore case and hyphens (and spaces). */
export function plateSearchKey(value: string): string {
  return value.toUpperCase().replace(/[-\s]/g, '');
}

/** Empty strings are stored as null. */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
