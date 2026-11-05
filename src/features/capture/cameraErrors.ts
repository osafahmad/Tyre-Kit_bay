/** Name, code (when the native side sets one) and message of a camera error. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as { code?: unknown }).code;
  const parts = [error.name, code != null ? `(${String(code)})` : null, error.message];
  return parts.filter(p => p != null && p !== '').join(' ');
}

/**
 * A camera control call (torch, zoom, focus, exposure) that was cancelled
 * because the camera wasn't open at that moment: while it starts, stops, or
 * rebinds. CameraX rejects these with `CameraControl.OperationCanceledException`
 * ("Camera is not active"). The session itself is fine, so this must not show
 * "The camera stopped". Real failures (CameraX critical state errors) still do.
 */
export function isControlCancellation(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /OperationCanceledException|Camera is not active/i.test(text);
}
