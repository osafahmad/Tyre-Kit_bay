export type TyreCount = 2 | 4 | 6;

export const TYRE_COUNTS: TyreCount[] = [2, 4, 6];
export const DEFAULT_TYRE_COUNT: TyreCount = 4;

/** Rows as drawn on Select tyres. Flattened, this is the scan order (spec §4.12). */
export const tyreLayouts: Record<TyreCount, string[][]> = {
  2: [['Front'], ['Rear']],
  4: [
    ['Left front', 'Right front'],
    ['Left rear', 'Right rear'],
  ],
  6: [
    ['Left front', 'Right front'],
    ['Left rear outer', 'Right rear outer'],
    ['Left rear inner', 'Right rear inner'],
  ],
};

export function positionsFor(count: TyreCount): string[] {
  return tyreLayouts[count].flat();
}

/** Selected positions in scan order. */
export function orderedSelection(count: TyreCount, selected: ReadonlySet<string>): string[] {
  return positionsFor(count).filter(p => selected.has(p));
}

export function scanButtonLabel(selectedCount: number): string {
  return selectedCount === 1 ? 'Scan 1 tyre' : `Scan ${selectedCount} tyres`;
}

/** "Left front" → "Left front tyre". */
export function tyreName(position: string): string {
  return `${position} tyre`;
}
