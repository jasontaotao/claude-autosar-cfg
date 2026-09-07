# definitionRefResolver Adoption — DBC→COM Stack + BSWMD Threading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisite:** `2026-09-02-odx-diag-extract-correctness.md` (v2) must be
> complete — it creates `src/core/bridge/definitionRefResolver.ts` and adds
> `bswmds` to `OdxToDiagnosticExtractRequest`. This plan was split out of the
> ODX correctness fix during plan review (2026-09-02): the DBC→COM stack is a
> separate user story and must ship independently.

**Goal:** Eliminate the remaining hardcoded definition-ref literals in the DBC→COM stack mapper, thread workspace BSWMDs into both standalone import handlers (DBC and ODX), and add a post-generation validation guard so the whole class of "invented ref prefix" bugs is caught at test time.

**Architecture:** (1) `dbcToComStack` replaces its 5 hardcoded `definitionRef` literals (7 template strings) with `resolveDefinitionRef` calls, preserving its existing direct/nested hierarchy logic; (2) the DBC import IPC handler loads workspace BSWMDs and passes them through; (3) the standalone ODX extract handler gains an additive `bswmdDir` field so the ODX flow also resolves accurately instead of relying on the fallback prefix; (4) a `assertDefinitionRefsResolve` helper validates generated ARXML against BSWMDs in tests.

**Tech Stack:** TypeScript, fast-xml-parser, Vitest, no new dependencies.

**Spec:** Inline. The DBC→COM mapper currently emits `/AUTOSAR/Com/...`, `/AUTOSAR/CanIf/...`, `/AUTOSAR/PduR/...` refs (`dbcToComStack.ts:407, 421-422, 460-461, 474-475, 487`) that do not resolve against any known BSWMD set — same bug class as the ODX extract fixed in the prerequisite plan.

**Verified facts (2026-09-02):**

- Actual ref sites in `src/core/bridge/dbcToComStack.ts`: line 407 `ComIPdu`; lines 421-422 `ComSignal` (direct vs nested under `ComIPdu`); lines 460-461 `CanIfTxPduCfg` (direct vs nested under a runtime sub-container); lines 474-475 `CanIfRxPduCfg` (same); line 487 `PduRRoutingPath`. **Container short names are `CanIfTxPduCfg` / `CanIfRxPduCfg`** (with `Cfg` suffix — an earlier draft of this work used `CanIfTxPdu`, which does not exist).
- Workspace BSWMDs exist for all three modules: `Com_bswmd.arxml` (`ComConfig` line 32 → `ComIPdu` 872 → `ComSignal` 1954), `CanIf_bswmd.arxml` (`CanIfInitCfg` 505 → `CanIfRxPduCfg` 969 / `CanIfTxPduCfg` 1555), `PduR_bswmd.arxml` (`PduRRoutingPath` 714), all under `/AUTOSAR_R22/EcucDefs/`.
- `parseBswmd(xml: string): Result<BswmdDocument, BswmdError>` at `src/core/project/bswmd/parse.ts:65`; `BswmdDocument.modules` is `readonly BswModuleDef[]`.

## Global Constraints

- Use `resolveDefinitionRef` from `src/core/bridge/definitionRefResolver.ts` — do not duplicate tree-walk logic.
- Preserve `dbcToComStack`'s existing direct/nested branching (`comSignalDirect`, `canIfSubs.txDirect`/`rxDirect`) — only the prefix resolution changes, not the hierarchy computation.
- IPC contracts: additive only (`bswmds?` / `bswmdDir?` optional fields).
- When a BSWMD is threaded and a path misses, the resolver's `onMiss` must be wired to a visible warning (stats/log), not swallowed.
- Test runner: `node node_modules\vitest\vitest.mjs run <path> --reporter=dot`
- TypeScript checks: `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json` and `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.web.json`

---

### Task 1: Adopt resolver in `dbcToComStack`

**Files:**

- Modify: `src/core/bridge/dbcToComStack.ts`
- Test: `src/core/bridge/__tests__/dbcToComStack.test.ts`

**Interfaces:**

- `DbcToComStackInput` gains `readonly bswmds?: ReadonlyMap<string, BswModuleDef>` (additive)

- [ ] **Step 1: Write failing tests**

