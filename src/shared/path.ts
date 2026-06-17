/**
 * Return the last segment of a file path (after the last `/` or `\`).
 * Pure, no I/O.
 */
export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
