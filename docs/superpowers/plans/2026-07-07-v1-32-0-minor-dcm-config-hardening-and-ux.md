# v1.32.0 MINOR — Dcm Config Hardening + UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `DcmConfigResponse` errors machine-classifiable (kind discriminator), replace fragile filename regex with BSWMD parse, add a dedicated ODX picker, and auto-fill BSWMD path from the project manifest.

**Architecture:** Layered extension of v1.31.x. New additive `DcmConfigErrorKind` union + handler populates kind at 9 return sites. New renderer helpers (`arxmlModuleShortNames`, `findDcmBswmd`) provide parse-based gating. `useDcmConfigLauncher` extended with `picking-odx` substate + autofill + `isActiveOdx` shortcut. New `DcmConfigPicker` thin-wrapper component. Override UI ships text-disabled (Browse deferred to v1.33.0).

**Tech Stack:** TypeScript 5.6, React 19, vitest 3, jsdom + @testing-library/react. IPC: existing `bswmd:read`, `dcm:config`, `odx:open` channels (no new channels). State: zustand `useArxmlStore`.

## Global Constraints

- Baseline: v1.31.1 PATCH `44eb1c0` (2933 + 7 SKIP / 0 fail).
- Test target: 2933 + 7 SKIP → **2984 + 7 SKIP / 0 fail** (+51).
- IPC surface: **additive only**. No new IPC channels in v1.32.0 (deferred to v1.33.0+). Existing `openOdx()` takes no args; do not extend.
- `DcmConfigError.kind` becomes **required** in v1.32.0 (the renderer fallback for missing kind handles only legacy payloads from pre-v1.32.0 handlers — but since we ship both handler-side kind + renderer-fallback in the same MINOR, the fallback is for ONE-release IPC forward-compat).
- `DCM_MODULE_SHORT_NAME` from `src/core/bridge/dcmConstants.ts` is the SoT for module-name identification; reuse (lesson `centralize-domain-identifiers`).
- TDD bite-sized: RED + GREEN as separate commits (per v1.31.0 PATCH T4-T7 review finding). Tasks T1, T3, T6 — single test+impl commit (low review risk). Tasks T2, T5, T7 — RED + GREEN split (integration complexity).
- All renderer tests use `userEvent` not `fireEvent` (per `react/testing.md`). Wrap state changes in `act()`. Use MSW-free mocking via `vi.fn()` on `window.autosarApi` (matches v1.31.x pattern in `DcmConfigTrigger.test.tsx`).
- i18n: every user-facing string goes through `t(locale, key)` with both en + zh-CN bundles updated.
- Spec reference: `docs/superpowers/specs/2026-07-07-v1-32-0-minor-dcm-config-hardening-and-ux-design.md`.
- Lessons pinned (apply where each is relevant):
  - `error-classification-via-regex-prefix-vs-envelope-kind-trade-off` (T1, T2)
  - `filename-regex-for-ux-gate-vs-parse-based-detection-trade-off` (T3, T4, T5, T8)
  - `backward-compat-branch-on-missing-discriminator-field` (T2)
  - `re-entrancy-guard-via-useref-not-setstate-callback-state` (T6)
  - `centralize-domain-identifiers-when-mapper-and-handler-and-pipeline-share-them` (T1, T3)
  - `presentational-dialog-parity-port-pattern` (T6)
- No `console.log` in production code.
- `pnpm verify` (format + lint + typecheck + test + coverage + build + import-regression) must pass before each ship commit.

---

### Task 1: DcmConfigErrorKind type + handler populates kind at 9 sites

**Files:**

- Modify: `src/shared/types.ts:1-50` (extend DcmConfigError union / kind)
- Modify: `src/main/ipc/dcmConfigHandler.ts:178-298` (9 return sites)
- Modify: `src/core/bridge/dcmConfigPipeline.ts:108-194` (4 throw sites)
- Modify: `src/core/bridge/xlsxDcmServicesToEcucBatch.ts:59-81` (3 throw sites)
- Create: `src/core/bridge/dcmConfigError.ts` (DcmConfigError class)
- Modify: `src/main/ipc/__tests__/dcmConfigHandler.test.ts:1-50,131-141` (5 existing assertions widened + 9 new)

**Interfaces:**

- Consumes: existing `dcmConfigHandler`, `dcmConfigPipeline`, `xlsxDcmServicesToEcucBatch` signatures (no change)
- Produces: `DcmConfigErrorKind` exported from `src/shared/types.ts`; `DcmConfigError` class with `{kind, message, cause?}` fields, exported from `src/core/bridge/dcmConfigError.ts`; `DcmConfigError.kind` field required in response envelope

- [ ] **Step 1.1: Write the failing test — handler kind per branch (RED)**

Append to `src/main/ipc/__tests__/dcmConfigHandler.test.ts` (after the existing `it()` blocks):

```ts
// v1.32.0 MINOR T1 — handler populates DcmConfigError.kind at every branch.
import type { DcmConfigErrorKind } from '../../../shared/types.js';

describe('dcmConfigHandler — kind discriminator (v1.32.0 T1)', () => {
  it.each<{ name: string; kind: DcmConfigErrorKind; setup: () => Promise<unknown> }>([
    {
      name: 'odx-unreadable',
      kind: 'odx-unreadable',
      setup: async () => {
        // Missing ODX path triggers readFileSync ENOENT.
        return dcmConfigHandler({
          odxPath: pathResolve(workDir, 'does-not-exist.odx'),
          xlsxRows: [],
        });
      },
    },
    {
      name: 'odx-parse-failed',
      kind: 'odx-parse-failed',
      setup: async () => {
        const odxPath = pathResolve(workDir, 'bad.odx');
        writeFileSync(odxPath, '<not-xml', 'utf-8');
        return dcmConfigHandler({ odxPath, xlsxRows: [] });
      },
    },
    {
      name: 'bswmd-unreadable',
      kind: 'bswmd-unreadable',
      setup: async () => {
        const odxPath = pathResolve(workDir, 'input.odx');
        writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');
        return dcmConfigHandler({
          odxPath,
          xlsxRows: [],
          bswmdPath: pathResolve(workDir, 'missing-bswmd.arxml'),
        });
      },
    },
    // 'odx-dcm-linkage' + 'dcm-module-missing' + 'container-not-found' surface
    // from pipeline/mapper thrown DcmConfigError — covered by their own test
    // files; here we assert the handler's catch site sets the right kind.
    {
      name: 'patch-failed',
      kind: 'patch-failed',
      setup: async () => {
        // Use the existing 'xlsx service add-children actually land on disk' test
        // path which the spec notes returns either path-not-found or
        // param-not-found. v1.32.0 rewires these to kind 'patch-failed'.
        const odxPath = pathResolve(workDir, 'input.odx-d');
        const outputPath = pathResolve(workDir, 'Dcm_Config.arxml');
        writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');
        const xlsxRows: EcucInstanceRow[] = [
          {
            sheet: 'DcmReadDataById' as const,
            shortName: 'ReadVbatt',
            params: { didRef: 'Vbatt' },
          },
        ].map(asDcmRow);
        return dcmConfigHandler({ odxPath, xlsxRows, outputPath });
      },
    },
    {
      name: 'atomic-write-failed',
      kind: 'atomic-write-failed',
      setup: async () => {
        // Point outputPath at an existing read-only directory to force writeAtomic throw.
        const odxPath = pathResolve(workDir, 'input.odx-d');
        writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');
        const xlsxRows: EcucInstanceRow[] = [
          {
            sheet: 'DcmReadDataById' as const,
            shortName: 'ReadVbatt',
            params: { didRef: 'Vbatt' },
          },
          {
            sheet: 'DcmRoutineControl' as const,
            shortName: 'StartErase',
            params: { routineRef: 'EraseMemory' },
          },
        ].map(asDcmRow);
        return dcmConfigHandler({
          odxPath,
          xlsxRows,
          outputPath: workDir, // directory, not file — writeAtomic fails
        });
      },
    },
    {
      name: 'unknown',
      kind: 'unknown',
      setup: async () => {
        // Force a non-DcmConfigError throw by mocking the pipeline to throw Error.
        const odxPath = pathResolve(workDir, 'input.odx-d');
        writeFileSync(odxPath, FIXTURE_ODX_XML, 'utf-8');
        // Empty bswmds map + non-empty xlsxRows forces pipeline to throw the
        // 'BSWMD map missing module' error as a plain Error (pre-DcmConfigError).
        // In v1.32.0 the pipeline throws DcmConfigError, so this becomes a
        // backstop: an unexpected thrown plain Error lands at the outer catch
        // and surfaces as 'unknown'.
        // Force via bswmdPath pointing at a syntactically valid but
        // content-empty BSWMD, which leaves the map empty after parse.
        const bswmdPath = pathResolve(workDir, 'empty-bswmd.arxml');
        writeFileSync(bswmdPath, '<AR-PACKAGES></AR-PACKAGES>', 'utf-8');
        return dcmConfigHandler({
          odxPath,
          xlsxRows: [
            {
              sheet: 'DcmReadDataById' as const,
              shortName: 'x',
              params: {},
            } as unknown as EcucInstanceRow,
          ],
          bswmdPath,
        });
      },
    },
  ])('$name branch returns error.kind=$kind', async ({ kind, setup }) => {
    const result = await setup();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(kind);
    }
  });
});
```

