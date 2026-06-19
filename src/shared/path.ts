/**
 * Return the last segment of a file path (after the last `/` or `\`).
 * Pure, no I/O.
 */
export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/**
 * Portable dirname (no `node:path`; renderer-safe). Returns the path's
 * parent directory with trailing separators stripped, or `''` when the
 * input has no parent (a bare filename, an empty string, or just
 * separators).
 *
 * Mirrors the behaviour of `path.posix.dirname` / `path.win32.dirname`
 * for the inputs the renderer actually handles:
 *   - POSIX:   `/proj/ecuc/X.arxml` → `/proj/ecuc`
 *   - Windows: `D:\proj\ecuc\X.arxml` → `D:\proj\ecuc`
 *   - Mixed:   `D:/proj/ecuc\X.arxml` → `D:/proj/ecuc`
 *
 * Trailing separators are stripped first so `/proj/ecuc/` returns
 * `/proj` (matching Node's behaviour for cross-platform round-trips).
 */
export function dirname(p: string): string {
  // Strip trailing / or \.
  const stripped = p.replace(/[\\/]+$/, '');
  // Find the last separator that still has a segment after it.
  const idx = stripped.search(/[\\/][^\\/]*$/);
  return idx >= 0 ? stripped.slice(0, idx) : '';
}

/**
 * Convert an absolute `filePath` to a manifest-relative POSIX-style
 * path. Returns `null` when the file lives outside `manifestDir` (a
 * different Windows drive, or a sibling POSIX path with no shared
 * prefix) so the caller can decide what to do — typically keep the
 * absolute path and let the next save round-trip surface the error.
 *
 * Accepted inputs:
 *   - POSIX:   `/proj` + `/proj/ecuc/X.arxml` → `ecuc/X.arxml`
 *   - Windows: `D:\proj` + `D:\proj\ecuc\X.arxml` → `ecuc/X.arxml`
 *   - Equal:   `/proj` + `/proj` → `.`
 *   - Already-relative: `ecuc/X.arxml` (no leading separator or drive)
 *     passes through unchanged. The caller can short-circuit on the
 *     relative input — we don't try to detect/return `null` here.
 *
 * Rejected inputs (return `null`):
 *   - Cross-drive Windows: `D:\proj` + `E:\proj\X.arxml`
 *   - Sibling POSIX:       `/a/b` + `/a/c/X.arxml` (different parent)
 *   - Asymmetric drive prefix (one has, one doesn't)
 *   - Empty `filePath`
 *   - Already-relative input containing `..` segment (parent traversal)
 */
export function toManifestRelative(manifestDir: string, filePath: string): string | null {
  if (filePath === '') return null;
  // Normalise backslashes to forward slashes for the comparison.
  const normDir = manifestDir.replace(/\\/g, '/');
  const normFile = filePath.replace(/\\/g, '/');
  // Drive letter check. Capture lower-cased so 'D:' matches 'd:'.
  const dirDrive = normDir.match(/^([A-Za-z]:)/)?.[1]?.toLowerCase();
  const fileDrive = normFile.match(/^([A-Za-z]:)/)?.[1]?.toLowerCase();
  if (dirDrive !== undefined || fileDrive !== undefined) {
    // Asymmetric: one side has a drive letter and the other doesn't.
    if (dirDrive === undefined || fileDrive === undefined) return null;
    if (dirDrive !== fileDrive) return null;
  }
  // Strip the drive from both for the prefix comparison.
  const dirNoDrive = dirDrive !== undefined ? normDir.slice(2) : normDir;
  const fileNoDrive = fileDrive !== undefined ? normFile.slice(2) : normFile;
  // Normalise trailing separators on the dir; the file side is left
  // alone because the prefix-match below already requires a separator
  // boundary.
  const dirNorm = dirNoDrive.replace(/\/+$/, '');
  if (fileNoDrive === dirNorm) return '.';
  if (fileNoDrive.startsWith(dirNorm + '/')) {
    return fileNoDrive.slice(dirNorm.length + 1);
  }
  // Already-relative input (no leading '/' and no drive letter): pass
  // through unchanged UNLESS the input contains a parent-traversal
  // segment. We deliberately do NOT call `path.posix.normalize` here
  // (renderer-safe, no node:path); instead we reject any path whose
  // segments contain `..` after splitting on `/` and stripping empty
  // segments. The caller can then treat `null` identically to
  // "outside manifestDir" (typically: keep absolute path, surface
  // error on next save round-trip).
  if (dirDrive === undefined && fileDrive === undefined && !filePath.startsWith('/')) {
    const segments = filePath
      .replace(/\\/g, '/')
      .split('/')
      .filter((s) => s !== '');
    if (segments.some((s) => s === '..')) return null;
    return filePath;
  }
  return null;
}