```typescript
it('emits standard-prefix definition-refs when no BSWMD is threaded (fallback)', () => {
  const result = dbcToComStack({ ...baseInput, bswmds: new Map() });
  expect(result.xml).toContain('/AUTOSAR_R22/EcucDefs/Com/');
  expect(result.xml).not.toContain('/AUTOSAR/Com/');
  expect(result.xml).not.toContain('/AUTOSAR/CanIf/');
  expect(result.xml).not.toContain('/AUTOSAR/PduR/');
});

it('resolves refs from a threaded BSWMD with a non-standard package root', () => {
  // Fixture Com BSWMD rooted at /AUTOSAR/Com (mirrors the real-OEM
  // fixture pattern used by dcmConfigPipeline.test.ts).
  const result = dbcToComStack({ ...baseInput, bswmds: new Map([['Com', comBswmdFixture]]) });
  expect(result.xml).toContain('/AUTOSAR/Com/');
});

it('fires onMiss-visible warning when threaded BSWMD lacks the container path', () => {
  // Thread a Com BSWMD that does not contain ComSignal; assert the
  // mapper surfaces a miss (via the stats/warnings channel chosen in
  // Step 3) AND still emits the fallback ref.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules\vitest\vitest.mjs run src/core/bridge/__tests__/dbcToComStack.test.ts --reporter=dot`
Expected: FAIL — current output uses `/AUTOSAR/Com/` etc.

- [ ] **Step 3: Implement**

Extend the input interface, then replace each literal. **Preserve the existing direct/nested branching** — resolve with the same path segments the literals encode:

```typescript
import { resolveDefinitionRef } from './definitionRefResolver.js';
import type { BswModuleDef } from '../project/bswmd/types.js';

// Top of the main export:
const comBswmd = input.bswmds?.get('Com');
const canIfBswmd = input.bswmds?.get('CanIf');
const pduRBswmd = input.bswmds?.get('PduR');

// Line 407:
definitionRef: resolveDefinitionRef('Com', [comPrimary, 'ComIPdu'], comBswmd),

// Lines 421-422 (keep the comSignalDirect branch):
definitionRef: input.comSignalDirect === true
  ? resolveDefinitionRef('Com', [comPrimary, 'ComSignal'], comBswmd)
  : resolveDefinitionRef('Com', [comPrimary, 'ComIPdu', 'ComSignal'], comBswmd),

// Lines 460-461 (keep the txDirect branch; note the Cfg suffix):
definitionRef: canIfSubs.txDirect
  ? resolveDefinitionRef('CanIf', [canIfPrimary, 'CanIfTxPduCfg'], canIfBswmd)
  : resolveDefinitionRef('CanIf', [canIfPrimary, canIfSubs.txSubName, 'CanIfTxPduCfg'], canIfBswmd),

// Lines 474-475 (same for Rx):
definitionRef: canIfSubs.rxDirect
  ? resolveDefinitionRef('CanIf', [canIfPrimary, 'CanIfRxPduCfg'], canIfBswmd)
  : resolveDefinitionRef('CanIf', [canIfPrimary, canIfSubs.rxSubName, 'CanIfRxPduCfg'], canIfBswmd),

// Line 487:
definitionRef: resolveDefinitionRef('PduR', [pduRPrimary, 'PduRRoutingPath'], pduRBswmd),
```

Wire `onMiss` into whatever warning surface `DbcToComStackResult` already has (stats object or a new additive `warnings?: readonly string[]` field — check the existing result type and prefer extending it over inventing a new channel).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node node_modules\vitest\vitest.mjs run src/core/bridge/__tests__/dbcToComStack.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/bridge/dbcToComStack.ts src/core/bridge/__tests__/dbcToComStack.test.ts
git commit -m "refactor(bridge): adopt definitionRefResolver in DBC→COM stack mapper"
```

---

### Task 2: Thread BSWMD loading into the DBC import handler

**Files:**

- Modify: the DBC import IPC handler (locate via `rg -l "dbcToComStack" src/main/ipc/`)

**Interfaces:**

- Consumes: `DbcToComStackInput.bswmds` (Task 1)

- [ ] **Step 1: Locate the handler and its workspace context**

Run: `rg -l "dbcToComStack" src/main/ipc/`
Confirm the handler has (or can cheaply get) the workspace/project path. If it cannot, add an additive optional `bswmdDir?: string` to the IPC request and have the renderer pass the open project's `bswmd/` directory — do NOT invent a main-process project-state lookup.

- [ ] **Step 2: Load BSWMDs**

```typescript
import { parseBswmd } from '../../core/project/bswmd/index.js';

// Load each BSWMD file from the given bswmd directory (skip silently
// when the directory is absent — fallback prefix stays in effect).
const bswmds = new Map<string, BswModuleDef>();
const files = await fs.readdir(bswmdDir).catch(() => [] as string[]);
for (const file of files) {
  if (!file.endsWith('.arxml')) continue;
  const content = await fs.readFile(join(bswmdDir, file), 'utf8');
  const result = parseBswmd(content);
  if (result.ok) {
    for (const mod of result.value.modules) bswmds.set(mod.shortName, mod);
  }
}
```

Pass `bswmds` into `dbcToComStack({ ... })`.

Note: BSWMD files can be several MB each. If the handler is latency-sensitive, load once per IPC call (fine) and let a future optimization cache by mtime — do not build the cache in this task.

- [ ] **Step 3: Add/update handler tests**

Cover: bswmdDir absent → fallback refs; bswmdDir with the repo's existing BSWMD fixtures → resolved refs.

- [ ] **Step 4: Run tests**

Run: `node node_modules\vitest\vitest.mjs run src/main/ipc/__tests__/ --reporter=dot`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/
git commit -m "feat(bridge): thread workspace BSWMDs into DBC import for definition-ref resolution"
```