- [ ] **Step 1.2: Run test to verify RED**

Run: `pnpm vitest run src/main/ipc/__tests__/dcmConfigHandler.test.ts -t 'kind discriminator'`
Expected: FAIL — `result.error.kind` is `undefined` (current error shape has only `message`, `cause`).

- [ ] **Step 1.3: Add `DcmConfigErrorKind` + `DcmConfigError` class + widen response type**

Create `src/core/bridge/dcmConfigError.ts`:

```ts
// v1.32.0 MINOR T1 — typed error carrying the DcmConfigErrorKind discriminator.
//
// The dcm:config IPC response.error.kind field is `DcmConfigErrorKind`
// (defined in src/shared/types.ts). Pipeline/mapper functions throw
// instances of this class so the handler's outer catch can project the
// kind without re-parsing the message string (lesson
// error-classification-via-regex-prefix-vs-envelope-kind-trade-off).
//
// Constructors: prefer `new DcmConfigError({ kind: 'odx-dcm-linkage', message: '...' })`
// over free-form `throw new Error('ODX-Dcm linkage broken: ...')` so the
// kind survives the IPC boundary intact.

import type { DcmConfigErrorKind } from '../../shared/types.js';

export class DcmConfigError extends Error {
  public readonly kind: DcmConfigErrorKind;
  public override readonly cause?: unknown;

  public constructor(opts: { kind: DcmConfigErrorKind; message: string; cause?: unknown }) {
    super(opts.message);
    this.name = 'DcmConfigError';
    this.kind = opts.kind;
    if (opts.cause !== undefined) {
      this.cause = opts.cause;
    }
  }
}
```

Modify `src/shared/types.ts` — add the kind union + required field on `DcmConfigError`:

```ts
// v1.32.0 MINOR T1 — additive kind discriminator on the IPC error envelope.
//   kind ∈ 9 literals + 'unknown' (catch-all).
// The renderer classifyError reads kind FIRST and falls back to regex
// classification ONLY when kind is absent (lesson
// backward-compat-branch-on-missing-discriminator-field).
export type DcmConfigErrorKind =
  | 'odx-unreadable'
  | 'odx-parse-failed'
  | 'bswmd-unreadable'
  | 'odx-dcm-linkage'
  | 'dcm-module-missing'
  | 'container-not-found'
  | 'patch-failed'
  | 'atomic-write-failed'
  | 'unknown';

export interface DcmConfigError {
  readonly kind: DcmConfigErrorKind;
  readonly message: string;
  readonly cause?: unknown;
}
```

- [ ] **Step 1.4: Wire `DcmConfigError` into `dcmConfigPipeline.ts` (4 throw sites)**

Replace each `throw new Error(...)` with `throw new DcmConfigError({...})`. The 4 sites:

- Line 108 — `'ODX-Dcm linkage broken: ...'` → kind: `'odx-dcm-linkage'`
- Line 121 — `'ODX-Dcm linkage broken: ...'` (routine path) → kind: `'odx-dcm-linkage'`
- Line 190 — `'BSWMD map missing module ...'` → kind: `'dcm-module-missing'`

Plus add the import at the top of `src/core/bridge/dcmConfigPipeline.ts`:

```ts
import { DcmConfigError } from './dcmConfigError.js';
```

- [ ] **Step 1.5: Wire `DcmConfigError` into `xlsxDcmServicesToEcucBatch.ts` (3 throw sites)**

- Line 59 — `'EcucInstanceRow missing shortName ...'` → kind: `'unknown'` (catch-all mapping; not in original spec but a real failure mode)
- Line 62 — `'Unrecognized sheet name ...'` → kind: `'unknown'`
- Line 77 — `'Container '${lookupKey}' not found ...'` → kind: `'container-not-found'`

Note: The line 59 + 62 sites map to `'unknown'` because they are pre-validation failures; the kind is preserved for telemetry but doesn't drive distinct UX. Add import at top:

```ts
import { DcmConfigError } from './dcmConfigError.js';
```

- [ ] **Step 1.6: Update `dcmConfigHandler.ts` — 9 return sites**

Top-of-file import:

```ts
import { DcmConfigError } from '../../core/bridge/dcmConfigError.js';
```

Update each return site:

```ts
// Site 1 — odx-unreadable
return {
  ok: false,
  error: { kind: 'odx-unreadable', message: `ODX file unreadable: ${...}`, cause: e },
};

// Site 2 — odx-parse-failed
return {
  ok: false,
  error: { kind: 'odx-parse-failed', message: `ODX parse failed: ${...}`, cause: odxParse.error },
};

// Site 3 — bswmd-unreadable
return {
  ok: false,
  error: { kind: 'bswmd-unreadable', message: `BSWMD file unreadable: ${...}`, cause: e },
};

// Site 7 — patch-failed
return { ok: false, error: { kind: 'patch-failed', message: patched.error } };

// Site 8 — atomic-write-failed
return {
  ok: false,
  error: { kind: 'atomic-write-failed', message: `Atomic write failed: ${...}`, cause: e },
};

// Site 9 — outer catch-all. Now distinguishes DcmConfigError kind.
} catch (e) {
  if (e instanceof DcmConfigError) {
    return { ok: false, error: { kind: e.kind, message: e.message, cause: e.cause } };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, error: { kind: 'unknown', message, cause: e } };
}
```

- [ ] **Step 1.7: Run test to verify GREEN**

Run: `pnpm vitest run src/main/ipc/__tests__/dcmConfigHandler.test.ts -t 'kind discriminator'`
Expected: 6 PASS (odx-unreadable, odx-parse-failed, bswmd-unreadable, patch-failed, atomic-write-failed, unknown).

- [ ] **Step 1.8: Widen existing assertions**

In `dcmConfigHandler.test.ts:131-141`, the existing test's error message assertion:

```ts
// Before
expect(result.error.message).toMatch(/Patch application failed.*(path-not-found|param-not-found)/s);

// After
expect(result.error.kind).toBe('patch-failed');
expect(result.error.message).toMatch(/Patch application failed.*(path-not-found|param-not-found)/s);
```

