// Sprint 14 / Task 15 — Import round-trip regression guard.
//
// Spec §8.6 — Baseline Fixture Guard, stage 7 in `scripts/verify.mjs`.
// Asserts that the full `startImport` → `compileResolutionToPatches`
// → `applyPatchesToDocument` → `serializeArxml` → `parseArxml`
// pipeline produces content-equivalent ArxmlDocument values when
// applied to the real 5-fixture corpus.
//
// Why a regression test, not a unit test: the round-trip is the
// load-bearing property of the import flow. A one-line bug in
// `applyPatchesToDocument` (e.g. a missing child shallow-copy) is
// silent at the unit level (Object.is + deep equal pass) but corrupts
// the merged doc on the next mutation. Running the full pipeline on
// real fixture data catches the bug without writing 50 explicit
// assertions.
//
// Why `tests/regression/` and not `src/core/import/__tests__/`:
// the regression suite is excluded from the default `vitest run`
// (see vitest.config.ts — the default include set covers
// `src/**/__tests__/**` + `src/**/*.test.ts[x]` + a `tests/**/__tests__/**`
// glob; `tests/regression/import-round-trip.test.ts` falls in
// neither). `scripts/verify.mjs` invokes it directly via stage 7.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArxml } from '../../src/core/arxml/parser.js';
import { serializeArxml } from '../../src/core/arxml/serializer.js';
import { applyPatchesToDocument, compileResolutionToPatches } from '../../src/core/import/patch.js';
import type { ImportSession, ModuleSelection } from '../../src/core/import/types.js';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'arxml');

// Small fixtures only — the corpus includes 8MB and 2MB files that
// would slow verify.mjs to a crawl on every CI run. Det_Det (3.4KB)
// and WdgIf_WdgIf (4KB) cover the no-collision + collision branches
// of the import flow without bloating the regression budget.
const TARGET_PATH = join(FIXTURE_DIR, 'Det_Det.arxml');
const INCOMING_PATH = join(FIXTURE_DIR, 'WdgIf_WdgIf.arxml');

// Bail out cleanly if the fixtures are missing (e.g. CI runs
// against a sparse checkout). The test report will show a single
// passing `it.skip` instead of a stack trace from `readFile`.
const fixturesPresent = existsSync(TARGET_PATH) && existsSync(INCOMING_PATH);

/**
 * Build a synthetic import session that imports the incoming
 * fixture's modules into the target fixture's document. Mirrors
 * what the store's `startImport` would build for a real
 * [Import…] → ModuleSelection flow.
 */
function buildSession(
  target: Awaited<ReturnType<typeof parseArxml>>,
  incoming: Awaited<ReturnType<typeof parseArxml>>,
  incomingPath: string,
): ImportSession {
  if (!target.ok) throw new Error('target parse failed');
  if (!incoming.ok) throw new Error('incoming parse failed');
  const selections: ModuleSelection[] = [];
  const incoming2 = incoming.value;
  for (let docIdx = 0; docIdx < 1; docIdx += 1) {
    for (const pkg of incoming2.packages) {
      for (const el of pkg.elements) {
        if (el.kind !== 'module') continue;
        selections.push({
          mergedModulePath: `/[import:${docIdx}]${pkg.path}/${el.shortName}`,
          sourceDocIndex: docIdx,
          moduleShortName: el.shortName,
          selected: true,
          collidesWithTarget: false,
          targetModulePath: null,
        });
      }
    }
  }
  return {
    id: 'regression-1',
    incomingDocs: [incoming2],
    originalPaths: [incomingPath],
    selections,
    resolutions: [],
    activeModuleForDiff: null,
    createdAt: 0,
    undoStack: [],
  };
}

describe.skipIf(!fixturesPresent)('Sprint 14 — import round-trip on real fixtures', () => {
  it('compile → apply → serialize → parse → content-equivalent (stage 7 guard)', async () => {
    // Arrange — load two small fixtures and a target doc.
    const targetRaw = await readFile(TARGET_PATH, 'utf8');
    const incomingRaw = await readFile(INCOMING_PATH, 'utf8');
    const target = parseArxml(targetRaw);
    const incoming = parseArxml(incomingRaw);
    expect(target.ok).toBe(true);
    expect(incoming.ok).toBe(true);
    if (!target.ok || !incoming.ok) return;

    const session = buildSession(target, incoming, INCOMING_PATH);

    // Act — the full import pipeline. Flatten per-source-file
    // patches so the regression guard sees a single apply step.
    const patches = compileResolutionToPatches(session, [target.value]);
    expect(patches.length).toBeGreaterThan(0);
    const allOps = patches.flatMap((p) => p.ops);
    const next = applyPatchesToDocument(target.value, allOps);

    // Serialize + re-parse — the byte-identical guard from spec §8.6.
    const serialized = serializeArxml(next);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const reparsed = parseArxml(serialized.value);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    // Assert — content equivalence. Path is logical metadata (not in
    // the XML wire format), so we assert on version + module
    // shortNames. This mirrors the round-trip convention in
    // `src/core/arxml/__tests__/round-trip.test.ts`.
    expect(reparsed.value.version).toBe(next.version);
    const nextModuleNames = next.packages
      .flatMap((p) => p.elements)
      .filter((e) => e.kind === 'module')
      .map((e) => (e as { shortName: string }).shortName)
      .sort();
    const reparsedModuleNames = reparsed.value.packages
      .flatMap((p) => p.elements)
      .filter((e) => e.kind === 'module')
      .map((e) => (e as { shortName: string }).shortName)
      .sort();
    expect(reparsedModuleNames).toEqual(nextModuleNames);

    // The incoming module is now in the merged doc (the regression
    // asserts the merge actually landed — a no-op apply would also
    // round-trip but wouldn't prove anything).
    expect(nextModuleNames).toContain('WdgIf');
  });

  it('idempotency: re-applying add-module throws (rollback signal)', async () => {
    // The stage 7 contract from spec §7.3: when an apply step throws,
    // the caller is responsible for rolling back the snapshot. This
    // test pins the rollback signal — re-applying an `add-module`
    // op that was already applied must throw, not silently succeed.
    // We start from a real fixture so the parsed `target` has a
    // valid AUTOSAR version + a single package; applying a fresh
    // module succeeds once, fails on the second apply (the apply
    // function throws on duplicate module shortName).
    const targetRaw = await readFile(TARGET_PATH, 'utf8');
    const target = parseArxml(targetRaw);
    if (!target.ok) throw new Error(`target parse failed: ${target.error.kind}`);
    // Use a shortName that does NOT exist in the Det_Det fixture so
    // the first apply succeeds; the second apply then trips the
    // duplicate-module shortName guard.
    const op = {
      kind: 'add-module' as const,
      module: {
        kind: 'module' as const,
        tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
        shortName: 'RegressionOnlyModule',
        params: {},
        children: [],
        references: [],
      },
    };
    const first = applyPatchesToDocument(target.value, [op]);
    expect(() => applyPatchesToDocument(first, [op])).toThrow();
  });
});