---

### Task 3: Thread BSWMDs into the standalone ODX extract handler

**Files:**

- Modify: `src/main/ipc/odxImportDiagnosticExtractHandler.ts`
- Modify: `src/shared/types/` (additive `bswmdDir?: string` on `OdxImportDiagExtractRequest`)
- Modify: renderer caller (pass the open project's `bswmd/` dir)
- Test: `src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.real.test.ts`

**Context:** The prerequisite plan deliberately left this handler on the resolver's fallback prefix (correct for the R22 workspace, wrong for anything else). This task closes that gap.

- [ ] **Step 1: Add `bswmdDir?: string` to `OdxImportDiagExtractRequest`** (additive, optional — omitting it preserves current behavior exactly).

- [ ] **Step 2: In the handler, load BSWMDs when `bswmdDir` is provided** (reuse the Task-2 loading snippet — extract it into a shared helper `src/main/ipc/loadBswmds.ts` if both handlers now need it).

- [ ] **Step 3: Pass to the mapper**

```typescript
const { demContent, dcmContent, stats } = odxToDiagnosticExtract({
  odx: parseResponse.value,
  bswmds,
});
```

- [ ] **Step 4: Renderer passes the open project's `bswmd/` directory** when invoking the IPC. No UI change.

- [ ] **Step 5: Tests** — extend the real-fixture test: with `bswmdDir` pointing at a BSWMD fixture dir, refs resolve; without it, output is byte-identical to today (fallback).

- [ ] **Step 6: Run tests + tsc, then commit**

```bash
git add src/main/ipc/ src/shared/types/ src/renderer/
git commit -m "feat(odx): thread workspace BSWMDs into standalone diagnostic extract"
```

---

### Task 4: Post-generation definition-ref validation guard

**Files:**

- Create: `src/core/bridge/assertDefinitionRefsResolve.ts`
- Test: `src/core/bridge/__tests__/assertDefinitionRefsResolve.test.ts`
- Modify: `src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.real.test.ts` and the DBC real-fixture equivalent (wire the guard in)

**Rationale:** The resolver fixes generation; this guard catches the whole class — any future mapper emitting an unresolvable ref fails its real-fixture test. This would have caught every bug fixed across both plans.

- [ ] **Step 1: Write failing test**

```typescript
// assertDefinitionRefsResolve(xml, bswmds) collects every DEFINITION-REF
// text in the generated ARXML and returns the list that does not match
// any module/container/parameter path in the provided BSWMD map.
it('returns [] for a fully-resolved extract', () => {
  /* ... */
});
it('returns the unresolved refs for a hand-broken document', () => {
  /* ... */
});
```

- [ ] **Step 2: Implement** — parse with the project's existing ARXML parser (or a minimal regex over `DEFINITION-REF` bodies, if the parser's element model makes this simpler), build a `Set` of all known paths from each `BswModuleDef` (`path`, every container `path`, every param/reference `path`, recursively), diff.

- [ ] **Step 3: Wire into the real-fixture tests** — after generating from `Demo_Cdd.odx-d` with the workspace-style BSWMD fixtures threaded, assert the guard returns `[]`.

- [ ] **Step 4: Run tests + commit**

```bash
git add src/core/bridge/assertDefinitionRefsResolve.ts src/core/bridge/__tests__/assertDefinitionRefsResolve.test.ts src/main/ipc/__tests__/
git commit -m "test(bridge): add post-generation definition-ref resolution guard"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full bridge + IPC suites**

Run: `node node_modules\vitest\vitest.mjs run src/core/bridge/ src/main/ipc/ --reporter=dot`
Expected: ALL PASS

- [ ] **Step 2: TypeScript checks** (both tsconfigs) — Expected: 0 errors

- [ ] **Step 3: Manual smoke test (user-driven)**

1. Import a DBC file → generate COM config → verify refs resolve in the ARXML tree (zero "找不到BSWMD ref" warnings)
2. Import an ODX-D file → generate Diagnostic Extract → verify Dem/Dcm trees show containers with numeric identifiers (regression-check the prerequisite plan's acceptance)
3. Verify both flows with the workspace BSWMDs and confirm resolved refs match the BSWMD tree exactly
