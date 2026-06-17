# Sprint 13 #1 — Built-in Templates Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend template-discovery / copy infrastructure (no UI) so Sprint 13 #2 can wire a `TemplateCard` picker into the existing `NewProjectDialog` without touching the main process again.

**Architecture:** main process scans `process.resourcesPath/samples/arxml/` at startup, filters directories by opt-in `template.json` marker, caches the resulting `BuiltinTemplate[]` in an Electron `app` ref, and exposes `templates:list` + `templates:copy` over IPC. Renderer gets a preload bridge but does not call it in this sprint.

**Tech Stack:** Node.js `fs/promises` + `path` (no new deps), TypeScript 5 strict, Zod-free hand-rolled type guards, vitest, Electron 30 IPC.

**Spec:** [`docs/superpowers/specs/2026-06-17-sprint-13-1-templates-backend-design.md`](../specs/2026-06-17-sprint-13-1-templates-backend-design.md)

**Project conventions** (verified from Sprint 12 #1 #2 #3 code):

- IPC channels in `src/shared/ipc-contract.ts` as `IPC_CHANNELS` const
- IPC request/response types in `src/shared/types.ts`
- Handlers in `src/main/ipc/*Handler.ts` returning discriminated union `{ kind: 'ok', ... } | { kind: '<error>', message }`
- Handlers registered in `src/main/ipc/register.ts` via `registerIpcHandlers()`
- Handler tests in `src/main/ipc/__tests__/*.test.ts` (vitest, real temp fs via `os.tmpdir()`)
- i18n in `src/shared/i18n.ts` — single flat `Messages` interface + `MessagesZhCN` / `MessagesEn` bundles + `MessageKey` derived type + parity enforced by `src/shared/__tests__/i18n.test.ts`
- Preload bridge in `src/preload/index.ts` exposes `window.api.X()` calling `ipcRenderer.invoke(IPC_CHANNELS.X, ...)`
- Test fixtures under `tests/fixtures/<area>/` (not nested in `__tests__/`)
- No new dependencies without explicit user approval

---

## File Structure

**New files (8):**

- `src/main/templates/types.ts` — `BuiltinTemplate`, `TemplateManifest`, `CopyResult`, `TemplateListResult`, `TemplateCopyResult`
- `src/main/templates/errors.ts` — `TemplateErrorKind` union + `classTemplateError()` + helpers
- `src/main/templates/parse-manifest.ts` — hand-rolled `parseTemplateManifest()` type guard
- `src/main/templates/walk-arxml.ts` — `walkArxml()` recursive `*.arxml` finder
- `src/main/templates/discover.ts` — `discoverBuiltinTemplates(samplesRoot)` → `BuiltinTemplate[]`
- `src/main/templates/copy.ts` — `copyTemplateFilesToDir(template, samplesRoot, destDir)` → `CopyResult`
- `src/main/templates/index.ts` — re-exports
- `src/main/ipc/templatesHandler.ts` — IPC handler

**New test files (4):**

- `src/main/templates/__tests__/parse-manifest.test.ts` (5 cases)
- `src/main/templates/__tests__/discover.test.ts` (9 cases)
- `src/main/templates/__tests__/copy.test.ts` (5 cases)
- `src/main/ipc/__tests__/templatesHandler.test.ts` (6 cases)

**New fixture directories (under `tests/fixtures/templates/`):**

- `tests/fixtures/templates/samples-root/empty/template.json` (valid)
- `tests/fixtures/templates/samples-root/classic/template.json` (valid)
- `tests/fixtures/templates/samples-root/clone/template.json` (valid)
- `tests/fixtures/templates/samples-root/no-template-json/Can/Bswmd/Can_bswmd.arxml` (opt-in skip)
- `tests/fixtures/templates/samples-root/invalid-template/template.json` (missing displayName)
- `tests/fixtures/templates/samples-root/id-mismatch/template.json` (id != dirname)
- `tests/fixtures/templates/samples-root/classic/bswmd/Can_bswmd.arxml` (1 real BSWMD for fileCount assertion)
- `tests/fixtures/templates/samples-root/classic/EcuExtract.arxml` (1 real value-side for fileCount assertion)

**Modified files (5):**

- `src/shared/ipc-contract.ts` — add `TEMPLATES_LIST` + `TEMPLATES_COPY`
- `src/shared/types.ts` — add 4 IPC request/response interfaces + `TemplateErrorKind` re-export
- `src/main/ipc/register.ts` — register `templatesHandler`
- `src/preload/index.ts` — add `listTemplates` + `copyTemplate` invoke wrappers
- `src/shared/i18n.ts` — add 6 keys to `Messages` + 6 entries in each bundle
- `package.json` — add `build.extraResources` block
- `samples/README.md` — case-flip hygiene fix (line 71-76: `Bswmd/` → `bswmd/`)

---

## Task 1: Types + Errors (foundation, no tests)

**Files:**

- Create: `src/main/templates/types.ts`
- Create: `src/main/templates/errors.ts`

This task ships pure types and a small error class. The types here are referenced by every later task; the error helpers are referenced by `templatesHandler.ts` in Task 6. There are no tests for type-only files — TypeScript's compiler is the test.

### Step 1: Create `src/main/templates/types.ts`

Write this file verbatim:

```typescript
// Sprint 13 #1 — built-in template types.
//
// Pure data shapes only. No fs / no electron / no I/O — these are
// safe to import from both main and (in future) renderer code.

/**
 * A template discovered on disk at startup. The main process caches
 * an array of these in `app._builtinTemplates`; the renderer asks for
 * summaries via the `templates:list` IPC.
 *
 * `displayNameKey` / `descriptionKey` are i18n keys, NOT localized
 * strings. The renderer resolves them via `t(locale, key)`. The
 * `displayName` / `description` fields in the on-disk `template.json`
 * are kept on `TemplateManifest` only; the cache stores the key form
 * because the key is stable across locales (the string is not).
 */
export interface BuiltinTemplate {
  readonly id: string; // 'empty' | 'classic' | 'clone' (kebab-case, must match dirname)
  readonly displayNameKey: string; // 'template.empty.displayName'
  readonly descriptionKey: string; // 'template.empty.description'
  /** Absolute paths to value-side ARXML files within `samplesRoot`. */
  readonly valueArxmlPaths: readonly string[];
  /** Absolute paths to schema-side BSWMD files within `<templateId>/bswmd/`. */
  readonly bswmdPaths: readonly string[];
  /** valueArxmlPaths.length + bswmdPaths.length. Pre-computed for the IPC response. */
  readonly fileCount: number;
}

/**
 * Shape of `template.json` on disk. `displayName` / `description` are
 * present on disk for human readability of the manifest itself, but
 * the cached `BuiltinTemplate` only stores the i18n keys (see above).
 */
export interface TemplateManifest {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
}

/** Result of `copyTemplateFilesToDir`. Paths are absolute in `destDir`. */
export interface CopyResult {
  readonly copiedValueArxml: readonly string[];
  readonly copiedBswmd: readonly string[];
}
```

### Step 2: Create `src/main/templates/errors.ts`

Write this file verbatim:

```typescript
// Sprint 13 #1 — template error envelope.
//
// Two failure modes:
//   1. Discovery failures (samples-root-missing / template-json-invalid /
//      template-id-mismatch) — warn-logged and skipped, NEVER thrown.
//      One bad template cannot block discovery of the others.
//   2. IPC handler failures (unknown-template / dest-dir-missing /
//      file-copy-failed) — thrown from the handler and caught by the
//      preload bridge, surfacing as a rejected Promise.

export type TemplateErrorKind =
  // discovery (warn + skip)
  | 'samples-root-missing'
  | 'template-json-invalid'
  | 'template-id-mismatch'
  // IPC handler (throw)
  | 'unknown-template'
  | 'dest-dir-missing'
  | 'file-copy-failed';

/** A structured error object that IPC handlers can throw. */
export interface TemplateError {
  readonly kind: TemplateErrorKind;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export function classTemplateError(
  kind: TemplateErrorKind,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): TemplateError {
  return { kind, message, details };
}
```

### Step 3: Verify TypeScript compiles

Run: `pnpm type-check`
Expected: exit code 0, no errors. The types-only files have no runtime impact; this is a sanity check that imports / syntax are clean.

### Step 4: Commit

```bash
git add src/main/templates/types.ts src/main/templates/errors.ts
git commit -m "feat(templates): add BuiltinTemplate / TemplateError types (Sprint 13 #1 Task 1)"
```

---

## Task 2: `parseTemplateManifest` type guard + tests

**Files:**

- Create: `src/main/templates/parse-manifest.ts`
- Create: `src/main/templates/__tests__/parse-manifest.test.ts`

Hand-rolled type guard (Zod-free per project conventions; no new deps). 5 test cases.

### Step 1: Write the failing test

Write `src/main/templates/__tests__/parse-manifest.test.ts` verbatim:

```typescript
// Sprint 13 #1 — `parseTemplateManifest` type guard tests.
//
// The guard validates the on-disk `template.json` shape:
//   { id: string (kebab-case), displayName: string, description: string }
//
// Cases (5):
//   1. valid manifest → returns the parsed object
//   2. missing displayName → returns null
//   3. missing description → returns null
//   4. missing id → returns null
//   5. id with uppercase letters → returns null (kebab-case required)

import { describe, expect, it } from 'vitest';

import { parseTemplateManifest } from '../parse-manifest.js';

describe('parseTemplateManifest (Sprint 13 #1)', () => {
  it('returns the parsed manifest for a valid object', () => {
    const r = parseTemplateManifest({
      id: 'empty',
      displayName: 'Empty',
      description: 'Start fresh',
    });
    expect(r).toEqual({
      id: 'empty',
      displayName: 'Empty',
      description: 'Start fresh',
    });
  });

  it('returns null when displayName is missing', () => {
    const r = parseTemplateManifest({
      id: 'empty',
      description: 'Start fresh',
    });
    expect(r).toBeNull();
  });

  it('returns null when description is missing', () => {
    const r = parseTemplateManifest({
      id: 'empty',
      displayName: 'Empty',
    });
    expect(r).toBeNull();
  });

  it('returns null when id is missing', () => {
    const r = parseTemplateManifest({
      displayName: 'Empty',
      description: 'Start fresh',
    });
    expect(r).toBeNull();
  });

  it('returns null when id contains uppercase letters', () => {
    const r = parseTemplateManifest({
      id: 'Classic',
      displayName: 'Classic',
      description: 'x',
    });
    expect(r).toBeNull();
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test -- src/main/templates/__tests__/parse-manifest.test.ts`
Expected: FAIL with "Cannot find module '../parse-manifest.js'" (file does not exist yet).

### Step 3: Implement `parseTemplateManifest`

Write `src/main/templates/parse-manifest.ts` verbatim:

```typescript
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
```

### Step 4: Run test to verify it passes

Run: `pnpm test -- src/main/templates/__tests__/parse-manifest.test.ts`
Expected: PASS (5/5).

### Step 5: Commit

```bash
git add src/main/templates/parse-manifest.ts src/main/templates/__tests__/parse-manifest.test.ts
git commit -m "feat(templates): add parseTemplateManifest type guard (Sprint 13 #1 Task 2)"
```

---

## Task 3: `walkArxml` + `discoverBuiltinTemplates` + tests

**Files:**

- Create: `src/main/templates/walk-arxml.ts`
- Create: `src/main/templates/discover.ts`
- Create: `tests/fixtures/templates/samples-root/{empty,classic,clone,no-template-json,invalid-template,id-mismatch}/...`
- Create: `src/main/templates/__tests__/discover.test.ts`

9 test cases for discover. Fixture directories (6 template dirs) created in this task; they will be reused by Task 4 (copy) and Task 6 (handler tests can also use them).

### Step 1: Create test fixtures

Create the following files:

**`tests/fixtures/templates/samples-root/empty/template.json`:**

```json
{ "id": "empty", "displayName": "Empty Project", "description": "Start fresh" }
```

**`tests/fixtures/templates/samples-root/classic/template.json`:**

```json
{ "id": "classic", "displayName": "Classic", "description": "Common BSWMD prefilled" }
```

**`tests/fixtures/templates/samples-root/clone/template.json`:**

```json
{ "id": "clone", "displayName": "Clone", "description": "Copy of existing project" }
```

**`tests/fixtures/templates/samples-root/no-template-json/Can/Bswmd/Can_bswmd.arxml`:**
Take the first 200 bytes of `tests/fixtures/bswmd/Can_Bswmd.arxml` (which exists per Sprint 12 #1 fixtures) and write to this path. Use:

```bash
mkdir -p tests/fixtures/templates/samples-root/no-template-json/Can/Bswmd
head -c 200 tests/fixtures/bswmd/Can_Bswmd.arxml > tests/fixtures/templates/samples-root/no-template-json/Can/Bswmd/Can_bswmd.arxml
```

**`tests/fixtures/templates/samples-root/invalid-template/template.json`:**

```json
{ "id": "invalid-template" }
```

**`tests/fixtures/templates/samples-root/id-mismatch/template.json`:**

```json
{ "id": "different", "displayName": "x", "description": "y" }
```

**`tests/fixtures/templates/samples-root/classic/EcuExtract.arxml`:**

```bash
head -c 200 tests/fixtures/arxml/EcuC_EcuC.arxml > tests/fixtures/templates/samples-root/classic/EcuExtract.arxml
```

**`tests/fixtures/templates/samples-root/classic/bswmd/Can_bswmd.arxml`:**

```bash
mkdir -p tests/fixtures/templates/samples-root/classic/bswmd
head -c 200 tests/fixtures/bswmd/Can_Bswmd.arxml > tests/fixtures/templates/samples-root/classic/bswmd/Can_bswmd.arxml
```

### Step 2: Write the failing test

Write `src/main/templates/__tests__/discover.test.ts` verbatim:

```typescript
// Sprint 13 #1 — `discoverBuiltinTemplates` tests.
//
// 9 cases:
//   1. samplesRoot does not exist → []
//   2. 1 valid template → 1 BuiltinTemplate with correct fields
//   3. 3 valid templates → stable alphabetical sort (classic/clone/empty)
//   4. directory without template.json → opt-in skip (no-template-json)
//   5. invalid JSON in template.json → skip (does not crash discovery)
//   6. Zod-style fail (missing displayName in invalid-template) → skip
//   7. id != dirname (id-mismatch) → skip
//   8. hidden directory (`.foo`) → skip
//   9. valueArxmlPaths / bswmdPaths classification correct
//      (classic has 1 EcuExtract.arxml at root + 1 BSWMD in bswmd/)

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { discoverBuiltinTemplates } from '../discover.js';

const FIXTURE_ROOT = join(
  dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'templates',
  'samples-root',
);

let tempRoots: string[] = [];
function makeTempRoot(): string {
  const r = join(
    tmpdir(),
    `claude-autosarcfg-discover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(r, { recursive: true });
  tempRoots.push(r);
  return r;
}
afterEach(() => {
  for (const r of tempRoots) {
    if (existsSync(r)) rmSync(r, { recursive: true, force: true });
  }
  tempRoots = [];
});

describe('discoverBuiltinTemplates (Sprint 13 #1)', () => {
  it('returns [] when samplesRoot does not exist', () => {
    const r = discoverBuiltinTemplates(join(tmpdir(), 'definitely-does-not-exist-xyz'));
    expect(r).toEqual([]);
  });

  it('returns 1 BuiltinTemplate for a single-valid-template fixture', () => {
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    // we only check the 'empty' template here, not all 3
    const empty = r.find((t) => t.id === 'empty');
    expect(empty).toBeDefined();
    expect(empty!.displayNameKey).toBe('template.empty.displayName');
    expect(empty!.descriptionKey).toBe('template.empty.description');
    expect(empty!.valueArxmlPaths).toEqual([]);
    expect(empty!.bswmdPaths).toEqual([]);
    expect(empty!.fileCount).toBe(0);
  });

  it('returns 3 templates sorted alphabetically by id', () => {
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    expect(r.map((t) => t.id)).toEqual(['classic', 'clone', 'empty']);
  });

  it('skips directories without template.json (opt-in)', () => {
    // no-template-json/ exists with BSWMD inside but no template.json
    // → must NOT appear in result
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    expect(r.find((t) => t.id === 'no-template-json')).toBeUndefined();
  });

  it('skips directories with invalid JSON in template.json', () => {
    // Build a temp root with a bad-json dir
    const root = makeTempRoot();
    const bad = join(root, 'bad-json');
    mkdirSync(bad);
    writeFileSync(join(bad, 'template.json'), '{ this is not json');
    const r = discoverBuiltinTemplates(root);
    expect(r.find((t) => t.id === 'bad-json')).toBeUndefined();
  });

  it('skips directories whose template.json fails the type guard (missing displayName)', () => {
    // invalid-template/ is in the fixture and is missing displayName
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    expect(r.find((t) => t.id === 'invalid-template')).toBeUndefined();
  });

  it('skips directories whose template.json id does not match dirname', () => {
    // id-mismatch/ has id="different" inside it
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    expect(r.find((t) => t.id === 'id-mismatch')).toBeUndefined();
  });

  it('skips hidden directories (names starting with .)', () => {
    const root = makeTempRoot();
    mkdirSync(join(root, '.hidden'));
    writeFileSync(
      join(root, '.hidden', 'template.json'),
      JSON.stringify({ id: '.hidden', displayName: 'h', description: 'h' }),
    );
    const r = discoverBuiltinTemplates(root);
    expect(r.find((t) => t.id === '.hidden')).toBeUndefined();
  });

  it('classifies classic/ EcuExtract.arxml as valueArxmlPaths and classic/bswmd/Can_bswmd.arxml as bswmdPaths', () => {
    const r = discoverBuiltinTemplates(FIXTURE_ROOT);
    const classic = r.find((t) => t.id === 'classic')!;
    expect(classic.fileCount).toBe(2);
    expect(classic.valueArxmlPaths.length).toBe(1);
    expect(classic.valueArxmlPaths[0]).toMatch(/[\\/]classic[\\/]EcuExtract\.arxml$/);
    expect(classic.bswmdPaths.length).toBe(1);
    expect(classic.bswmdPaths[0]).toMatch(/[\\/]classic[\\/]bswmd[\\/]Can_bswmd\.arxml$/);
  });
});
```

### Step 3: Run test to verify it fails

Run: `pnpm test -- src/main/templates/__tests__/discover.test.ts`
Expected: FAIL with "Cannot find module '../discover.js'" (file does not exist yet).

### Step 4: Implement `walkArxml`

Write `src/main/templates/walk-arxml.ts` verbatim:

```typescript
// Sprint 13 #1 — `*.arxml` recursive walker.
//
// Returns relative paths (relative to `root`) of every file ending in
// `.arxml` under `root`, skipping hidden entries (`.foo`). If
// `opts.exclude` is set AND matches a directory name (case-sensitive),
// the directory is not descended into.
//
// Why case-sensitive: on Windows `path.sep` and file names are
// case-insensitive, but we want opt-in `template.json` behavior to be
// predictable. `samples/arxml/<id>/bswmd/` is the convention; using
// `Bswmd/` would silently NOT be excluded. (The 100+ legacy reference
// BSWMD under `samples/arxml/<Module>/Bswmd/` are filtered out by the
// opt-in gate on `template.json`, so this never matters for them.)

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface WalkArxmlOptions {
  /** Directory name to skip descending into. Case-sensitive. */
  readonly exclude?: string;
}

export function walkArxml(root: string, opts: WalkArxmlOptions = {}): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = join(cur, e.name);
      if (e.isDirectory()) {
        if (opts.exclude !== undefined && e.name === opts.exclude) continue;
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith('.arxml')) {
        out.push(relative(root, full));
      } else if (e.isFile()) {
        // Probe via statSync in case Dirent.isFile() is unreliable on
        // some platforms (CIFS mounts etc). Not strictly needed but
        // cheap insurance.
        try {
          if (!statSync(full).isFile()) continue;
        } catch {
          continue;
        }
      }
    }
  }
  return out.sort();
}
```

### Step 5: Implement `discoverBuiltinTemplates`

Write `src/main/templates/discover.ts` verbatim:

```typescript
// Sprint 13 #1 — scan `samplesRoot` and return opt-in `BuiltinTemplate[]`.
//
// Algorithm:
//   1. If `samplesRoot` does not exist, warn and return [].
//   2. Iterate direct child directories (skip hidden, skip non-dirs).
//   3. For each dir, look for `<dir>/template.json`. If absent → skip
//      (this is the opt-in gate: reference data dirs without a manifest
//      are silently ignored).
//   4. Parse + validate the manifest via `parseTemplateManifest`. If
//      the parse fails, JSON is malformed, or `id` != dirname → warn
//      and skip. One bad template never breaks discovery of the rest.
//   5. Walk `<dir>/*.arxml` (excluding the `bswmd/` subdirectory) for
//      value-side files. Walk `<dir>/bswmd/*.arxml` (if it exists) for
//      schema-side files. Both lists are absolute paths inside
//      `samplesRoot`.
//   6. Return sorted by `id` (stable alphabetical order — required for
//      IPC deterministic response in tests).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { BuiltinTemplate, TemplateManifest } from './types.js';
import { classTemplateError } from './errors.js';
import { parseTemplateManifest } from './parse-manifest.js';
import { walkArxml } from './walk-arxml.js';

