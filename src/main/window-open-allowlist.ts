/**
 * Window-open URL allowlist — gates `webContents.setWindowOpenHandler` and `shell.openExternal`.
 *
 * Why this exists (HIGH-5 from v1.10.2 joint review): Electron's default `window.open`
 * passes URLs through to `shell.openExternal` with no scheme validation. `javascript:`,
 * `file:`, `vbscript:` URLs would then be dispatched to the OS handler, which can
 * trigger unintended side effects (executes in default browser, opens local files).
 *
 * Policy: only `http:` and `https:` are forwarded to the OS shell. Anything else
 * (or a malformed URL that throws on `new URL()`) returns false so the caller can
 * deny the navigation.
 */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}
