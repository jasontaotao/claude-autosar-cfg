/**
 * Convert an ECUC-style path into a legal C identifier.
 * - `/`, `-`, `.`, `:` → `_`
 * - Trims whitespace
 * - Collapses runs of `_`
 * Returns '' for empty input.
 */
export function cIdent(path: string): string {
  return path
    .trim()
    .replace(/[/\-.:]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
