// Sprint 13 #1 — `template.json` type guard.
//
// Hand-rolled (Zod-free, per project "no new deps" rule). Returns the
// parsed `TemplateManifest` on success, `null` on any validation
// failure. The caller (discoverBuiltinTemplates) logs and skips on
// `null`; it never throws.

import type { TemplateManifest } from './types.js';

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseTemplateManifest(raw: unknown): TemplateManifest | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string') return null;
  if (typeof r['displayName'] !== 'string') return null;
  if (typeof r['description'] !== 'string') return null;
  if (!KEBAB_CASE.test(r['id'])) return null;
  // Empty strings allowed: manifest authors may want placeholders
  // (e.g. classic with no real description yet). Discovery still
  // succeeds; the renderer later sees the empty string and can warn.
  return {
    id: r['id'],
    displayName: r['displayName'],
    description: r['description'],
  };
}
