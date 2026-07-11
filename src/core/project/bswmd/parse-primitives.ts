// core/project/bswmd/parse-primitives.ts
// Small low-level XML-attribute read helpers used by both EB-tresos and
// ECUC-AR4 dialect builders. No dialect knowledge; no recursive
// structural walking.
//
// Split from `src/core/project/bswmd/parse.ts` as part of v1.46.0 MINOR
// T2 (file-size backlog closure round-2 — round-1 was v1.41.x PATCH T1).
//
// Why these 5 helpers live here vs. in `parse.ts`: they're tiny (< 10
// LoC each), pure functions on `unknown` / `Record<string, unknown>`,
// and shared by every dialect builder. Keeping them here lets the
// larger dialect files stay focused on dialect-specific structural
// recursion.
//
// Scope boundary:
//   - Reads single attribute / text-value fields. Does NOT recurse into
//     AR-PACKAGES / ELEMENTS / containers — that's `parse-tree-walker.ts`.
//   - No XML namespace handling (the parse.ts entry takes care of that
//     via `XMLParser`).
//   - `readElementText` and `readDesc` / `readDestAttr` / `lastPathSegment`
//     stay in `parse-eb-dialect.ts` because they're tied to the EB-tresos
//     dialect's element-text convention (which the ECUC-AR4 dialect
//     handles differently).
//   - `readMultiplicityConfigClasses` stays in `parse.ts` until v1.46.0
//     MINOR T3 (eb-dialect split), because it depends on `readElementText`
//     (eb-dialect) + `asArray` (parse.ts).

/**
 * Read the `<SHORT-NAME>` field of an ECUC element. Returns the text
 * value or `undefined` if the field is missing or non-string.
 *
 * fast-xml-parser represents simple text as a string and attribute
 * values similarly; nested `<SHORT-NAME>` (rare) would be an object with
 * `#text`. We accept both shapes.
 */
export function readShortName(elem: Record<string, unknown>): string | undefined {
  const sn = elem['SHORT-NAME'];
  if (typeof sn === 'string') return sn;
  if (typeof sn === 'object' && sn !== null) {
    const t = (sn as Record<string, unknown>)['#text'];
    if (typeof t === 'string') return t;
  }
  return undefined;
}

/**
 * Read a numeric attribute / text value. Returns `null` for non-numeric
 * or missing input (caller decides whether to default to 0, fall back to
 * the ECUC spec default, etc.).
 */
export function readNumber(node: unknown): number | null {
  if (typeof node === 'number' && Number.isFinite(node)) return node;
  if (typeof node === 'string') {
    const n = Number(node);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Read a boolean attribute / text value. Accepts the common literal
 * forms: `true` / `false` (case-insensitive) and `1` / `0`. Returns
 * `null` for any other input (caller decides the fallback).
 */
export function readBoolean(node: unknown): boolean | null {
  if (typeof node === 'boolean') return node;
  if (typeof node === 'string') {
    const s = node.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return null;
}

/**
 * Read a multiplicity: returns the literal number, or 'infinite' when the
 * companion `<UPPER-MULTIPLICITY-INFINITE>true</UPPER-MULTIPLICITY-INFINITE>`
 * is set. Missing upper is treated as 'infinite' because that matches the
 * ECUC spec default (most container/choice upper bounds are unbounded).
 */
export function readUpperMultiplicity(node: Record<string, unknown>): number | 'infinite' {
  const inf = readBoolean(node['UPPER-MULTIPLICITY-INFINITE']);
  if (inf === true) return 'infinite';
  const n = readNumber(node['UPPER-MULTIPLICITY']);
  return n === null ? 'infinite' : n;
}

/**
 * Read a lower-multiplicity. Missing lower is treated as 0 (ECUC spec
 * default — containers with no lower-multiplicity are optional).
 */
export function readLowerMultiplicity(node: Record<string, unknown>): number {
  const n = readNumber(node['LOWER-MULTIPLICITY']);
  return n === null ? 0 : n;
}