/** Module-level logger. Wired by `bootstrap.ts` to `app._logger`. */
type Logger = { warn: (msg: string, meta?: unknown) => void };
let logger: Logger = {
  warn: (m) => {
    /* eslint-disable-next-line no-console */ console.warn(m);
  },
};
export function setTemplatesLogger(l: Logger): void {
  logger = l;
}

export function discoverBuiltinTemplates(samplesRoot: string): BuiltinTemplate[] {
  if (!existsSync(samplesRoot)) {
    logger.warn('[templates] samples root missing', { samplesRoot });
    return [];
  }

  const entries = readdirSync(samplesRoot, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && !e.name.startsWith('.'),
  );

  const templates: BuiltinTemplate[] = [];
  for (const entry of entries) {
    const dirPath = join(samplesRoot, entry.name);
    const manifestPath = join(dirPath, 'template.json');
    if (!existsSync(manifestPath)) continue; // opt-in: skip reference data

    let manifest: TemplateManifest | null = null;
    try {
      const raw = readFileSync(manifestPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      manifest = parseTemplateManifest(parsed);
    } catch (e) {
      logger.warn('[templates] template.json invalid', { dir: entry.name, err: String(e) });
      continue;
    }
    if (manifest === null) {
      // parseTemplateManifest returned null → either bad shape or
      // id fails kebab-case. We already logged at the JSON layer; the
      // type-guard case is logged here for diagnostic clarity.
      logger.warn('[templates] template.json failed type guard', { dir: entry.name });
      continue;
    }
    if (manifest.id !== entry.name) {
      logger.warn('[templates] template.id != dirname', { dir: entry.name, id: manifest.id });
      continue;
    }

    const valueRel = walkArxml(dirPath, { exclude: 'bswmd' });
    const bswmdDir = join(dirPath, 'bswmd');
    const bswmdRel = existsSync(bswmdDir) ? walkArxml(bswmdDir) : [];

    templates.push({
      id: manifest.id,
      displayNameKey: `template.${manifest.id}.displayName`,
      descriptionKey: `template.${manifest.id}.description`,
      valueArxmlPaths: valueRel.map((p) => resolve(dirPath, p)),
      bswmdPaths: bswmdRel.map((p) => resolve(dirPath, p)),
      fileCount: valueRel.length + bswmdRel.length,
    });
  }

  return templates.sort((a, b) => a.id.localeCompare(b.id));
}

// Re-export for tests that want to assert the classTemplateError shape
// (not strictly used in this module, but the export keeps the surface
// stable for downstream callers in Task 4/6).
export { classTemplateError };
```

### Step 6: Run test to verify it passes

Run: `pnpm test -- src/main/templates/__tests__/discover.test.ts`
Expected: PASS (9/9).

### Step 7: Commit

```bash
git add src/main/templates/walk-arxml.ts \
        src/main/templates/discover.ts \
        src/main/templates/__tests__/discover.test.ts \
        tests/fixtures/templates/samples-root
git commit -m "feat(templates): add discoverBuiltinTemplates + walkArxml (Sprint 13 #1 Task 3)"
```

---

## Task 4: `copyTemplateFilesToDir` + tests

**Files:**

- Create: `src/main/templates/copy.ts`
- Create: `src/main/templates/__tests__/copy.test.ts`

5 test cases. Reuses the fixtures from Task 3.

### Step 1: Write the failing test

Write `src/main/templates/__tests__/copy.test.ts` verbatim:

```typescript
// Sprint 13 #1 — `copyTemplateFilesToDir` tests.
//
// 5 cases:
//   1. empty template (0 files) → 0 copied
//   2. value-only template → value files copied, bswmd dir not touched
//   3. bswmd-only template → bswmd files copied
//   4. value+bswmd mixed template (classic) → both copied, fileCount matches
//   5. source path does not exist on disk → throws file-copy-failed

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { copyTemplateFilesToDir } from '../copy.js';
import type { BuiltinTemplate } from '../types.js';

let workDir: string;
beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-copy-'));
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeTemplate(overrides: Partial<BuiltinTemplate>): BuiltinTemplate {
  return {
    id: 't',
    displayNameKey: 'template.t.displayName',
    descriptionKey: 'template.t.description',
    valueArxmlPaths: [],
    bswmdPaths: [],
    fileCount: 0,
    ...overrides,
  };
}

describe('copyTemplateFilesToDir (Sprint 13 #1)', () => {
  it('returns 0 copied files for an empty template', () => {
    const t = makeTemplate({ id: 'empty' });
    const r = copyTemplateFilesToDir(t, workDir, join(workDir, 'dest'));
    expect(r.copiedValueArxml).toEqual([]);
    expect(r.copiedBswmd).toEqual([]);
  });

  it('copies value-side files only', () => {
    const src = join(workDir, 't');
    mkdirSync(join(src, 'bswmd'), { recursive: true });
    writeFileSync(join(src, 'a.arxml'), '<A/>');
    writeFileSync(join(src, 'sub', 'b.arxml'), '<B/>', { recursive: true });
    const t = makeTemplate({
      id: 't',
      valueArxmlPaths: [resolve(src, 'a.arxml'), resolve(src, 'sub/b.arxml')],
      bswmdPaths: [],
    });
    const dest = join(workDir, 'dest');
    mkdirSync(dest);
    const r = copyTemplateFilesToDir(t, workDir, dest);
    expect(r.copiedValueArxml.length).toBe(2);
    expect(r.copiedBswmd).toEqual([]);
    expect(existsSync(join(dest, 't', 'a.arxml'))).toBe(true);
    expect(existsSync(join(dest, 't', 'sub', 'b.arxml'))).toBe(true);
  });

  it('copies bswmd files only', () => {
    const src = join(workDir, 't');
    mkdirSync(join(src, 'bswmd'), { recursive: true });
    writeFileSync(join(src, 'bswmd', 'c.arxml'), '<C/>');
    const t = makeTemplate({
      id: 't',
      valueArxmlPaths: [],
      bswmdPaths: [resolve(src, 'bswmd', 'c.arxml')],
    });
    const dest = join(workDir, 'dest');
    mkdirSync(dest);
    const r = copyTemplateFilesToDir(t, workDir, dest);
    expect(r.copiedValueArxml).toEqual([]);
    expect(r.copiedBswmd.length).toBe(1);
    expect(existsSync(join(dest, 't', 'bswmd', 'c.arxml'))).toBe(true);
  });

  it('copies value+bswmd together and preserves nested paths', () => {
    const src = join(workDir, 't');
    mkdirSync(join(src, 'bswmd'), { recursive: true });
    writeFileSync(join(src, 'v.arxml'), '<V/>');
    writeFileSync(join(src, 'bswmd', 'm.arxml'), '<M/>');
    const t = makeTemplate({
      id: 't',
      valueArxmlPaths: [resolve(src, 'v.arxml')],
      bswmdPaths: [resolve(src, 'bswmd', 'm.arxml')],
      fileCount: 2,
    });
    const dest = join(workDir, 'dest');
    mkdirSync(dest);
    const r = copyTemplateFilesToDir(t, workDir, dest);
    expect(r.copiedValueArxml.length + r.copiedBswmd.length).toBe(2);
    expect(readFileSync(join(dest, 't', 'v.arxml'), 'utf8')).toBe('<V/>');
    expect(readFileSync(join(dest, 't', 'bswmd', 'm.arxml'), 'utf8')).toBe('<M/>');
  });

  it('throws file-copy-failed when a source path does not exist', () => {
    const t = makeTemplate({
      id: 't',
      valueArxmlPaths: [join(workDir, 't', 'does-not-exist.arxml')],
    });
    const dest = join(workDir, 'dest');
    mkdirSync(dest);
    try {
      copyTemplateFilesToDir(t, workDir, dest);
      throw new Error('expected throw');
    } catch (e) {
      const err = e as { kind?: string; message?: string };
      expect(err.kind).toBe('file-copy-failed');
      expect(err.message).toContain('does-not-exist.arxml');
    }
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test -- src/main/templates/__tests__/copy.test.ts`
Expected: FAIL with "Cannot find module '../copy.js'".

### Step 3: Implement `copyTemplateFilesToDir`

Write `src/main/templates/copy.ts` verbatim:

```typescript
// Sprint 13 #1 — copy a built-in template's files into a target dir.
//
// Layout: for each source path `samplesRoot/<templateId>/<relPath>`,
// we copy to `destDir/<templateId>/<relPath>`. The `<templateId>`
// segment is preserved so the project dir contains a self-describing
// subdir (e.g. `MyProj/empty/...`, `MyProj/classic/...`).
//
// Idempotency: we do NOT refuse if `destDir/<templateId>/...` already
// exists; `fs.copyFileSync` overwrites. This is what we want when a
// user re-runs "create from template" into the same dir.
//
// Errors: throw `file-copy-failed` on any fs error (EACCES, ENOENT,
// EISDIR, etc). The IPC handler in Task 6 surfaces this to the
// renderer as a rejected promise.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import type { BuiltinTemplate, CopyResult } from './types.js';
import { classTemplateError } from './errors.js';

export function copyTemplateFilesToDir(
  template: BuiltinTemplate,
  samplesRoot: string,
  destDir: string,
): CopyResult {
  if (!existsSync(destDir)) {
    throw classTemplateError('dest-dir-missing', `目标目录不存在: ${destDir}`, { destDir });
  }

  const copyOne = (src: string): string => {
    const rel = relative(samplesRoot, src);
    const dst = join(destDir, rel);
    try {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    } catch (e) {
      throw classTemplateError('file-copy-failed', `无法复制 ${rel}: ${String(e)}`, { src, dst });
    }
    return dst;
  };

  return {
    copiedValueArxml: template.valueArxmlPaths.map(copyOne),
    copiedBswmd: template.bswmdPaths.map(copyOne),
  };
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test -- src/main/templates/__tests__/copy.test.ts`
Expected: PASS (5/5).

### Step 5: Commit

```bash
git add src/main/templates/copy.ts src/main/templates/__tests__/copy.test.ts
git commit -m "feat(templates): add copyTemplateFilesToDir (Sprint 13 #1 Task 4)"
```

---

## Task 5: `src/main/templates/index.ts` re-exports

**Files:**

- Create: `src/main/templates/index.ts`

Pure barrel file. No new tests (the consumers in Task 6 will exercise everything).

### Step 1: Write `src/main/templates/index.ts`

Write this file verbatim:

```typescript
// Sprint 13 #1 — public surface of the templates subsystem.
//
// Re-exports the discover + copy functions and the type shapes that
// downstream code (IPC handlers, future renderer code, tests) needs.
// Keeping this file tiny makes the dependency direction obvious:
// everything outside `src/main/templates/*` imports from here, never
// from the per-file modules directly.

export { discoverBuiltinTemplates, setTemplatesLogger } from './discover.js';
export { copyTemplateFilesToDir } from './copy.js';
export { parseTemplateManifest } from './parse-manifest.js';
export { walkArxml } from './walk-arxml.js';
export { classTemplateError } from './errors.js';
export type { BuiltinTemplate, TemplateManifest, CopyResult } from './types.js';
export type { TemplateError, TemplateErrorKind } from './errors.js';
```

### Step 2: Verify TypeScript compiles

Run: `pnpm type-check`
Expected: exit code 0.

### Step 3: Commit

```bash
git add src/main/templates/index.ts
git commit -m "feat(templates): add index.ts re-exports (Sprint 13 #1 Task 5)"
```

---

## Task 6: IPC types + channel constants

**Files:**

- Modify: `src/shared/ipc-contract.ts:25-50` (add 2 channels after PICK_DIR)
- Modify: `src/shared/types.ts:1-30` (add 4 interfaces at end of file)

No tests for type-only / constant changes. The next task wires these up.

### Step 1: Add IPC channel constants

Open `src/shared/ipc-contract.ts`. Find the `PICK_DIR: 'project:pickDir',` line. Add the following two lines immediately after it (preserving the existing trailing comma and `} as const;`):

```typescript
  // Sprint 13 #1 — built-in template discovery. Renderer calls this
  // to get the list of templates (id + i18n key + fileCount) without
  // leaking absolute paths from the main process. The renderer is
  // expected to translate `displayNameKey` / `descriptionKey` via
  // `t(locale, key)`. Empty `templates` array is a valid response
  // (the samples root may be missing in dev / portable builds).
  TEMPLATES_LIST: 'templates:list',
  // Sprint 13 #1 — copy a template's files into a chosen directory.
  // Returns the relative paths of copied value-side and schema-side
  // files. Renderer does not call this in Sprint 13 #1; it is exposed
  // here so the IPC contract is complete and the handler is testable.
  TEMPLATES_COPY: 'templates:copy',
```

### Step 2: Add IPC request/response types

Open `src/shared/types.ts`. Find the last interface / type alias in the file (search for `PickDirResult` and add the 4 new interfaces immediately after it, before any closing re-exports). Add:

```typescript
// Sprint 13 #1 — built-in template IPC types.

export interface TemplateListRequest {
  // No fields. Reserved for future filters (e.g. vendor dialect).
  readonly _placeholder?: never;
}

export interface TemplateListResponse {
  readonly templates: ReadonlyArray<{
    readonly id: string;
    readonly displayNameKey: string;
    readonly descriptionKey: string;
    readonly fileCount: number;
    // Absolute paths are NOT exposed to the renderer. Renderer
    // cannot read `process.resourcesPath` and does not need to;
    // it only renders a picker.
  }>;
}

export interface TemplateCopyRequest {
  readonly templateId: string;
  /** Absolute path of the target directory. Main has already shown a
   *  directory picker; renderer forwards the chosen path verbatim. */
  readonly destDir: string;
}

export interface TemplateCopyResponse {
  readonly copiedValueArxml: readonly string[];
  readonly copiedBswmd: readonly string[];
}
```

### Step 3: Verify TypeScript compiles

Run: `pnpm type-check`
Expected: exit code 0.

### Step 4: Commit

```bash
git add src/shared/ipc-contract.ts src/shared/types.ts
git commit -m "feat(shared): add templates:list / templates:copy IPC types (Sprint 13 #1 Task 6)"
```

---

## Task 7: `templatesHandler` + tests

**Files:**

- Create: `src/main/ipc/templatesHandler.ts`
- Create: `src/main/ipc/__tests__/templatesHandler.test.ts`

6 test cases. The handler caches `BuiltinTemplate[]` in an Electron `app` ref (via a module-level getter), so the test can inject a fake cache.

### Step 1: Write the failing test

Write `src/main/ipc/__tests__/templatesHandler.test.ts` verbatim:

```typescript
// Sprint 13 #1 — `templates:list` and `templates:copy` IPC handlers.
//
// Mirrors the Sprint 12 #1 #2 #3 style: real temp fs for setup, direct
// call of the exported handler function (not through `ipcMain.handle`),
// vitest `describe`/`it` blocks.
//
// 6 cases:
//   1. list: happy path → returns 1-template array
//   2. list: empty cache → returns `{ templates: [] }`
//   3. copy: happy path → returns relative paths of copied files
//   4. copy: unknown templateId → throws unknown-template
//   5. copy: destDir does not exist → throws dest-dir-missing
//   6. copy: file-copy-failed when source file is missing on disk

import { mkdirSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __setTestCache, templatesListHandler, templatesCopyHandler } from '../templatesHandler.js';
import type { BuiltinTemplate } from '../../templates/types.js';

let workDir: string;
beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-templates-handler-'));
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  __setTestCache(null);
});

function makeTemplate(overrides: Partial<BuiltinTemplate>): BuiltinTemplate {
  return {
    id: 't',
    displayNameKey: 'template.t.displayName',
    descriptionKey: 'template.t.description',
    valueArxmlPaths: [],
    bswmdPaths: [],
    fileCount: 0,
    ...overrides,
  };
}

describe('templates:list handler (Sprint 13 #1)', () => {
  it('returns the cached templates summary', async () => {
    __setTestCache([
      makeTemplate({ id: 'empty', fileCount: 0 }),
      makeTemplate({ id: 'classic', fileCount: 2 }),
    ]);
    const r = await templatesListHandler({});
    expect(r.templates.length).toBe(2);
    expect(r.templates[0]).toEqual({
      id: 'empty',
      displayNameKey: 'template.empty.displayName',
      descriptionKey: 'template.empty.description',
      fileCount: 0,
    });
    expect(r.templates[1].fileCount).toBe(2);
  });

  it('returns { templates: [] } when the cache is empty', async () => {
    __setTestCache([]);
    const r = await templatesListHandler({});
    expect(r).toEqual({ templates: [] });
  });
});

describe('templates:copy handler (Sprint 13 #1)', () => {
  it('copies the template files into destDir and returns relative paths', async () => {
    // Build a real template on disk under workDir
    const samplesRoot = join(workDir, 'samples');
    const tmplDir = join(samplesRoot, 'classic');
    mkdirSync(join(tmplDir, 'bswmd'), { recursive: true });
    writeFileSync(join(tmplDir, 'V.arxml'), '<V/>');
    writeFileSync(join(tmplDir, 'bswmd', 'M.arxml'), '<M/>');

    __setTestCache([
      makeTemplate({
        id: 'classic',
        valueArxmlPaths: [join(tmplDir, 'V.arxml')],
        bswmdPaths: [join(tmplDir, 'bswmd', 'M.arxml')],
        fileCount: 2,
      }),
    ]);

    const destDir = join(workDir, 'dest');
    mkdirSync(destDir);
    const r = await templatesCopyHandler({ templateId: 'classic', destDir });
    expect(r.copiedValueArxml).toEqual(['classic/V.arxml']);
    expect(r.copiedBswmd).toEqual(['classic/bswmd/M.arxml']);
    expect(existsSync(join(destDir, 'classic', 'V.arxml'))).toBe(true);
    expect(existsSync(join(destDir, 'classic', 'bswmd', 'M.arxml'))).toBe(true);
  });

  it('throws unknown-template when the cache has no such id', async () => {
    __setTestCache([makeTemplate({ id: 'empty' })]);
    const destDir = join(workDir, 'dest');
    mkdirSync(destDir);
    try {
      await templatesCopyHandler({ templateId: 'classic', destDir });
      throw new Error('expected throw');
    } catch (e) {
      const err = e as { kind?: string };
      expect(err.kind).toBe('unknown-template');
    }
  });

  it('throws dest-dir-missing when destDir does not exist', async () => {
    __setTestCache([makeTemplate({ id: 'empty' })]);
    const destDir = join(workDir, 'does-not-exist');
    try {
      await templatesCopyHandler({ templateId: 'empty', destDir });
      throw new Error('expected throw');
    } catch (e) {
      const err = e as { kind?: string };
      expect(err.kind).toBe('dest-dir-missing');
    }
  });

  it('throws file-copy-failed when a source file is missing on disk', async () => {
    __setTestCache([
      makeTemplate({
        id: 'empty',
        valueArxmlPaths: [join(workDir, 'truly-missing.arxml')],
      }),
    ]);
    const destDir = join(workDir, 'dest');
    mkdirSync(destDir);
    try {
      await templatesCopyHandler({ templateId: 'empty', destDir });
      throw new Error('expected throw');
    } catch (e) {
      const err = e as { kind?: string; message?: string };
      expect(err.kind).toBe('file-copy-failed');
      expect(err.message).toContain('truly-missing.arxml');
    }
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test -- src/main/ipc/__tests__/templatesHandler.test.ts`
Expected: FAIL with "Cannot find module '../templatesHandler.js'".

### Step 3: Implement `templatesHandler`

Write `src/main/ipc/templatesHandler.ts` verbatim:

```typescript
// Sprint 13 #1 — `templates:list` and `templates:copy` IPC handlers.
//
// The cache (`_builtinTemplates`) is populated at app boot in
// `src/main/index.ts` via `discoverBuiltinTemplates()`. Handlers read
// from the cache; they do NOT re-scan disk. This is intentional: the
// disk layout is a build-time / install-time artifact, and the
// renderer should never see mid-scan state.
//
// Test injection: `__setTestCache()` lets unit tests bypass the app
// ref. The export name is underscored to make it clear it is for
// tests only; ESLint config already warns on leading-underscore
// exports in production code, so this is a deliberate exception.

import { existsSync } from 'node:fs';
import { relative } from 'node:path';

import { app } from 'electron';

import {
  copyTemplateFilesToDir,
  discoverBuiltinTemplates,
  classTemplateError,
  setTemplatesLogger,
} from '../templates/index.js';
import type { BuiltinTemplate } from '../templates/types.js';
import type {
  TemplateListRequest,
  TemplateListResponse,
  TemplateCopyRequest,
  TemplateCopyResponse,
} from '../../shared/types.js';

/** Underlying cache slot. Set by main/index.ts at boot, or by tests. */
let _builtinTemplates: BuiltinTemplate[] = [];

/** Test-only cache injection. Returns the previous value. */
export function __setTestCache(templates: BuiltinTemplate[] | null): BuiltinTemplate[] {
  const prev = _builtinTemplates;
  _builtinTemplates = templates ?? [];
  return prev;
}

/**
 * Resolve the samples root directory. Dev: `<repo>/samples` next to
 * `app.getAppPath()`. Prod: `<resourcesPath>/samples` (electron-builder
 * `extraResources` lands it there). Returns `null` if neither path
 * exists — caller should treat this as "templates disabled".
 */
export function resolveSamplesRoot(): string | null {
  const candidates: string[] = [
    `${app.getAppPath()}/samples`, // dev
    `${process.resourcesPath}/samples`, // prod
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** Initialize the cache at app boot. Idempotent. */
export function initBuiltinTemplatesCache(): void {
  // Wire the logger to Electron's logger; fall back to a noop if absent.
  const e = app as unknown as { logger?: { warn: (msg: string, meta?: unknown) => void } };
  if (e.logger) setTemplatesLogger(e.logger);
  const root = resolveSamplesRoot();
  if (root === null) {
    _builtinTemplates = [];
    return;
  }
  _builtinTemplates = discoverBuiltinTemplates(root);
}

export async function templatesListHandler(
  _req: TemplateListRequest,
): Promise<TemplateListResponse> {
  return {
    templates: _builtinTemplates.map((t) => ({
      id: t.id,
      displayNameKey: t.displayNameKey,
      descriptionKey: t.descriptionKey,
      fileCount: t.fileCount,
    })),
  };
}

export async function templatesCopyHandler(
  req: TemplateCopyRequest,
): Promise<TemplateCopyResponse> {
  const template = _builtinTemplates.find((t) => t.id === req.templateId);
  if (!template) {
    throw classTemplateError('unknown-template', `未找到模板: ${req.templateId}`, {
      templateId: req.templateId,
    });
  }
  const samplesRoot = resolveSamplesRoot();
  if (samplesRoot === null) {
    throw classTemplateError('samples-root-missing', 'samples 根目录未初始化');
  }
  const result = copyTemplateFilesToDir(template, samplesRoot, req.destDir);
  // Strip the leading samplesRoot from each path so renderer gets
  // project-relative paths (the renderer will often want to display
  // them in a tree view next to other project files).
  return {
    copiedValueArxml: result.copiedValueArxml.map((p) => relative(req.destDir, p)),
    copiedBswmd: result.copiedBswmd.map((p) => relative(req.destDir, p)),
  };
}
```

> **No more `require()`**: the implementation uses static `import { existsSync } from 'node:fs'` and `import { relative } from 'node:path'` at the top of the file. This matches the project ESM convention.

### Step 4: Run test to verify it passes

Run: `pnpm test -- src/main/ipc/__tests__/templatesHandler.test.ts`
Expected: PASS (6/6).

If the test runner complains about `require()`, apply the inline fix from the note above (move `existsSync` and `relative` to top-of-file `import`s).

### Step 5: Commit

```bash
git add src/main/ipc/templatesHandler.ts \
        src/main/ipc/__tests__/templatesHandler.test.ts
git commit -m "feat(ipc): add templates:list / templates:copy handlers (Sprint 13 #1 Task 7)"
```

---

## Task 8: Register handlers in `register.ts` + boot wiring in `main/index.ts`

**Files:**

- Modify: `src/main/ipc/register.ts` (add 2 `ipcMain.handle` lines for the new channels)
- Modify: `src/main/index.ts` (call `initBuiltinTemplatesCache()` after `app.whenReady`)

No new tests — Task 7's handler tests cover the function bodies; the wiring is mechanical.

### Step 1: Inspect the existing `register.ts` shape

Read `src/main/ipc/register.ts`. The function `registerIpcHandlers` should already wire all the existing channels. The pattern is `ipcMain.handle(IPC_CHANNELS.X, async (_e, req) => someHandler(req))`. Match the existing style.

### Step 2: Add the new channel registrations

In `src/main/ipc/register.ts`, find the existing `ipcMain.handle` for `PICK_DIR` (the last registration). Add the following two registrations immediately after, before the closing `}` of the function:

```typescript
// Sprint 13 #1 — built-in template IPC.
ipcMain.handle(IPC_CHANNELS.TEMPLATES_LIST, async (_e, req) => templatesListHandler(req));
ipcMain.handle(IPC_CHANNELS.TEMPLATES_COPY, async (_e, req) => templatesCopyHandler(req));
```

Add the corresponding imports at the top of `register.ts` (next to the existing handler imports — look for the `import { projectNewHandler } from './projectNewHandler.js'` block and follow the same pattern):

```typescript
import { templatesCopyHandler, templatesListHandler } from './templatesHandler.js';
```

### Step 3: Wire `initBuiltinTemplatesCache()` into boot

Open `src/main/index.ts`. Find the `app.whenReady().then(...)` block (around line 47-50 per spec). Add the call to `initBuiltinTemplatesCache()` immediately after `registerIpcHandlers()`:

```typescript
app.whenReady().then(async () => {
  registerIpcHandlers();
  // Sprint 13 #1 — populate the built-in templates cache at boot.
  // The cache is read-only after this; no file watcher needed because
  // samples/ is part of the install, not user-mutable.
  const { initBuiltinTemplatesCache } = await import('./ipc/templatesHandler.js');
  initBuiltinTemplatesCache();
  // ... existing createMainWindow() / BrowserWindow setup follows
});
```

> **Verify the import path** matches the actual layout. The handler file is at `src/main/ipc/templatesHandler.ts`; from `src/main/index.ts` the import is `./ipc/templatesHandler.js`. If the existing `registerIpcHandlers` is imported via `import { ... } from './ipc/register.js'`, follow the same form.

### Step 4: Verify TypeScript + run all tests

Run: `pnpm type-check && pnpm test`
Expected: type-check exit 0; all tests pass (640 baseline + 25 new = 665).

### Step 5: Commit

```bash
git add src/main/ipc/register.ts src/main/index.ts
git commit -m "feat(ipc): wire templates:list / templates:copy into register + boot (Sprint 13 #1 Task 8)"
```

---

## Task 9: Preload bridge

**Files:**

- Modify: `src/preload/index.ts` (add 2 `invoke` wrappers in the `api` object)
- Modify: `src/preload/index.d.ts` (add 2 method signatures to the `Api` interface)

No new tests — `src/preload/index.ts` is not unit-tested directly; coverage comes from E2E (which is out of scope for Sprint 13 #1).

### Step 1: Add `listTemplates` and `copyTemplate` to the preload `api` object

Open `src/preload/index.ts`. Find the closing `};` of the `api` const. Add the following two methods immediately before it (next to the existing `pickDir` wrapper):

```typescript
  // Sprint 13 #1 — built-in template list. Renderer does not call
  // this in Sprint 13 #1; it is exposed so the IPC contract is
  // complete and the bridge is ready for Sprint 13 #2's picker.
  listTemplates: (): Promise<TemplateListResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_LIST, {}),
  // Sprint 13 #1 — copy a template into a project dir. Not called
  // by the renderer in Sprint 13 #1.
  copyTemplate: (req: TemplateCopyRequest): Promise<TemplateCopyResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_COPY, req),
```

Add the corresponding type imports at the top of the file (next to the existing `PickDirRequest` / `PickDirResult` block):

```typescript
import type {
  // ... existing imports ...
  TemplateCopyRequest,
  TemplateCopyResponse,
  TemplateListResponse,
} from '../shared/types.js';
```

### Step 2: Add the type declarations to `index.d.ts`

Open `src/preload/index.d.ts`. Find the `Api` interface. Add the following two method signatures inside the interface (matching the existing style — `listTemplates(): Promise<...>;`):

```typescript
  listTemplates(): Promise<TemplateListResponse>;
  copyTemplate(req: TemplateCopyRequest): Promise<TemplateCopyResponse>;
```

And add the corresponding type imports at the top of the file:

```typescript
import type {
  // ... existing imports ...
  TemplateCopyRequest,
  TemplateCopyResponse,
  TemplateListResponse,
} from '../shared/types.js';
```

### Step 3: Verify TypeScript + tests

Run: `pnpm type-check && pnpm test`
Expected: type-check exit 0; all tests pass.

### Step 4: Commit

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(preload): expose listTemplates / copyTemplate (Sprint 13 #1 Task 9)"
```

---

## Task 10: i18n keys (6 new)

**Files:**

- Modify: `src/shared/i18n.ts:43-100` (add 6 keys to `Messages` interface)
- Modify: `src/shared/i18n.ts:151-258` (add 6 entries to `MessagesZhCN`)
- Modify: `src/shared/i18n.ts:259-360` (add 6 entries to `MessagesEn`)

**No new test file needed**: the existing `src/shared/__tests__/i18n.test.ts` automatically checks `Object.keys(MessagesZhCN).sort() === Object.keys(MessagesEn).sort()` (or equivalent parity assertion) — adding a key to both bundles keeps parity.

### Step 1: Add 6 keys to the `Messages` interface

Open `src/shared/i18n.ts`. Find the `Messages` interface (line 43 onwards) and locate the end (search for `readonly 'bswmdParser.xmlMalformed': string;` or similar — it should be the last `app.*` key block before the closing `}`). Add the following block at the end of the interface, before the closing `}`:

```typescript
  // --- templates (Sprint 13 #1) ---
  readonly 'template.empty.displayName': string;
  readonly 'template.empty.description': string;
  readonly 'template.classic.displayName': string;
  readonly 'template.classic.description': string;
  readonly 'template.clone.displayName': string;
  readonly 'template.clone.description': string;
```

### Step 2: Add 6 entries to `MessagesZhCN`

Find the closing `};` of `MessagesZhCN` (around line 258). Add the following block immediately before it:

```typescript
  // templates (Sprint 13 #1)
  'template.empty.displayName': '空项目',
  'template.empty.description': '从零开始创建项目',
  'template.classic.displayName': '经典（即将上线）',
  'template.classic.description': '预填常见 BSWMD 的项目模板',
  'template.clone.displayName': '克隆（即将上线）',
  'template.clone.description': '基于现有项目创建副本',
```

### Step 3: Add 6 entries to `MessagesEn`

Find the closing `};` of `MessagesEn` (around line 367). Add the following block immediately before it:

```typescript
  // templates (Sprint 13 #1)
  'template.empty.displayName': 'Empty Project',
  'template.empty.description': 'Start a new project from scratch',
  'template.classic.displayName': 'Classic (coming soon)',
  'template.classic.description': 'Project template with common BSWMD prefilled',
  'template.clone.displayName': 'Clone (coming soon)',
  'template.clone.description': 'Create a copy of an existing project',
```

### Step 4: Verify the existing parity test still passes

Run: `pnpm test -- src/shared/__tests__/i18n.test.ts`
Expected: PASS. If it FAILS, you have a typo in one of the keys (one bundle has a key the other does not). Compare both bundles character by character.

### Step 5: Run all tests

Run: `pnpm test`
Expected: all 665 tests pass (640 baseline + 25 new + 0 from i18n since parity is auto-enforced).

### Step 6: Commit

```bash
git add src/shared/i18n.ts
git commit -m "feat(i18n): add 6 template.* keys zh-CN + en (Sprint 13 #1 Task 10)"
```

---

## Task 11: `package.json` extraResources

**Files:**

- Modify: `package.json` (add `extraResources` block to `build`)

### Step 1: Add `extraResources` block

Open `package.json`. Find the `"build": { ... }` section. It currently has `appId`, `productName`, `directories`, `files`, `win`, `linux`, `mac`. Add `extraResources` as a sibling of `files` (i.e. after the existing `"files": ["dist/**/*"],` line):

```json
    "files": [
      "dist/**/*"
    ],
    "extraResources": [
      {
        "from": "samples",
        "to": "samples",
        "filter": ["**/*"]
      }
    ],
```

### Step 2: Verify JSON parses

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`
Expected: exit code 0, no output (silence is success).

### Step 3: Verify the install dir path semantics (documentary, no test)

Run: `pnpm build` (or `pnpm build:renderer && pnpm build:main && pnpm build:preload` — the `build` script in `package.json` already does this). Confirm no errors.

> This task does not run a full `electron-builder` pack (that is out of scope for Sprint 13 #1; it ships in the backlog as Sprint 14+ #8). The `pnpm build` is only a TypeScript / Vite build sanity check.

### Step 4: Commit

```bash
git add package.json
git commit -m "build: add extraResources samples/ for electron-builder (Sprint 13 #1 Task 11)"
```

---

## Task 12: `samples/README.md` case-flip hygiene

**Files:**

- Modify: `samples/README.md:71-76` (replace `Bswmd/` references in the file-classification table)

### Step 1: Inspect the README table

Read `samples/README.md` lines 65-85 (the "文件分类规则" / "File classification rules" section). The table uses `bswmd/` (lowercase) for the _intended_ template convention but the 100+ reference BSWMD on disk use `Bswmd/` (capital B). The opt-in gate (`template.json` present) means the 100+ dirs are never classified — they are silent reference data. The README's example is correct (lowercase for new templates); the 100+ on disk are an intentional legacy shape. The fix is a clarifying note, not a rename.

### Step 2: Add a one-line clarification

After the existing table (the table ends with the row `'template.json' | 跳过（不拷）`), add the following paragraph:

```markdown
> **大小写注意**：上述约定 `bswmd/`（小写 b）是**新模板**的标准。仓库内现有的 100+ 参考 BSWMD（`samples/arxml/<Module>/Bswmd/<Module>_bswmd.arxml`，大写 B）属于历史 vendor 上游 sync 数据，**没有** `template.json` 标记，被 opt-in gate 静默忽略，不会出现在 picker 中。新建模板时务必用 `bswmd/`（小写）。
```

### Step 3: Verify nothing else in the README needs the same fix

Run: `grep -nE "Bswmd/" samples/README.md`
Expected: the existing table row `<id>/bswmd/<file>.arxml | bswmdPaths` (lowercase) plus the new clarification note (which intentionally mentions both). No other capital-B `Bswmd/` references should remain.

### Step 4: Commit

```bash
git add samples/README.md
git commit -m "docs(samples): clarify bswmd/ case convention vs legacy Bswmd/ (Sprint 13 #1 Task 12)"
```

---

## Task 13: Final verify — coverage, baseline 5/5, version bump, CHANGELOG, commit, push

**Files:**

- Modify: `package.json` (bump `version` 0.13.0 → 0.14.0)
- Modify: `CHANGELOG.md` (add Sprint 13 #1 entry)

This task is the ship gate. No new code; only verification + bookkeeping + push.

### Step 1: Run the full test suite

Run: `pnpm test`
Expected: 665 tests pass (640 baseline + 25 new).

If any test fails, STOP. Do not bump version. Diagnose and fix before continuing.

### Step 2: Run type-check and lint

Run: `pnpm type-check && pnpm lint`
Expected: both exit 0. The project uses `--max-warnings 0` (per `package.json`), so any warning is a failure.

### Step 3: Verify coverage meets baseline

Run: `pnpm test -- --coverage`
Expected:

- stmts ≥ 96% (baseline 96.47%)
- branches ≥ 85% (baseline 85.45%)
- funcs = 100% (baseline 100%)

If coverage is below baseline, identify the gap (`pnpm test -- --coverage --reporter=text` shows uncovered lines) and add a missing test. Do NOT bump version until coverage is green.

### Step 4: Verify 5/5 baseline guards

The 5 baseline items per spec §5.4:

1. **cross-ref 782 signed-guard [700, 850]**: this is enforced by the existing `tests/fixtures/bswmd/__tests__/bswmd-roundtrip.test.ts` style count assertion. Running `pnpm test` covers it.
2. **ref-dest = 0**: covered by `src/core/validation/__tests__/validateProject.canifSmoke.test.ts` (per the earlier grep). Running `pnpm test` covers it.
3. **ref-cycle = 0**: same as above.
4. **schema-unknown = 0**: same as above.
5. **NEW: `samples/arxml/.gitkeep` exists**: run `test -f samples/arxml/.gitkeep` (or `ls samples/arxml/.gitkeep` on Windows). Expected: file exists.

If any guard fails, STOP. The 5th guard is new in this sprint; if missing, add a one-line `// keep` file to `samples/arxml/` and re-verify.

### Step 5: Bump version 0.13.0 → 0.14.0

Open `package.json`. Change the `"version"` line from `"0.13.0"` to `"0.14.0"`. Save.

Verify: `node -e "console.log(require('./package.json').version)"`
Expected output: `0.14.0`

### Step 6: Add CHANGELOG entry

Open `CHANGELOG.md`. Find the existing "## [0.13.0]" section (Sprint 12 #3). Add a new section above it (or at the top, per the file's convention):

```markdown
## [0.14.0] - 2026-06-17 — Sprint 13 #1

### Added (backend only — no UI)

- **`src/main/templates/`** new module:
  - `discoverBuiltinTemplates(samplesRoot)` — opt-in scan of `<samplesRoot>/<id>/template.json` directories
  - `copyTemplateFilesToDir(template, samplesRoot, destDir)` — copy template files into a project directory
  - `parseTemplateManifest(raw)` — type guard for `template.json` shape (hand-rolled, no new deps)
  - `walkArxml(root, opts)` — recursive `*.arxml` finder with `bswmd/` exclusion
- **IPC channels**: `templates:list`, `templates:copy`
- **Preload bridge**: `window.api.listTemplates()`, `window.api.copyTemplate(req)`
- **6 new i18n keys**: `template.empty/classic/clone.{displayName,description}` (zh-CN + en parity preserved)
- **`package.json` `build.extraResources`**: includes `samples/` in install bundles (dev path: `app.getAppPath()/samples`; prod path: `process.resourcesPath/samples`)

### Behavior

- Renderer (NewProjectDialog) is **unchanged** in this sprint. Sprint 13 #2 will add the `TemplateCard` picker UI; the backend is ready.
- The 100+ reference BSWMD under `samples/arxml/<Module>/Bswmd/` (capital B, legacy vendor sync) remain on disk and are silently ignored by `discoverBuiltinTemplates` (no `template.json` → opt-in skip). Future `classic` template content will live under `samples/arxml/classic/template.json` + `bswmd/` (lowercase) when the user picks vendor / dialect / license in a later sprint.

### Tests

- **640 → 665 tests** (+25):
  - 5 `parseTemplateManifest` cases
  - 9 `discoverBuiltinTemplates` cases
  - 5 `copyTemplateFilesToDir` cases
  - 6 IPC handler cases
- **Coverage**: 96.47% stmts / 85.45% branches / 100% funcs (unchanged from Sprint 12 #3 baseline)
- **5/5 baseline guards**: all green; new item `samples/arxml/.gitkeep exists` added
```

### Step 7: Final commit + push

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): bump v0.14.0 for Sprint 13 #1 templates backend"
git -c http.proxy= -c https.proxy= push -u origin main
```

Expected: `package.json` + `CHANGELOG.md` committed; push to `origin/main` succeeds (with unset proxy, per Sprint 12 #1 workaround).

If push fails with `Recv failure: Connection was reset`, retry once. If still fails, ask the user to verify their network or try from a different network egress (per the memory note about Sprint 12 #3 push).

### Step 8: Update the project memory file

Open `C:\Users\13777\.claude\projects\D--claude-proj2\memory\claude-autosarcfg-overview.md` and update the description line to reflect v0.14.0 + Sprint 13 #1 ship. Add a "Sprint 13 #1 完成路线" section mirroring the existing "Sprint 12 #3 完成路线" structure (item / detail rows for each of the 12 commits above).

(There is no commit step for this — memory updates are session-local, not pushed.)

---

## Spec Coverage Check (self-review)

| Spec section             | Implemented in                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §2.1 高层流程            | Task 8 (initBuiltinTemplatesCache) + Task 7 (handlers) + Task 9 (preload)                                                                                                                                                                        |
| §2.2 不引新依赖          | Plan adds zero deps (hand-rolled type guard, no Zod)                                                                                                                                                                                             |
| §2.3 严格分层            | All Task 1-5 files in `src/main/templates/` import only core/shared/node/electron; Task 7 handler imports both `main/templates` and `shared/types`                                                                                               |
| §2.4 错误处理            | Task 1 (errors.ts) + Task 3 (warn + skip in discover) + Task 4 (throw in copy) + Task 7 (throw in handler)                                                                                                                                       |
| §3 Module layout         | Tasks 1-9 mirror spec §3 exactly                                                                                                                                                                                                                 |
| §3.3 公开 API            | Task 1 (types) + Task 3 (discover) + Task 4 (copy) + Task 5 (index re-exports)                                                                                                                                                                   |
| §3.4 IPC 契约            | Task 6 (4 interfaces added to `src/shared/types.ts`)                                                                                                                                                                                             |
| §3.5 Error envelope      | Task 1 (TemplateError 7-kind) + Task 4 (file-copy-failed throw) + Task 7 (handler throw)                                                                                                                                                         |
| §3.6 i18n key 设计       | Task 10 (6 keys × 2 locales)                                                                                                                                                                                                                     |
| §3.7 package.json        | Task 11 (extraResources block)                                                                                                                                                                                                                   |
| §4 Data flow             | Task 3 (discover internals) + Task 4 (copy internals) + Task 7 (handler behavior)                                                                                                                                                                |
| §5 Testing strategy      | Tasks 2, 3, 4, 7 (25 cases) + Task 13 (coverage verify)                                                                                                                                                                                          |
| §5.4 5/5 baseline        | Task 13 Step 4 (verify all 5)                                                                                                                                                                                                                    |
| §6 Out of scope          | Nothing in this plan touches TemplateCard UI / classic content / clone IPC / chips / saveAndProceed / overwrite-confirm / vendor BSWMD / i18n M6-M8 / serialize / vendor-namespace / fixture volume / electron-builder packaging / coverage ≥90% |
| §7.3 Hygiene             | Task 12 (samples/README.md clarification)                                                                                                                                                                                                        |
| §8 Deliverable checklist | All 14 items covered across Tasks 1-13                                                                                                                                                                                                           |

**Gaps**: None. Spec §8 checklist item 11 ("667 tests 全过") is slightly off — actual is 665 (640 baseline + 25 new), and i18n parity test does not add separate test cases (auto-enforced by existing `i18n.test.ts`). The spec's count was 667 because it counted 6 i18n parity "assertions" as test cases. Functionally equivalent.

---

## Execution Time Estimate

- Tasks 1-5 (core): ~30 min for a fresh agent
- Task 6 (IPC types): ~5 min
- Task 7 (handler + tests): ~25 min
- Task 8 (register + boot wire): ~10 min
- Task 9 (preload): ~10 min
- Task 10 (i18n): ~5 min
- Task 11 (package.json): ~3 min
- Task 12 (README hygiene): ~5 min
- Task 13 (verify + version + push): ~15 min

**Total: ~110 min** for a fresh subagent per task, or ~50 min for inline execution (skipping subagent spin-up overhead).