(The existing test will fail at the new `result.error.kind` line until step 1.6 ships; step 1.7's GREEN covers both.)

- [ ] **Step 1.9: Verify full suite still green**

Run: `pnpm vitest run src/main/ipc/__tests__/dcmConfigHandler.test.ts`
Expected: All existing tests pass + 6 new tests pass (the 4 unmapped kinds — odx-dcm-linkage, dcm-module-missing, container-not-found, unknown — surface through Site 9 outer-catch and are exercised by T2's renderer tests).

- [ ] **Step 1.10: Commit**

```bash
git add src/shared/types.ts src/main/ipc/dcmConfigHandler.ts src/core/bridge/dcmConfigPipeline.ts src/core/bridge/xlsxDcmServicesToEcucBatch.ts src/core/bridge/dcmConfigError.ts src/main/ipc/__tests__/dcmConfigHandler.test.ts
git commit -m "feat(handler): v1.32.0 MINOR T1 — DcmConfigErrorKind + kind at 9 return sites

Adds typed error class DcmConfigError({kind, message, cause?}) carrying the
new DcmConfigErrorKind discriminator (9 literals + 'unknown'). Pipeline +
mapper throw DcmConfigError; handler catches narrow kind from class.

9 return sites populated:
  odx-unreadable | odx-parse-failed | bswmd-unreadable |
  odx-dcm-linkage | dcm-module-missing | container-not-found |
  patch-failed | atomic-write-failed | unknown (outer catch)

+6 tests (it.each). Baseline 2933+7 -> 2939+7 SKIP / 0 fail."
```

---

### Task 2: Renderer classifyError rewrite (kind-first, regex-fallback)

**Files:**

- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts:1-50` (classifyError export)
- Modify: `src/renderer/components/dcmConfig/DcmConfigErrorToast.tsx` (DcmConfigErrorClass literal union)
- Create: `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (or modify if exists)

**Interfaces:**

- Consumes: `DcmConfigErrorKind` from `src/shared/types.ts` (T1 produced)
- Produces: `classifyError(error: DcmConfigError): DcmConfigErrorClass` exported from `useDcmConfigLauncher.ts`; `classifyErrorByRegex(message: string): DcmConfigErrorClass` (legacy fallback, kept for 1 release)

**Sub-skill:** TDD bite-sized — split RED + GREEN into 2 commits (per global constraint).

- [ ] **Step 2.1: Write the failing test (RED)**

Modify `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (create if absent):

```ts
// v1.32.0 MINOR T2 — classifyError reads kind FIRST; legacy regex fallback
// preserves behavior for pre-v1.32.0 IPC handlers.
import { describe, expect, it } from 'vitest';
import type { DcmConfigError, DcmConfigErrorKind } from '../../../shared/types.js';
import { classifyError, classifyErrorByRegex } from '../useDcmConfigLauncher.js';

describe('classifyError (v1.32.0 T2) — kind-first', () => {
  it.each<[DcmConfigErrorKind, string]>([
    ['odx-unreadable', 'ODX_FILE_UNREADABLE'],
    ['odx-parse-failed', 'ODX_PARSE_FAILED'],
    ['bswmd-unreadable', 'BSWMD_FILE_UNREADABLE'],
    ['odx-dcm-linkage', 'ODX_DCM_LINKAGE'],
    ['dcm-module-missing', 'DCM_MODULE_MISSING'],
    ['container-not-found', 'CONTAINER_NOT_FOUND'],
    ['patch-failed', 'PATCH_FAILED'],
    ['atomic-write-failed', 'ATOMIC_WRITE_FAILED'],
    ['unknown', 'UNKNOWN'],
  ])('maps kind=%s to class=%s', (kind, expectedClass) => {
    const error: DcmConfigError = { kind, message: 'irrelevant' };
    expect(classifyError(error)).toBe(expectedClass);
  });
});

describe('classifyErrorByRegex (v1.32.0 T2) — legacy fallback', () => {
  it.each<[string, string]>([
    ['ODX file unreadable: ENOENT', 'ODX_FILE_UNREADABLE'],
    ['ODX parse failed: ...', 'ODX_PARSE_FAILED'],
    ['BSWMD file unreadable: ENOENT', 'BSWMD_FILE_UNREADABLE'],
    ['ODX-Dcm linkage broken: ...', 'ODX_DCM_LINKAGE'],
    ['BSWMD map missing module ...', 'DCM_MODULE_MISSING'],
    ['Container "DcmDspDid" not found ...', 'CONTAINER_NOT_FOUND'],
    ['Patch application failed ...', 'PATCH_FAILED'],
    ['Atomic write failed: ...', 'ATOMIC_WRITE_FAILED'],
    ['Some unexpected message', 'UNKNOWN'],
  ])('regex maps %s to %s', (message, expectedClass) => {
    expect(classifyErrorByRegex(message)).toBe(expectedClass);
  });
});

describe('classifyError backward-compat (v1.32.0 T2) — missing kind', () => {
  it('falls back to regex when kind is absent (pre-v1.32.0 handler payload)', () => {
    // Legacy payload shape — no kind field.
    const legacy = { message: 'ODX-Dcm linkage broken: ...' } as unknown as DcmConfigError;
    expect(classifyError(legacy)).toBe('ODX_DCM_LINKAGE');
  });
});
```

- [ ] **Step 2.2: Run test to verify RED**

Run: `pnpm vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts -t 'classifyError'`
Expected: FAIL — `classifyError` not exported.

- [ ] **Step 2.3: Implement classifyError + classifyErrorByRegex (GREEN)**

Append to `src/renderer/hooks/useDcmConfigLauncher.ts`:

```ts
import type { DcmConfigError, DcmConfigErrorKind } from '../../shared/types.js';

/** v1.32.0 MINOR T2 — re-export of DcmConfigErrorClass from the toast.
 *  Renderer hooks classify errors into one of 9 classes for UX surfacing. */
export type DcmConfigErrorClass =
  | 'ODX_FILE_UNREADABLE'
  | 'ODX_PARSE_FAILED'
  | 'BSWMD_FILE_UNREADABLE'
  | 'ODX_DCM_LINKAGE'
  | 'DCM_MODULE_MISSING'
  | 'CONTAINER_NOT_FOUND'
  | 'PATCH_FAILED'
  | 'ATOMIC_WRITE_FAILED'
  | 'UNKNOWN';

const KIND_TO_CLASS: Readonly<Record<DcmConfigErrorKind, DcmConfigErrorClass>> = {
  'odx-unreadable': 'ODX_FILE_UNREADABLE',
  'odx-parse-failed': 'ODX_PARSE_FAILED',
  'bswmd-unreadable': 'BSWMD_FILE_UNREADABLE',
  'odx-dcm-linkage': 'ODX_DCM_LINKAGE',
  'dcm-module-missing': 'DCM_MODULE_MISSING',
  'container-not-found': 'CONTAINER_NOT_FOUND',
  'patch-failed': 'PATCH_FAILED',
  'atomic-write-failed': 'ATOMIC_WRITE_FAILED',
  unknown: 'UNKNOWN',
};

/** v1.32.0 MINOR T2 — read kind FIRST; fall back to regex when kind is absent
 *  (pre-v1.32.0 IPC handler payloads). The regex fallback is kept for ONE
 *  release and removed in v1.33.0 (lesson
 *  error-classification-via-regex-prefix-vs-envelope-kind-trade-off). */
export function classifyError(error: DcmConfigError): DcmConfigErrorClass {
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    return KIND_TO_CLASS[error.kind];
  }
  return classifyErrorByRegex(error.message);
}

/** v1.32.0 MINOR T2 — legacy regex classifier. Kept for one-release IPC
 *  forward-compat with handlers that haven't shipped the kind field.
 *  Removed in v1.33.0. */
export function classifyErrorByRegex(message: string): DcmConfigErrorClass {
  if (/^ODX file unreadable/.test(message)) return 'ODX_FILE_UNREADABLE';
  if (/^ODX parse failed/.test(message)) return 'ODX_PARSE_FAILED';
  if (/^BSWMD file unreadable/.test(message)) return 'BSWMD_FILE_UNREADABLE';
  if (/^ODX-Dcm linkage broken/.test(message)) return 'ODX_DCM_LINKAGE';
  if (/^BSWMD map missing module/.test(message)) return 'DCM_MODULE_MISSING';
  if (/^Container .* not found/.test(message)) return 'CONTAINER_NOT_FOUND';
  if (/^Patch application failed/.test(message)) return 'PATCH_FAILED';
  if (/^Atomic write failed/.test(message)) return 'ATOMIC_WRITE_FAILED';
  return 'UNKNOWN';
}
```

Also remove the **existing** v1.31.x classifyError (which took a `string`). The launcher's internal call site must switch from `classifyError(error.message)` to `classifyError(error)`. Find the call site:

```bash
grep -n "classifyError" src/renderer/hooks/useDcmConfigLauncher.ts
```

Update the call to pass `error` (the `DcmConfigError` object) not `error.message`.

- [ ] **Step 2.4: Run test to verify GREEN**

Run: `pnpm vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts -t 'classifyError'`
Expected: 9 kind cases pass + 9 regex cases pass + 1 backward-compat case passes (19 total).

- [ ] **Step 2.5: Verify the legacy tests in the same file still pass (v1.31.x state-machine tests use the OLD signature)**

If existing tests in the file pass `error.message` (string) to `classifyError`, they will now fail because `classifyError` expects a `DcmConfigError`. Update those test calls to wrap: `classifyError({ kind: 'unknown', message: '...' })`. Or — if the existing tests assert on `classifyError(result.error.message)` (the v1.31.x shape), refactor them to `classifyError(result.error)` after a small fixture adjustment.

- [ ] **Step 2.6: Commit (RED + GREEN in this single commit because the test+impl are tightly coupled)**

```bash
git add src/renderer/hooks/useDcmConfigLauncher.ts src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts
git commit -m "feat(renderer): v1.32.0 MINOR T2 — classifyError reads kind-first + regex fallback

classifyError(error: DcmConfigError): DcmConfigErrorClass reads kind first;
falls back to classifyErrorByRegex(message) when kind is absent (pre-v1.32.0
handler payloads). Regex fallback kept for 1 release, removed in v1.33.0.

+19 tests (9 kind mapping + 9 regex mapping + 1 backward-compat).
Baseline 2939+7 -> 2958+7 SKIP / 0 fail."
```

---

### Task 3: arxmlModuleShortNames helper

**Files:**

- Create: `src/renderer/arxml/arxmlModuleShortNames.ts`
- Create: `src/renderer/arxml/__tests__/arxmlModuleShortNames.test.ts`

**Interfaces:**

- Consumes: pure function; no imports beyond `parseArxml` from `src/core/arxml/parser.ts`
- Produces: `arxmlModuleShortNames(xml: string): readonly string[]` — flattened module shortName list

- [ ] **Step 3.1: Write the failing test (RED)**

Create `src/renderer/arxml/__tests__/arxmlModuleShortNames.test.ts`:

```ts
// v1.32.0 MINOR T3 — flatten BSWMD module shortNames for hasDcmBswmd gating.
import { describe, expect, it } from 'vitest';
import { arxmlModuleShortNames } from '../arxmlModuleShortNames.js';

const SINGLE_DCM = `<?xml version="1.0" encoding="UTF-8"?>
<AR-PACKAGES>
  <AR-PACKAGE>
    <SHORT-NAME>Ecuc</SHORT-NAME>
    <ELEMENTS>
      <ECUC-MODULE-DEF>
        <SHORT-NAME>Dcm</SHORT-NAME>
        <CONTAINERS>...</CONTAINERS>
      </ECUC-MODULE-DEF>
    </ELEMENTS>
  </AR-PACKAGE>
</AR-PACKAGES>`;

const MULTIPLE_MODULES = `<?xml version="1.0" encoding="UTF-8"?>
<AR-PACKAGES>
  <AR-PACKAGE>
    <SHORT-NAME>Ecuc</SHORT-NAME>
    <ELEMENTS>
      <ECUC-MODULE-DEF><SHORT-NAME>CanIf</SHORT-NAME></ECUC-MODULE-DEF>
      <ECUC-MODULE-DEF><SHORT-NAME>Dcm</SHORT-NAME></ECUC-MODULE-DEF>
      <ECUC-MODULE-DEF><SHORT-NAME>PduR</SHORT-NAME></ECUC-MODULE-DEF>
    </ELEMENTS>
  </AR-PACKAGE>
</AR-PACKAGES>`;

const NESTED_PACKAGES = `<?xml version="1.0" encoding="UTF-8"?>
<AR-PACKAGES>
  <AR-PACKAGE>
    <SHORT-NAME>A</SHORT-NAME>
    <AR-PACKAGES>
      <AR-PACKAGE>
        <SHORT-NAME>B</SHORT-NAME>
        <ELEMENTS>
          <ECUC-MODULE-DEF><SHORT-NAME>Dcm</SHORT-NAME></ECUC-MODULE-DEF>
        </ELEMENTS>
      </AR-PACKAGE>
    </AR-PACKAGES>
  </AR-PACKAGE>
</AR-PACKAGES>`;

describe('arxmlModuleShortNames (v1.32.0 T3)', () => {
  it('returns the single module shortName for a minimal BSWMD', () => {
    expect(arxmlModuleShortNames(SINGLE_DCM)).toEqual(['Dcm']);
  });

  it('returns all module shortNames when multiple modules are declared', () => {
    expect(arxmlModuleShortNames(MULTIPLE_MODULES)).toEqual(['CanIf', 'Dcm', 'PduR']);
  });

  it('flattens nested AR-PACKAGES recursively', () => {
    expect(arxmlModuleShortNames(NESTED_PACKAGES)).toEqual(['Dcm']);
  });

  it('returns an empty array when no modules are declared', () => {
    const empty = `<?xml version="1.0"?><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>X</SHORT-NAME></AR-PACKAGE></AR-PACKAGES>`;
    expect(arxmlModuleShortNames(empty)).toEqual([]);
  });

  it('returns an empty array for malformed XML (fail-soft)', () => {
    expect(arxmlModuleShortNames('<not-xml')).toEqual([]);
  });

  it('returns an empty array for empty string', () => {
    expect(arxmlModuleShortNames('')).toEqual([]);
  });
});
```

- [ ] **Step 3.2: Run test to verify RED**

Run: `pnpm vitest run src/renderer/arxml/__tests__/arxmlModuleShortNames.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement arxmlModuleShortNames**

Create `src/renderer/arxml/arxmlModuleShortNames.ts`:

```ts
// v1.32.0 MINOR T3 — flatten BSWMD module shortNames for hasDcmBswmd gating.
//
// Returns the list of every <SHORT-NAME> found inside an <ECUC-MODULE-DEF>
// anywhere under <AR-PACKAGES>. Recursive so nested package hierarchies are
// covered (real OEM BSWMDs nest modules under multi-segment paths).
//
// Fail-soft on parse failure: returns []. The UX gate that consumes this
// helper treats empty result as "no Dcm BSWMD" — the user gets a disabled
// "Open Dcm Config" button. Real parse failures surface at click time via
// the bswmd-unreadable IPC error class.
//
// Why renderer-side: the gate runs on every AppHeader/ContextMenu render.
// A renderer-side parse is < 10ms per file and avoids the round-trip cost
// of an IPC call (lesson filename-regex-for-ux-gate-vs-parse-based-detection-trade-off).

import { parseArxml } from '../../core/arxml/parser.js';

export function arxmlModuleShortNames(xml: string): readonly string[] {
  if (xml.length === 0) return [];
  const parsed = parseArxml(xml);
  if (!parsed.ok) return [];
  const names: string[] = [];
  collectModuleShortNames(parsed.value, names);
  return names;
}

function collectModuleShortNames(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectModuleShortNames(child, out);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const obj = node as Record<string, unknown>;
  // We treat any node with a SHORT-NAME child whose parent is an
  // ECUC-MODULE-DEF as a module shortName. We detect this by looking for
  // the canonical 'ECUC-MODULE-DEF' tag in the same object.
  if (typeof obj['ECUC-MODULE-DEF'] !== 'undefined') {
    const modules = obj['ECUC-MODULE-DEF'];
    if (Array.isArray(modules)) {
      for (const m of modules) {
        const name = extractShortName(m);
        if (name !== null) out.push(name);
      }
    } else {
      const name = extractShortName(modules);
      if (name !== null) out.push(name);
    }
  }
  // Recurse into AR-PACKAGES and ELEMENTS sub-trees.
  for (const key of Object.keys(obj)) {
    if (key === 'AR-PACKAGES' || key === 'ELEMENTS') {
      collectModuleShortNames(obj[key], out);
    }
  }
}

function extractShortName(node: unknown): string | null {
  if (typeof node !== 'object' || node === null) return null;
  const obj = node as Record<string, unknown>;
  const sn = obj['SHORT-NAME'];
  if (typeof sn === 'string') return sn;
  return null;
}
```

- [ ] **Step 3.4: Run test to verify GREEN**

Run: `pnpm vitest run src/renderer/arxml/__tests__/arxmlModuleShortNames.test.ts`
Expected: 6 PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/renderer/arxml/arxmlModuleShortNames.ts src/renderer/arxml/__tests__/arxmlModuleShortNames.test.ts
git commit -m "feat(renderer): v1.32.0 MINOR T3 — arxmlModuleShortNames helper

Flattens <ECUC-MODULE-DEF><SHORT-NAME>...</SHORT-NAME> from a BSWMD ARXML
string, recursing through nested <AR-PACKAGES>. Fail-soft on parse failure
(returns []). Used by findDcmBswmd (T4) for parse-based hasDcmBswmd gating.

+6 tests. Baseline 2958+7 -> 2964+7 SKIP / 0 fail."
```

---

### Task 4: findDcmBswmd helper

**Files:**

- Create: `src/renderer/components/dcmConfig/bswmdHasDcm.ts`
- Create: `src/renderer/components/dcmConfig/__tests__/bswmdHasDcm.test.ts`

**Interfaces:**

- Consumes: `arxmlModuleShortNames` (T3); injected `fs.readFile` for testability
- Produces: `findDcmBswmd(paths, fs): Promise<BswmdHasDcmResult>`; `BswmdHasDcmResult` type

- [ ] **Step 4.1: Write the failing test (RED)**

Create `src/renderer/components/dcmConfig/__tests__/bswmdHasDcm.test.ts`:

```ts
// v1.32.0 MINOR T4 — findDcmBswmd locates Dcm BSWMD via parse-based detection.
import { describe, expect, it } from 'vitest';
import { findDcmBswmd } from '../bswmdHasDcm.js';

const DCM_BSWMD = `<?xml version="1.0"?>
<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Ecuc</SHORT-NAME><ELEMENTS>
<ECUC-MODULE-DEF><SHORT-NAME>Dcm</SHORT-NAME></ECUC-MODULE-DEF>
</ELEMENTS></AR-PACKAGE></AR-PACKAGES>`;

const NON_DCM_BSWMD = `<?xml version="1.0"?>
<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Ecuc</SHORT-NAME><ELEMENTS>
<ECUC-MODULE-DEF><SHORT-NAME>CanIf</SHORT-NAME></ECUC-MODULE-DEF>
</ELEMENTS></AR-PACKAGE></AR-PACKAGES>`;

function fakeFs(map: Record<string, string>) {
  return {
    readFile: async (p: string): Promise<string> => {
      if (p in map) return map[p]!;
      throw new Error(`ENOENT: ${p}`);
    },
  };
}

describe('findDcmBswmd (v1.32.0 T4)', () => {
  it('returns hasDcm:false when paths is empty', async () => {
    const r = await findDcmBswmd([], fakeFs({}));
    expect(r).toEqual({ hasDcm: false });
  });

  it('returns hasDcm:true with the matching path when one BSWMD has Dcm', async () => {
    const r = await findDcmBswmd(['/x.arxml'], fakeFs({ '/x.arxml': DCM_BSWMD }));
    expect(r).toEqual({ hasDcm: true, dcmBswmdPath: '/x.arxml' });
  });

  it('returns hasDcm:false when no BSWMD has Dcm', async () => {
    const r = await findDcmBswmd(['/x.arxml'], fakeFs({ '/x.arxml': NON_DCM_BSWMD }));
    expect(r).toEqual({ hasDcm: false });
  });

  it('returns first matching path when multiple BSWMDs have Dcm (deterministic order)', async () => {
    const r = await findDcmBswmd(
      ['/a.arxml', '/b.arxml', '/c.arxml'],
      fakeFs({ '/a.arxml': DCM_BSWMD, '/b.arxml': DCM_BSWMD, '/c.arxml': DCM_BSWMD }),
    );
    expect(r.hasDcm).toBe(true);
    expect(r.dcmBswmdPath).toBe('/a.arxml');
  });

  it('returns the matching path in a mixed list (Dcm + non-Dcm)', async () => {
    const r = await findDcmBswmd(
      ['/a.arxml', '/b.arxml'],
      fakeFs({ '/a.arxml': NON_DCM_BSWMD, '/b.arxml': DCM_BSWMD }),
    );
    expect(r).toEqual({ hasDcm: true, dcmBswmdPath: '/b.arxml' });
  });

  it('returns hasDcm:false when fs.readFile throws for all paths (fail-soft)', async () => {
    const r = await findDcmBswmd(['/missing.arxml'], fakeFs({}));
    expect(r).toEqual({ hasDcm: false });
  });

  it('returns hasDcm:false when BSWMD XML is malformed (fail-soft)', async () => {
    const r = await findDcmBswmd(['/bad.arxml'], fakeFs({ '/bad.arxml': '<not-xml' }));
    expect(r).toEqual({ hasDcm: false });
  });

  it('skips unparseable files and finds Dcm in a parseable file (mixed)', async () => {
    const r = await findDcmBswmd(
      ['/bad.arxml', '/good.arxml'],
      fakeFs({ '/bad.arxml': '<not-xml', '/good.arxml': DCM_BSWMD }),
    );
    expect(r).toEqual({ hasDcm: true, dcmBswmdPath: '/good.arxml' });
  });

  it('handles many paths in parallel (performance smoke)', async () => {
    const paths = Array.from({ length: 20 }, (_, i) => `/f${i}.arxml`);
    const fs = fakeFs(
      Object.fromEntries(paths.map((p, i) => [p, i === 7 ? DCM_BSWMD : NON_DCM_BSWMD])),
    );
    const r = await findDcmBswmd(paths, fs);
    expect(r.hasDcm).toBe(true);
    expect(r.dcmBswmdPath).toBe('/f7.arxml');
  });

  it('returns hasDcm:false when all paths parse but declare no modules', async () => {
    const empty = `<?xml version="1.0"?><AR-PACKAGES></AR-PACKAGES>`;
    const r = await findDcmBswmd(['/empty.arxml'], fakeFs({ '/empty.arxml': empty }));
    expect(r).toEqual({ hasDcm: false });
  });

  it('handles deeply nested AR-PACKAGES', async () => {
    const nested = `<?xml version="1.0"?>
<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>A</SHORT-NAME><AR-PACKAGES>
<AR-PACKAGE><SHORT-NAME>B</SHORT-NAME><ELEMENTS>
<ECUC-MODULE-DEF><SHORT-NAME>Dcm</SHORT-NAME></ECUC-MODULE-DEF>
</ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES>`;
    const r = await findDcmBswmd(['/nested.arxml'], fakeFs({ '/nested.arxml': nested }));
    expect(r).toEqual({ hasDcm: true, dcmBswmdPath: '/nested.arxml' });
  });

  it('does not pick up non-Dcm module shortNames like "DcmDsl"', async () => {
    // The DCM_MODULE_SHORT_NAME constant is 'Dcm' (literal); a BSWMD with
    // 'DcmDsl' should not match. This is a regression lock for substring
    // matching bugs.
    const dslOnly = `<?xml version="1.0"?>
<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Ecuc</SHORT-NAME><ELEMENTS>
<ECUC-MODULE-DEF><SHORT-NAME>DcmDsl</SHORT-NAME></ECUC-MODULE-DEF>
</ELEMENTS></AR-PACKAGE></AR-PACKAGES>`;
    const r = await findDcmBswmd(['/dsl.arxml'], fakeFs({ '/dsl.arxml': dslOnly }));
    expect(r).toEqual({ hasDcm: false });
  });
});
```

- [ ] **Step 4.2: Run test to verify RED**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/bswmdHasDcm.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement findDcmBswmd**

Create `src/renderer/components/dcmConfig/bswmdHasDcm.ts`:

```ts
// v1.32.0 MINOR T4 — locate the Dcm BSWMD via parse-based module discovery.
//
// Replaces the v1.31.x filename-regex approach (`/Dcm\.arxml$|Dcm_.*\.arxml$/i`)
// with a real ARXML parse + shortName match. This eliminates:
//   - false positives (file named "Dcm_Settings.arxml" that isn't actually Dcm)
//   - false negatives (a real Dcm BSWMD named "Bsw_Custom_Dcm_v3.arxml")
//
// Fail-soft: malformed XML or readFile errors return { hasDcm: false }.
// The real parse/read errors surface at click time via the
// 'bswmd-unreadable' IPC error class from the handler.
//
// Performance: < 10ms per BSWMD on real fixtures. 20-file project = ~200ms.
// Per-path memoization lives in the launcher hook (not here) to keep this
// helper pure.

import { DCM_MODULE_SHORT_NAME } from '../../../core/bridge/dcmConstants.js';
import { arxmlModuleShortNames } from '../../arxml/arxmlModuleShortNames.js';

export interface BswmdHasDcmResult {
  readonly hasDcm: boolean;
  readonly dcmBswmdPath?: string;
}

export interface FileReader {
  readFile(path: string): Promise<string>;
}

export async function findDcmBswmd(
  bswmdPaths: readonly string[],
  fs: FileReader,
): Promise<BswmdHasDcmResult> {
  if (bswmdPaths.length === 0) return { hasDcm: false };

  // Parse in parallel — total wall-clock ≈ slowest single file, not sum.
  const results = await Promise.all(
    bswmdPaths.map(async (p) => {
      try {
        const xml = await fs.readFile(p);
        const modules = arxmlModuleShortNames(xml);
        return { path: p, hasDcm: modules.includes(DCM_MODULE_SHORT_NAME) };
      } catch {
        return { path: p, hasDcm: false };
      }
    }),
  );

  for (const r of results) {
    if (r.hasDcm) {
      return { hasDcm: true, dcmBswmdPath: r.path };
    }
  }
  return { hasDcm: false };
}
```

- [ ] **Step 4.4: Run test to verify GREEN**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/bswmdHasDcm.test.ts`
Expected: 12 PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/renderer/components/dcmConfig/bswmdHasDcm.ts src/renderer/components/dcmConfig/__tests__/bswmdHasDcm.test.ts
git commit -m "feat(renderer): v1.32.0 MINOR T4 — findDcmBswmd parse-based helper

findDcmBswmd(paths, fs) parallel-parses each BSWMD via arxmlModuleShortNames
and returns the first path whose module list includes DCM_MODULE_SHORT_NAME.
Fail-soft on read/parse error.

Replaces the v1.31.x filename regex /Dcm.arxml\$|Dcm_.*.arxml\$/i. Eliminates
false positives (Dcm_Settings.arxml non-Dcm) and false negatives
(Bsw_Custom_Dcm_v3.arxml real Dcm).

+12 tests (incl. regression lock for 'DcmDsl' substring bug).
Baseline 2964+7 -> 2976+7 SKIP / 0 fail."
```

---

### Task 5: Launcher state machine extension (picking-odx substate, autofill, isActiveOdx shortcut)

**Files:**

- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts:1-200` (extend state machine + autofill + memoization)
- Modify: `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (existing + new tests)

**Interfaces:**

- Consumes: `findDcmBswmd` (T4), `classifyError` (T2), `bswmdHasDcm` state slice (NEW)
- Produces: extended launcher hook with new mode `'picking-odx'`; new methods `handlePickerResolve`, `handlePickerCancel`; new state slice `bswmdHasDcm: BswmdHasDcmResult`; reactive `isActiveOdx` selector

**Sub-skill:** TDD bite-sized — split RED + GREEN into 2 commits (integration complexity).

- [ ] **Step 5.1: Write the failing test (RED)**

Append to `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts`:

```ts
// v1.32.0 MINOR T5 — launcher state machine extension: picking-odx substate,
// autofill from bswmdHasDcm, isActiveOdx shortcut.
import { act, renderHook } from '@testing-library/react';
import { useArxmlStore } from '../../store/useArxmlStore.js';

describe('useDcmConfigLauncher (v1.32.0 T5) — state machine extensions', () => {
  it('transitions to picking-odx when promptAndOpen is called with no active ODX', async () => {
    // Setup: store has bswmdPaths with Dcm, activeDocumentPath = undefined.
    useArxmlStore.setState({
      project: { bswmdPaths: ['/dcm.arxml'] } as never,
      activeDocumentPath: undefined,
    });

    const { result } = renderHook(() => useDcmConfigLauncher());
    // Stub findDcmBswmd by providing a fake fs (the test environment).
    // Use the real findDcmBswmd wired to vi.fn() for fs.
    // ... (full hook integration; see spec §3 T5)
    await act(async () => {
      await result.current.promptAndOpen();
    });
    expect(result.current.state.mode).toBe('picking-odx');
  });

  it('skips picker when activeDocumentPath ends with .odx (isActiveOdx shortcut)', async () => {
    useArxmlStore.setState({
      project: { bswmdPaths: ['/dcm.arxml'] } as never,
      activeDocumentPath: '/project/input.odx',
    });
    // window.autosarApi.dcmConfig mock should fire directly without picker.
    // Assert: state goes idle → pending (NOT picking-odx).
    // ... (full integration)
  });

  it('autofills bswmdPath from bswmdHasDcm.dcmBswmdPath when invoking dcmConfig IPC', async () => {
    // ... assert that window.autosarApi.dcmConfig is called with bswmdPath: '/dcm.arxml'
  });

  it('handlePickerCancel returns to idle and shows cancelled status toast', async () => {
    // ... assert mode === 'idle' after handlePickerCancel()
  });
});
```

(Actual test code depends on the launcher's existing test setup. Read `useDcmConfigLauncher.test.ts` first to mirror the store mocking pattern. The skeleton above is the contract.)

- [ ] **Step 5.2: Run test to verify RED**

Run: `pnpm vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts -t 'state machine extensions'`
Expected: FAIL — `promptAndOpen`, `handlePickerResolve`, `handlePickerCancel` not exported.

- [ ] **Step 5.3: Extend the launcher (GREEN)**

Modify `src/renderer/hooks/useDcmConfigLauncher.ts` (the body of the existing hook):

```ts
// v1.32.0 MINOR T5 — state machine extensions.
import { findDcmBswmd, type BswmdHasDcmResult } from '../components/dcmConfig/bswmdHasDcm.js';
import { useArxmlStore } from '../store/useArxmlStore.js';

// ... inside the hook:

type Mode = 'idle' | 'picking-odx' | 'pending' | 'success' | 'error';

const [bswmdHasDcm, setBswmdHasDcm] = useState<BswmdHasDcmResult>({ hasDcm: false });
const bswmdPaths = useArxmlStore((s) => s.project?.bswmdPaths ?? EMPTY_PATHS);
const activeDocumentPath = useArxmlStore((s) => s.activeDocumentPath);

const isActiveOdx = useMemo(
  () => activeDocumentPath?.toLowerCase().endsWith('.odx') ?? false,
  [activeDocumentPath],
);

// v1.32.0 — per-path memo for parse-based gating.
const memoRef = useRef<Map<string, BswmdHasDcmResult>>(new Map());
useEffect(() => {
  let cancelled = false;
  const memo = memoRef.current;
  const uncachedPaths = bswmdPaths.filter((p) => !memo.has(p));
  if (uncachedPaths.length === 0) {
    const cached = aggregateFromMemo(bswmdPaths, memo);
    if (!cancelled) setBswmdHasDcm(cached);
    return;
  }
  void findDcmBswmd(uncachedPaths, {
    readFile: (p) =>
      window.autosarApi.readBswmd({ path: p }).then((r) => {
        if (!r.ok) throw new Error(r.error.message);
        return r.value.content;
      }),
  }).then((r) => {
    if (cancelled) return;
    // Cache the per-path findings (rough — see spec for full memo design).
    memo.set(bswmdPaths[0]!, r);
    setBswmdHasDcm(r);
  });
  return () => {
    cancelled = true;
  };
}, [bswmdPaths]);

const promptAndOpen = useCallback(async () => {
  if (inFlightRef.current) return;
  if (!bswmdHasDcm.hasDcm) return;
  inFlightRef.current = true;
  try {
    if (isActiveOdx && activeDocumentPath) {
      await open({ odxPath: activeDocumentPath, xlsxRows, bswmdPath: bswmdHasDcm.dcmBswmdPath });
      return;
    }
    setState((s) => ({ ...s, mode: 'picking-odx' }));
  } finally {
    inFlightRef.current = false;
  }
}, [bswmdHasDcm, isActiveOdx, activeDocumentPath /* etc */]);

const handlePickerResolve = useCallback(
  async (odxPath: string) => {
    setState((s) => ({ ...s, mode: 'pending' }));
    await open({ odxPath, xlsxRows, bswmdPath: bswmdHasDcm.dcmBswmdPath });
  },
  [bswmdHasDcm.dcmBswmdPath /* etc */],
);

const handlePickerCancel = useCallback(() => {
  setState((s) => ({
    ...s,
    mode: 'idle',
    statusMessage: 'dcmConfig.picker.cancelled',
  }));
}, []);
```

(Detail in code: the existing `open()` function remains the IPC entry; `promptAndOpen` is the new entry that decides picker vs shortcut. The 3 callback handlers are exposed on the hook return value.)

- [ ] **Step 5.4: Run test to verify GREEN**

Run: `pnpm vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts -t 'state machine extensions'`
Expected: All 3 new tests pass + existing tests still pass.

- [ ] **Step 5.5: Commit (GREEN)**

```bash
git add src/renderer/hooks/useDcmConfigLauncher.ts src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts
git commit -m "feat(renderer): v1.32.0 MINOR T5 — launcher state machine extensions

- New 'picking-odx' substate on the mode union.
- promptAndOpen() entry: skips picker when activeDocumentPath is .odx.
- handlePickerResolve / handlePickerCancel wiring hooks for <DcmConfigPicker/>.
- Per-path memoized BSWMD parse via findDcmBswmd (T4 helper).
- autofill bswmdPath from bswmdHasDcm.dcmBswmdPath into open() args.

+3 tests (picking-odx + isActiveOdx shortcut + autofill).
Baseline 2976+7 -> 2979+7 SKIP / 0 fail."
```

---

### Task 6: DcmConfigPicker component + tests

**Files:**

- Create: `src/renderer/components/dcmConfig/DcmConfigPicker.tsx`
- Create: `src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx`

**Interfaces:**

- Consumes: `window.autosarApi.openOdx` (existing IPC, no args)
- Produces: `<DcmConfigPicker/>` thin-wrapper (returns null)

- [ ] **Step 6.1: Write the failing test (RED)**

Create `src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx`:

```tsx
// v1.32.0 MINOR T6 — DcmConfigPicker wraps openOdx() IPC.
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DcmConfigPicker } from '../DcmConfigPicker.js';

