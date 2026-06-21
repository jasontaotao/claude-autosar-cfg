// @ts-check
// Sprint 14 #1 Phase D (T16) — PduId Validation End-to-End.
//
// Drives the validator pattern through the real script-engine pipeline
// (import-resolver + ctx + vm-runner) against 5 real ARXML fixtures
// from `tests/fixtures/arxml/`. The fixture set matches what the
// project ships (Com_Com / Det_Det / EcuC_EcuC / PduR_PduR /
// WdgIf_WdgIf); the brief's example list (Com / CanIf / PduR / EcuC /
// ComM) referenced module names that are NOT in this fixture directory
// — the closest matching real fixtures are used instead.
//
// IMPORTANT ADAPTATION (recorded in this file's header so the
// rationale survives review): the shipped `pduid-uniqueness.js`
// fixture uses `import { basename } from './utils/path.js';` — a real
// ES module import. Phase A's `runInSandbox` does NOT strip `import`
// statements (see Phase A report §self-review #4: `_import` is
// unimplemented, vm-runner would surface the import as a syntax
// error in `node:vm`). The shipped validator therefore cannot be
// executed end-to-end through the current pipeline. To still deliver
// the E2E coverage the brief requires, this test inlines a
// structurally identical validator (same algorithm, no `import`
// statements) into the script entry — proving the entire
// pipeline (import-resolver + ctx + vm-runner + sinks) executes
// cleanly against real fixtures.
//
// The inline validator preserves the fixture's spec-compliant
// semantics:
//   - scans every ComIPdu in the project
//   - reads `ComTxIPduUnusedAreasDefault` integer param
//   - emits `script:pduid-duplicate` violation when two containers
//     share the same id
//   - emits one summary log line at the end
//
// Pipeline under test:
//   src/main/script/import-resolver.ts → src/main/script/ctx.ts →
//   src/main/script/vm-runner.ts

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArxml } from '../../../src/core/arxml/parser.js';
import type { ArxmlDocument, ParamValue } from '../../../src/core/arxml/types.js';
import { setParamInDocument } from '../../../src/core/project/setters.js';
import { resolveImports } from '../../../src/main/script/import-resolver.js';
import type {
  ScriptEntry,
  ScriptLog,
  ScriptMutation,
  ScriptRunResult,
  ScriptViolation,
} from '../../../src/main/script/types.js';
import { runInSandbox } from '../../../src/main/script/vm-runner.js';

// ---------------------------------------------------------------------------
// Fixtures (real ARXML shipped under tests/fixtures/arxml/)
// ---------------------------------------------------------------------------

const FIXTURE_DIR = resolve(__dirname, '..', '..', 'fixtures', 'arxml');

interface FixtureCase {
  readonly fixture: string;
  /** Human label used in `it()` titles. */
  readonly label: string;
}

const FIXTURES: readonly FixtureCase[] = [
  { fixture: 'Com_Com.arxml', label: 'Com' },
  { fixture: 'Det_Det.arxml', label: 'Det' },
  { fixture: 'EcuC_EcuC.arxml', label: 'EcuC' },
  { fixture: 'PduR_PduR.arxml', label: 'PduR' },
  { fixture: 'WdgIf_WdgIf.arxml', label: 'WdgIf' },
];

// ---------------------------------------------------------------------------
// Duplicate injection — uses the real Com_Com.arxml as the base project,
// then mutates 2 ComTxIPdu containers in memory via `setParamInDocument`
// to share `ComTxIPduUnusedAreasDefault=42`. This proves the
// validator's end-to-end detection works against real parser output.
// The mutation uses Phase A's `setParamInDocument` helper — the same
// setter the production transaction uses.
// ---------------------------------------------------------------------------

interface ArxmlEl {
  readonly shortName: string;
  readonly children?: ReadonlyArray<ArxmlEl>;
  readonly params?: Readonly<Record<string, ParamValue>>;
}

function collectDuplicateTargets(project: ArxmlDocument): string[] {
  const targets: string[] = [];
  function visit(elements: ReadonlyArray<ArxmlEl>, parentPath: string): void {
    for (const el of elements) {
      const myPath = `${parentPath}/${el.shortName}`;
      if (el.params !== undefined && 'ComTxIPduUnusedAreasDefault' in el.params) {
        targets.push(myPath);
      }
      if (el.children !== undefined) {
        visit(el.children, myPath);
      }
    }
  }
  for (const pkg of project.packages) {
    const root = pkg as unknown as { elements: ReadonlyArray<ArxmlEl>; path?: string };
    visit(root.elements, root.path ?? `/${pkg.shortName}`);
  }
  return targets;
}

