import type { SessionSnapshot } from './captureSession';

/**
 * Status pill text on Sidewall and Tread capture (spec §4.13: `Focusing…`,
 * `Move closer`, `Move back`, `Hold steady`, `Too dark`, `Distance OK`).
 *
 * `Move closer` / `Move back` / `Distance OK` need the tyre detector (M7) and
 * aren't shown without it: claiming a distance that wasn't measured would be
 * wrong. Four extra messages cover cases the spec list doesn't (owner to confirm):
 * `Too bright`, `Keep moving`, `Ready to capture` (owner confirmed), and
 * `Image is clear` (renamed from `Looks good` so it can't be read as tyre condition).
 */
export function captureStatusText(
  stage: 'sidewall' | 'tread',
  snapshot: Pick<SessionSnapshot, 'status' | 'collecting'>,
): { label: string; ok: boolean } {
  switch (snapshot.status) {
    case 'starting':
      return { label: 'Focusing…', ok: false };
    case 'too_dark':
      return { label: 'Too dark', ok: false };
    case 'too_bright':
      return { label: 'Too bright', ok: false };
    case 'moving':
    case 'blurry':
      return { label: 'Hold steady', ok: false };
    case 'repeat':
      return { label: 'Keep moving', ok: false };
    case 'ok':
    default:
      if (stage === 'tread') return { label: 'Image is clear', ok: true };
      return snapshot.collecting
        ? { label: 'Hold steady', ok: false }
        : { label: 'Ready to capture', ok: true };
  }
}
