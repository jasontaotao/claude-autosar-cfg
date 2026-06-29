/**
 * v1.15.5 — minimal logger for main-process fatal events.
 *
 * Log-only (no `app.exit`) on purpose: a renderer crash or async
 * rejection mid-session should NOT terminate the app and risk losing
 * the user's unsaved BSWMD / manifest work. The trade-off is that an
 * unhandled exception leaves the main process in an unknown state;
 * we surface the error to stderr and let the user / Electron decide
 * what to do next (typically: dialog → save → manual restart).
 *
 * Aligns with Electron 2024+ community convention (electron-forge /
 * electron-builder templates both default to log-only).
 */
export function logFatal(label: string, err: unknown): void {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`[claude-AutosarCfg main ${new Date().toISOString()}] ${label}:`, msg);
}