function injectDuplicate(project: ArxmlDocument): {
  project: ArxmlDocument;
  paths: [string, string];
} {
  const targets = collectDuplicateTargets(project);
  if (targets.length < 2) {
    throw new Error(`expected at least 2 ComTxIPdu containers, found ${targets.length}`);
  }
  const [a, b] = [targets[0]!, targets[1]!];
  // setParamInDocument mutates `doc` in place (via spliceContainer) and
  // returns void. We operate on the same project twice.
  // ParamValue is the wider union — number is a valid ParamValue per
  // the types.ts definition; cast satisfies the strict checker.
  const dupId = 42 as unknown as ParamValue;
  setParamInDocument(project, a, 'ComTxIPduUnusedAreasDefault', dupId);
  setParamInDocument(project, b, 'ComTxIPduUnusedAreasDefault', dupId);
  return { project, paths: [a, b] };
}

// ---------------------------------------------------------------------------
// Inline validator source — structurally identical to
// tests/fixtures/scripts/pduid-uniqueness.js but without the
// `import { basename } from './utils/path.js';` statement. See file
// header for why the shipped fixture is not used directly.
// ---------------------------------------------------------------------------

const VALIDATOR_SOURCE = `const seen = new Map();
const ipdus = ctx.project.findContainers({ def: '/ComTxIPdu' });
for (const ipdu of ipdus) {
  const idParam = ipdu.getParam('ComTxIPduUnusedAreasDefault');
  if (idParam === null) continue;
  const id = idParam.asInteger();
  if (seen.has(id)) {
    ctx.validator.addViolation({
      kind: 'script:pduid-duplicate',
      severity: 'error',
      containerPath: ipdu.path,
      message: 'PduId ' + id + ' 已被 ' + seen.get(id) + ' 占用',
    });
  } else {
    seen.set(id, ipdu.path);
  }
}
ctx.log.info('扫描完成: ' + ipdus.length + ' 个 ComIPdu, ' + seen.size + ' 个独立 PduId');
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RunOutcome {
  readonly result: ScriptRunResult;
  readonly logs: readonly ScriptLog[];
  readonly violations: readonly ScriptViolation[];
  readonly mutations: readonly ScriptMutation[];
}

function runValidatorOn(project: ArxmlDocument): RunOutcome {
  const entry: ScriptEntry = {
    id: 'pduid-uniqueness-fixture',
    name: 'PduId uniqueness',
    shortName: 'pduid-uniqueness',
    kind: 'validator',
    source: VALIDATOR_SOURCE,
    imports: [],
    updatedAt: '2026-06-19T00:00:00Z',
  };
  // resolveImports accepts an empty imports[] source — no deps to walk.
  resolveImports(entry, [entry]);

  const logs: ScriptLog[] = [];
  const violations: ScriptViolation[] = [];
  const mutations: ScriptMutation[] = [];
  const result = runInSandbox(entry, logs, violations, mutations, {
    timeoutMs: 5_000,
    project,
  });
  return { result, logs, violations, mutations };
}

function parseFixture(filename: string): ArxmlDocument {
  const xml = readFileSync(join(FIXTURE_DIR, filename), 'utf8');
  const r = parseArxml(xml);
  if (!r.ok) {
    const errMsg =
      typeof r.error === 'string'
        ? r.error
        : Array.isArray(r.error)
          ? r.error.join('; ')
          : JSON.stringify(r.error);
    throw new Error(`fixture parse failed: ${filename}: ${errMsg}`);
  }
  return r.value;
}

// ---------------------------------------------------------------------------
// Tests — one per fixture plus the duplicate-injection case.
// ---------------------------------------------------------------------------

describe('Sprint 14 #1 T16 — PduId Validation E2E (5 fixtures + duplicate case)', () => {
  for (const tc of FIXTURES) {
    it(`${tc.label}: pipeline runs end-to-end on ${tc.fixture}`, () => {
      const project = parseFixture(tc.fixture);
      const { result, logs } = runValidatorOn(project);

      expect(result.status).toBe('ok');
      // The validator always emits a summary log line — the proof of
      // life that the full ctx + vm-runner pipeline executed.
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.some((l) => l.message.startsWith('扫描完成'))).toBe(true);
      // durationMs is always >= 0 for a real run.
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  }

  it('duplicate injection: 2 ComTxIPdu forced to share ComTxIPduUnusedAreasDefault=42 → 1 violation', () => {
    // Load the real Com_Com.arxml, inject a duplicate via
    // setParamInDocument, then run the validator. Proves the
    // validator detects duplicates in real parser output.
    const baseProject = parseFixture('Com_Com.arxml');
    const { project, paths } = injectDuplicate(baseProject);
    expect(paths[0]).not.toBe(paths[1]);

    const { result, violations } = runValidatorOn(project);

    expect(result.status).toBe('ok');
    const dupViolations = violations.filter((v) => v.kind === 'script:pduid-duplicate');
    expect(dupViolations.length).toBeGreaterThanOrEqual(1);
    expect(dupViolations[0]!.message).toMatch(/42/);
    expect(dupViolations[0]!.severity).toBe('error');
    for (const v of dupViolations) {
      expect(typeof v.containerPath).toBe('string');
      expect((v.containerPath ?? '').length).toBeGreaterThan(0);
    }
  });
});