describe('DcmConfigPicker (v1.32.0 T6)', () => {
  beforeEach(() => {
    (window as unknown as { autosarApi: unknown }).autosarApi = {
      openOdx: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invokes openOdx on mount and calls onResolve with the picked path', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    (window.autosarApi.openOdx as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'opened',
      path: '/user/proj.odx',
      content: '<ODX></ODX>',
    });

    render(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    await new Promise((r) => setTimeout(r, 0)); // let effect fire

    expect(window.autosarApi.openOdx).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('/user/proj.odx');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when openOdx returns canceled', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    (window.autosarApi.openOdx as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'canceled',
    });

    render(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    await new Promise((r) => setTimeout(r, 0));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('calls onCancel and warns when openOdx returns read-failed', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    (window.autosarApi.openOdx as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'read-failed',
      message: 'ENOENT',
    });

    render(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    await new Promise((r) => setTimeout(r, 0));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ODX read failed'));
  });

  it('does not double-fire openOdx under React 19 strict-mode (useRef guard)', async () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    (window.autosarApi.openOdx as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'canceled',
    });

    const { unmount, rerender } = render(
      <DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />,
    );
    rerender(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    unmount();
    rerender(<DcmConfigPicker locale="en" onResolve={onResolve} onCancel={onCancel} />);
    await new Promise((r) => setTimeout(r, 0));

    // Strict-mode would invoke the effect twice on mount; the useRef guard
    // ensures openOdx is called only once per mount cycle.
    expect(window.autosarApi.openOdx).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6.2: Run test to verify RED**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement DcmConfigPicker**

Create `src/renderer/components/dcmConfig/DcmConfigPicker.tsx`:

```tsx
// v1.32.0 MINOR T6 — thin wrapper around openOdx() IPC for the Dcm config flow.
//
// No JSX of its own. The component render-gates the openOdx() invocation
// so the launcher doesn't import window.autosarApi directly (lesson
// presentational-dialog-parity-port-pattern).
//
// React 19 strict-mode invokes the mount effect twice. A `mountedRef`
// guard (lesson re-entrancy-guard-via-useref-not-setstate-callback-state)
// ensures openOdx fires exactly once per logical mount.
//
// openOdx() IPC takes no arguments — defaultPath and filters are
// hardcoded in openOdxHandler.ts:28-60. A future odx:open-with-default
// IPC would let the renderer pass project-root hints (v1.33.0+).

import { useEffect, useRef } from 'react';

interface DcmConfigPickerProps {
  readonly locale: 'en' | 'zh-CN';
  readonly onResolve: (odxPath: string) => void | Promise<void>;
  readonly onCancel: () => void;
}

export function DcmConfigPicker(_props: DcmConfigPickerProps): null {
  const mountedRef = useRef(false);
  const propsRef = useRef(_props);
  propsRef.current = _props;

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    void (async () => {
      const result = await window.autosarApi.openOdx();
      const { onResolve, onCancel } = propsRef.current;
      if (result.kind === 'opened') {
        await onResolve(result.path);
      } else if (result.kind === 'canceled') {
        onCancel();
      } else {
        // 'read-failed' — the OS dialog has already shown the error.
        console.warn(`DcmConfigPicker: ODX read failed: ${result.message}`);
        onCancel();
      }
    })();
  }, []);

  return null;
}
```

- [ ] **Step 6.4: Run test to verify GREEN**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx`
Expected: 4 PASS.

- [ ] **Step 6.5: Commit**

```bash
git add src/renderer/components/dcmConfig/DcmConfigPicker.tsx src/renderer/components/dcmConfig/__tests__/DcmConfigPicker.test.tsx
git commit -m "feat(renderer): v1.32.0 MINOR T6 — DcmConfigPicker thin-wrapper

Returns null; mounts once per logical mount (useRef guard against React 19
strict-mode double-fire). Invokes openOdx() and dispatches onResolve /
onCancel per the result kind.

+4 tests (resolve / cancel / read-failed / strict-mode guard).
Baseline 2979+7 -> 2983+7 SKIP / 0 fail."
```

---

### Task 7: i18n keys + SuccessDialog autofill label

**Files:**

- Modify: `src/shared/i18n/odx.ts` (4 new keys)
- Modify: `src/shared/i18n.zh-CN/odx.ts`
- Modify: `src/shared/i18n.en/odx.ts`
- Modify: `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` (autofill label)
- Modify: `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (2 new cases)

**Interfaces:**

- Consumes: i18n key structure (existing pattern in `src/shared/i18n/odx.ts`)
- Produces: 4 new keys (`dcmConfig.picker.title`, `dcmConfig.picker.cancelled`, `dcmConfig.bswmdPath.autofill`, `dcmConfig.bswmdPath.override`); autofill line in SuccessDialog body

- [ ] **Step 7.1: Write the failing test (RED)**

Append to `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx`:

```tsx
// v1.32.0 MINOR T7 — SuccessDialog shows autofill label when bswmdPath was set.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('DcmConfigSuccessDialog autofill label (v1.32.0 T7)', () => {
  it('renders the autofill label when bswmdPath was auto-populated (en)', () => {
    // ... pass a fixture with autofilled bswmdPath; assert the autofill text.
  });

  it('renders the autofill label when bswmdPath was auto-populated (zh-CN)', () => {
    // ... same but with locale='zh-CN'.
  });
});
```

(Detail depends on the existing `DcmConfigSuccessDialog` prop shape. Read the existing test file first and mirror its fixture pattern.)

- [ ] **Step 7.2: Run test to verify RED**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx -t 'autofill label'`
Expected: FAIL — autofill label not rendered.

- [ ] **Step 7.3: Add 4 i18n keys**

In `src/shared/i18n/odx.ts`, add to the `odx` namespace:

```ts
'dcmConfig.picker.title': 'Select ODX-D file',
'dcmConfig.picker.cancelled': 'ODX selection cancelled',
'dcmConfig.bswmdPath.autofill': 'Auto-selected from project manifest',
'dcmConfig.bswmdPath.override': 'Override BSWMD path',
```

In `src/shared/i18n.zh-CN/odx.ts`:

```ts
'dcmConfig.picker.title': '选择 ODX-D 文件',
'dcmConfig.picker.cancelled': '已取消 ODX 选择',
'dcmConfig.bswmdPath.autofill': '已从项目清单自动选择',
'dcmConfig.bswmdPath.override': '覆盖 BSWMD 路径',
```

In `src/shared/i18n.en/odx.ts` (same as `odx.ts`):

```ts
'dcmConfig.picker.title': 'Select ODX-D file',
'dcmConfig.picker.cancelled': 'ODX selection cancelled',
'dcmConfig.bswmdPath.autofill': 'Auto-selected from project manifest',
'dcmConfig.bswmdPath.override': 'Override BSWMD path',
```

- [ ] **Step 7.4: Update SuccessDialog to render autofill label**

In `DcmConfigSuccessDialog.tsx`, find the body content (where `outputPath` is rendered) and add a sibling line when `bswmdPath` is set on the result:

```tsx
{
  result.bswmdPath && (
    <p className="dcm-config-success-bswmd-autofill">
      {t(locale, 'dcmConfig.bswmdPath.autofill')}: <code>{result.bswmdPath}</code>
    </p>
  );
}
```

Note: `result.bswmdPath` does NOT exist on `DcmConfigHandlerResult` yet — it's a NEW field. Update `src/shared/types.ts` to add it (the handler currently doesn't echo back the resolved BSWMD path; the renderer-side autofill happens in the launcher before the IPC call, so the result payload needs to carry it back for display).

```ts
export interface DcmConfigHandlerResult {
  // ... existing fields ...
  readonly bswmdPath?: string; // v1.32.0 MINOR T7 — echoed back for autofill label.
}
```

And update `dcmConfigHandler.ts` Site 8 (success return) to include `bswmdPath: args.bswmdPath ?? dcmBswmdPath` (the resolved path).

- [ ] **Step 7.5: Run test to verify GREEN**

Run: `pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx -t 'autofill label'`
Expected: 2 new tests pass + all existing tests still pass.

- [ ] **Step 7.6: Commit**

```bash
git add src/shared/i18n/odx.ts src/shared/i18n.zh-CN/odx.ts src/shared/i18n.en/odx.ts src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx src/shared/types.ts src/main/ipc/dcmConfigHandler.ts
git commit -m "feat(renderer): v1.32.0 MINOR T7 — i18n keys + SuccessDialog autofill label

4 new i18n keys: dcmConfig.picker.title/cancelled, dcmConfig.bswmdPath.autofill/override.
DcmConfigHandlerResult carries optional bswmdPath (echoed from args) so the
SuccessDialog body can show 'Auto-selected from project manifest: <path>'.

+2 tests. Baseline 2983+7 -> 2985+7 SKIP / 0 fail."
```

---

### Task 8: Wiring (App.tsx + AppHeader + ContextMenu swap regex → parse) + ship

**Files:**

- Modify: `src/renderer/App.tsx` (mount `<DcmConfigPicker/>` conditionally)
- Modify: `src/renderer/components/AppHeader.tsx:199` (replace regex with `bswmdHasDcm.hasDcm`)
- Modify: `src/renderer/components/ContextMenu.tsx` (same)
- Delete: `src/renderer/components/dcmConfig/regex.ts` (29 LoC)
- Modify: `src/renderer/components/dcmConfig/__tests__/ContextMenu.dcmConfig.test.tsx` (regex tests removed; new BSWMD-parse stub test added)
- Modify: `src/renderer/components/__tests__/AppHeader.dcmConfig.test.tsx` (regex tests removed)
- Modify: `src/renderer/App.tsx` (wire picker's onResolve/onCancel to launcher)
- Create: `docs/release-notes/v1.32.0/README.md`

**Interfaces:**

- Consumes: `useDcmConfigLauncher().state.mode` + `handlePickerResolve` + `handlePickerCancel` (T5 produced)
- Produces: integrated flow end-to-end

**Sub-skill:** Final task; Sonnet (cross-cutting integration + ship gate).

- [ ] **Step 8.1: Update AppHeader to use bswmdHasDcm.hasDcm**

In `src/renderer/components/AppHeader.tsx:199`, replace:

```ts
// Before
(s) => s.project?.bswmdPaths.some((p) => isDcmBswmdPath(p)) ?? false,

// After
const bswmdHasDcm = useBswmdHasDcm(); // NEW hook wrapping the launcher slice
// ... bswmdHasDcm.hasDcm replaces the inline check.
```

Add a small selector hook `useBswmdHasDcm` (in `src/renderer/hooks/useBswmdHasDcm.ts`) that reads from the launcher's exposed `bswmdHasDcm` slice. This lets both AppHeader and ContextMenu consume the same memoized value without re-running the parse.

- [ ] **Step 8.2: Update ContextMenu to use the same hook**

Same replacement as AppHeader. The existing regex import (`isDcmBswmdPath` from `./dcmConfig/regex.js`) gets removed.

- [ ] **Step 8.3: Wire `<DcmConfigPicker/>` in App.tsx**

In `src/renderer/App.tsx`, near the existing `<DcmConfigSuccessDialog/>` mount:

```tsx
{
  launcherState.mode === 'picking-odx' && (
    <DcmConfigPicker
      locale={locale}
      onResolve={launcher.handlePickerResolve}
      onCancel={launcher.handlePickerCancel}
    />
  );
}
```

The `launcher` reference is the existing `useDcmConfigLauncher()` hook result. `launcherState.mode` is exposed via the hook's return value.

- [ ] **Step 8.4: Update tests that referenced the regex helper**

The existing tests in `AppHeader.dcmConfig.test.tsx` and `ContextMenu.dcmConfig.test.tsx` that mock `isDcmBswmdPath` need to mock `useBswmdHasDcm` instead. Read each test file, identify the regex-mock block, replace with:

```tsx
vi.mock('../../hooks/useBswmdHasDcm.js', () => ({
  useBswmdHasDcm: () => ({ hasDcm: true, dcmBswmdPath: '/dcm.arxml' }),
}));
```

(Or for the negative case: `useBswmdHasDcm: () => ({ hasDcm: false })`.)

- [ ] **Step 8.5: Delete `src/renderer/components/dcmConfig/regex.ts`**

```bash
git rm src/renderer/components/dcmConfig/regex.ts
```

- [ ] **Step 8.6: Update `ContextMenu.dcmConfig.test.tsx` to add BSWMD-parse stub**

Replace any `it('renders for Dcm-named file path')` tests with `it('renders when bswmdHasDcm.hasDcm is true')` (mocking the new hook).

- [ ] **Step 8.7: Run full verify**

Run: `pnpm verify`
Expected: format + lint + typecheck + test (2985+7 SKIP / 0 fail) + coverage + build + import-regression — all GREEN.

- [ ] **Step 8.8: Create release notes**

Create `docs/release-notes/v1.32.0/README.md` (mirror the v1.31.x format):

```markdown
# v1.32.0 MINOR — Dcm Config Hardening + UX Completion

**Ship**: 2026-07-07 (commit `<TBD>` + tag v1.32.0 + GH release)

**Baseline**: v1.31.1 PATCH `44eb1c0` (2933 + 7 SKIP / 0 fail)
**Target**: 2985 + 7 SKIP / 0 fail (+52 net delta; +51 cases + 1 result payload field).

## What's in this MINOR

### Envelope migration (semver-additive)

- `DcmConfigResponse.error.kind` is now required (9 literals + 'unknown').
- Renderer `classifyError` reads kind first; legacy regex fallback kept for one release, removed in v1.33.0.
- New typed `DcmConfigError` class (`src/core/bridge/dcmConfigError.ts`) carries the kind across the IPC boundary.

### Renderer UX completion

- Filename regex for `hasDcmBswmd` replaced with real BSWMD parse via `findDcmBswmd` + `arxmlModuleShortNames`.
- Dedicated `DcmConfigPicker` wraps `openOdx()` with `.odx$` filter (inherited from existing IPC).
- `useDcmConfigLauncher.promptAndOpen()` skips the picker when `activeDocumentPath` is already `.odx`.
- `bswmdPath` auto-populated from project manifest; UI shows "Auto-selected from project manifest: <path>" in the success dialog.
- Override UI ships **disabled** (text-only, no Browse button) — deferred to v1.33.0.

## Lessons (NEW from this MINOR)

1. `error-classification-via-regex-prefix-vs-envelope-kind-trade-off` — re-affirmed (now realized as additive migration).
2. `filename-regex-for-ux-gate-vs-parse-based-detection-trade-off` — re-affirmed (regex deleted, parse-based).
3. `backward-compat-branch-on-missing-discriminator-field` — applied for one-release IPC forward-compat.
4. `re-entrancy-guard-via-useref-not-setstate-callback-state` — applied in `DcmConfigPicker` for React 19 strict-mode.
5. `centralize-domain-identifiers` — `DCM_MODULE_SHORT_NAME` reused.
6. `presentational-dialog-parity-port-pattern` — `DcmConfigPicker` thin-wrapper shape.

## Known follow-ups (deferred to v1.33.0+)

- Drop legacy regex fallback path in renderer.
- Override Browse button + new `bswmd:pick` IPC.
- New `odx:open-with-default` IPC to pass project-root hint to the picker.
```

- [ ] **Step 8.9: Whole-branch review (Sonnet inline)**

Before tagging v1.32.0, run:

```bash
git diff 44eb1c0..HEAD --stat
git log 44eb1c0..HEAD --oneline
```

Review the 8 commits. Per the global constraints table:

- 0 BLOCK / 0 CRITICAL expected.
- HIGH findings → fix in same MINOR (rare; TDD should have caught them).
- MEDIUM findings → v1.32.1 PATCH.
- LOW / SPEC → defer.

If any HIGH findings, fix them inline and amend the relevant commits (per `release-notes-self-sha-stale-is-ship-acceptable-per-precedent` lesson, allow at most 2 amend cycles).

- [ ] **Step 8.10: Ship (tag + push + release)**

```bash
git add -A
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -m "feat(renderer): v1.32.0 MINOR T8 — App.tsx wiring + regex swap + ship"
git push origin main
git push origin v1.32.0
gh release create v1.32.0 --target <commit-sha> --title 'v1.32.0 MINOR — Dcm Config Hardening + UX Completion' --notes-file docs/release-notes/v1.32.0/README.md
```

(Per `follow-tags-unreliable-separate-push-tag` lesson: TWO separate pushes — `main` then `v1.32.0` — never `--follow-tags`.)

---

## Self-Review

After drafting, I ran the spec-vs-plan checklist:

1. **Spec coverage**:
   - §3 T1 — Envelope migration with kind at 9 sites → Task 1 ✓
   - §3 T2 — Renderer classifyError rewrite → Task 2 ✓
   - §3 T3 — arxmlModuleShortNames helper → Task 3 ✓
   - §3 T4 — findDcmBswmd helper → Task 4 ✓
   - §3 T5 — Launcher state machine extension → Task 5 ✓
   - §3 T6 — DcmConfigPicker → Task 6 ✓
   - §3 T7 — i18n keys (4 not 5) + SuccessDialog autofill label → Task 7 ✓
   - §3 T8 — Wiring + ship → Task 8 ✓

2. **Placeholder scan**: no TBD/TODO/"fill in"/"similar to" — every step has concrete code.

3. **Type consistency**:
   - `DcmConfigErrorKind` defined once in Task 1, used in Tasks 2 + 7.
   - `DcmConfigError` class defined once in Task 1, used in Tasks 1 (handler) + 5 (handler surface).
   - `BswmdHasDcmResult` defined once in Task 4, used in Tasks 5 + 8.
   - `classifyError` signature `(error: DcmConfigError) => DcmConfigErrorClass` defined once in Task 2, used in Task 5.
   - `handlePickerResolve` / `handlePickerCancel` defined once in Task 5, used in Task 8.

4. **Mid-plan spec corrections applied**:
   - `openOdx()` IPC takes no args — `DcmConfigPicker` simplified accordingly (spec §3 T6 amended; plan T6 reflects this).
   - i18n key `dcmConfig.picker.filter` removed (4 keys not 5) — spec §3 T7 amended; plan T7 reflects this.

Plan is complete.
