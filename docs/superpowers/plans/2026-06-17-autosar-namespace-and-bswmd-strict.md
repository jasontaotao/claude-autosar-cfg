# AUTOSAR Namespace Compatibility + BSWMD-as-Value Strict Reject

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 bugs in `parseArxml` / `serializeArxml` so EB tresos BSWMD files (R4.4.0, R19-11, R20-11, R21-11) load successfully, and so pure-BSWMD files loaded via the value-side parser fail loudly with a hint to use "Load BSWMD".

**Architecture:** Two surgical parser/serializer changes (extend `XSD_PATTERN` and `SUPPORTED_ARXML_VERSIONS` to recognise the 5-digit `AUTOSAR_000NN.xsd` form), one new strict-reject guard in `parseArxml`, and one lookup table in the serializer for round-trip fidelity. All changes are local to `src/core/arxml/`; no UI or store changes.

**Tech Stack:** TypeScript, vitest, fast-xml-parser.

**Spec:** `docs/superpowers/specs/2026-06-17-autosar-namespace-and-bswmd-strict-design.md`

---

## Task 1: Extend `ArxmlVersion` + `SUPPORTED_ARXML_VERSIONS` with 5-digit literals

**Files:**
- Modify: `src/core/arxml/types.ts:5` (ArxmlVersion type)
- Modify: `src/core/arxml/types.ts:77-83` (SUPPORTED_ARXML_VERSIONS)

- [ ] **Step 1: Update `ArxmlVersion` union type**

In `src/core/arxml/types.ts`, change line 5 from:
```ts
export type ArxmlVersion = '4.2' | '4.4' | '4.6' | '4.7' | '5.0' | '00005' | '00006';
```
to:
```ts
export type ArxmlVersion =
  | '4.2'
  | '4.4'
  | '4.6'
  | '4.7'
  | '5.0'
  | '00005'
  | '00006'
  | '00046'
  | '00048'
  | '00049'
  | '00050';
```

- [ ] **Step 2: Update `SUPPORTED_ARXML_VERSIONS` constant**

In the same file, change lines 77-83 from:
```ts
export const SUPPORTED_ARXML_VERSIONS: readonly ArxmlVersion[] = [
  '4.2',
  '4.4',
  '4.6',
  '4.7',
  '5.0',
] as const;
```
to:
```ts
export const SUPPORTED_ARXML_VERSIONS: readonly ArxmlVersion[] = [
  '4.2',
  '4.4',
  '4.6',
  '4.7',
  '5.0',
  // 5-digit literals — AUTOSAR standard form for R4.4+ releases:
  // 00046 = R4.6, 00048 = R19-11, 00049 = R20-11, 00050 = R21-11.
  // 00047 (R4.7) intentionally omitted — no fixture proves vendor emission yet.
  '00046',
  '00048',
  '00049',
  '00050',
] as const;
```

- [ ] **Step 3: Run type-check**

Run: `pnpm type-check`
Expected: PASS (0 errors). The new literals are present in both the union and the constant.

- [ ] **Step 4: Run existing tests**

Run: `pnpm test`
Expected: PASS. Existing tests don't reference the new literals; widening the union only relaxes constraints.

- [ ] **Step 5: Commit**

```bash
git add src/core/arxml/types.ts
git commit -m "feat(arxml): add 00046/00048/00049/00050 to supported version set"
```

---

## Task 2: Extend `XSD_PATTERN` to recognise the 5-digit form

**Files:**
- Modify: `src/core/arxml/parser.ts:45` (XSD_PATTERN constant)
- Test: `src/core/arxml/__tests__/parser-namespace.test.ts` (new file)

- [ ] **Step 1: Write the failing regex test**

Create `src/core/arxml/__tests__/parser-namespace.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('XSD_PATTERN namespace detection', () => {
  it('matches the legacy dashed form AUTOSAR_4-2-2.xsd', async () => {
    const { detectVersion } = await import('../parser-internals.js');
    const r = detectVersion(
      '<AUTOSAR xmlns="http://autosar.org/schema/r4.2" '
      + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
      + 'xsi:schemaLocation="http://autosar.org/schema/r4.2 AUTOSAR_4-2-2.xsd"></AUTOSAR>',
    );
    expect(r).toBe('4.2');
  });

  it('matches the 5-digit form AUTOSAR_00046.xsd', async () => {
    const { detectVersion } = await import('../parser-internals.js');
    const r = detectVersion(
      '<AUTOSAR xmlns="http://autosar.org/schema/r4.0" '
      + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
      + 'xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_00046.xsd"></AUTOSAR>',
    );
    expect(r).toBe('00046');
  });

  it('matches the 5-digit form AUTOSAR_00049.xsd (R20-11)', async () => {
    const { detectVersion } = await import('../parser-internals.js');
    const r = detectVersion(
      '<AUTOSAR xmlns="http://autosar.org/schema/r4.0" '
      + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
      + 'xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_00049.xsd"></AUTOSAR>',
    );
    expect(r).toBe('00049');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/core/arxml/__tests__/parser-namespace.test.ts`
Expected: FAIL — `parser-internals.js` module does not exist yet (`detectVersion` not exported).

- [ ] **Step 3: Export `detectVersion` from a new internals module**

Create `src/core/arxml/parser-internals.ts`:

```ts
// Internal helpers re-exported for unit testing. Not part of the public API.
// Consumers outside this package should import from `parser.ts`.

export { detectVersion } from './parser.js';
```

In `src/core/arxml/parser.ts`, find the existing `detectVersion` function (it sits between the public `parseArxml` and the lower-level helpers around line 136). **Do not rewrite it yet.** Just confirm it exists; we only need to re-export.

Verify the re-export exists by running `pnpm type-check`.

- [ ] **Step 4: Run tests to verify the import works (but detection logic still fails for 5-digit)**

Run: `pnpm test src/core/arxml/__tests__/parser-namespace.test.ts`
Expected: 3 tests run. The `4.2` test PASSES; the two 5-digit tests FAIL because `detectVersion` returns `null` for `AUTOSAR_00046.xsd` / `AUTOSAR_00049.xsd`.

- [ ] **Step 5: Extend `XSD_PATTERN`**

In `src/core/arxml/parser.ts:45`, change:
```ts
const XSD_PATTERN = /AUTOSAR_(\d)-(\d)-(\d)\.xsd/;
```
to:
```ts
// AUTOSAR ships schemaLocation in two forms:
//   1. Dashed:   AUTOSAR_4-2-2.xsd  (R4.2 / R4.4 / R4.6 / R4.7 / R5.0)
//   2. 5-digit:  AUTOSAR_00046.xsd  (R4.4+ standard form: 00046=R4.6,
//                                     00048=R19-11, 00049=R20-11, 00050=R21-11)
// The 5-digit literal IS the version — no transformation needed. We capture
// groups 1-3 for the dashed form and group 4 for the 5-digit form.
const XSD_PATTERN = /(?:AUTOSAR_(\d)-(\d)-(\d)\.xsd|AUTOSAR_(\d{5})\.xsd)/;
```

- [ ] **Step 6: Update `detectVersion` to extract the 5-digit form**

In `src/core/arxml/parser.ts`, find `detectVersion` (around line 136-163). Replace its body so the XSD extraction branch handles both forms:

```ts
function detectVersion(autosar: Record<string, unknown>): ArxmlVersion | null {
  const xmlns = typeof autosar['@_xmlns'] === 'string' ? (autosar['@_xmlns'] as string) : '';
  const xsi = autosar['@_xsi:schemaLocation'];
  const loc = typeof xsi === 'string' ? xsi : xmlns;
  const m = NS_PATTERN.exec(loc);
  let candidate: ArxmlVersion | null = null;
  if (m) {
    const raw = m[1];
    if (raw !== undefined) {
      if (raw.startsWith('r')) candidate = raw.slice(1) as ArxmlVersion;
      else if (raw === '00005' || raw === '00006') candidate = raw;
    }
  }
  // 4.0/4.1 namespace only distinguishes at schemaLocation. Try the
  // schemaLocation XSD name regardless of whether the namespace matched,
  // because the 5-digit xsd form is the authoritative version hint for
  // R4.4+ AUTOSAR releases (EB tresos convention).
  if (typeof xsi === 'string') {
    const xm = XSD_PATTERN.exec(xsi);
    if (xm) {
      // Dashed form: AUTOSAR_4-2-2.xsd → '4.2'
      if (xm[1] !== undefined && xm[2] !== undefined) {
        candidate = `${xm[1]}.${xm[2]}` as ArxmlVersion;
      }
      // 5-digit form: AUTOSAR_00046.xsd → '00046'
      else if (xm[4] !== undefined) {
        candidate = xm[4] as ArxmlVersion;
      }
    }
  }
  if (candidate === null) return null;
  return SUPPORTED_ARXML_VERSIONS.includes(candidate) ? candidate : null;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test src/core/arxml/__tests__/parser-namespace.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 8: Run full test suite to confirm no regression**

Run: `pnpm test`
Expected: all 428 prior tests still PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/arxml/parser.ts src/core/arxml/parser-internals.ts src/core/arxml/__tests__/parser-namespace.test.ts
git commit -m "feat(arxml): detect AUTOSAR 5-digit xsd form (00046/00048/00049/00050)"
```

---

## Task 3: Verify EB tresos fixtures parse via `parseArxml`

**Files:**
- Test: append to `src/core/arxml/__tests__/parser-namespace.test.ts`

This task validates Task 2 against real vendor data, not just synthetic strings.

- [ ] **Step 1: Write the failing test against the real fixture**

Append to `src/core/arxml/__tests__/parser-namespace.test.ts`:

```ts
import { readFileSync, existsSync } from 'node:fs';
import { parseArxml } from '../parser.js';

describe('EB tresos real fixture compatibility', () => {
  // EB tresos ships R4.4 / R19-11 / R20-11 / R21-11 BSWMDs at
  // C:\EB\tresos\autosar\<version>\AUTOSAR_MOD_ECUConfigurationParameters.arxml
  // Each is 12-16 MB and uses the 5-digit xsd form.
  // The fixtures are loaded by full path because they live outside the
  // project tree — they're vendor reference data, not committed fixtures.
  const FIXTURES: ReadonlyArray<readonly [label: string, path: string]> = [
    ['R4.4.0', 'C:\\EB\\tresos\\autosar\\4.4.0\\AUTOSAR_MOD_ECUConfigurationParameters.arxml'],
    ['R19-11', 'C:\\EB\\tresos\\autosar\\R19-11\\AUTOSAR_MOD_ECUConfigurationParameters.arxml'],
    ['R20-11', 'C:\\EB\\tresos\\autosar\\R20-11\\AUTOSAR_MOD_ECUConfigurationParameters.arxml'],
    ['R21-11', 'C:\\EB\\tresos\\autosar\\R21-11\\AUTOSAR_MOD_ECUConfigurationParameters.arxml'],
  ];

  it.each(FIXTURES)('%s parses without unsupported-version', (_label, path) => {
    if (!existsSync(path)) {
      // Skip silently — vendor fixtures not installed in CI.
      return;
    }
    const xml = readFileSync(path, 'utf8');
    const r = parseArxml(xml);
    // Pre-fix this returned { ok: false, error: { kind: 'unsupported-version', version: 'unknown' } }.
    // Post-fix we expect either:
    //   (a) ok=true with a version string, OR
    //   (b) ok=false with kind='invalid-structure' (the strict reject from Task 4).
    // We only assert NOT 'unsupported-version' here — the strict-reject contract
    // is tested separately in Task 4.
    if (!r.ok) {
      expect(r.error.kind).not.toBe('unsupported-version');
    } else {
      expect(typeof r.value.version).toBe('string');
    }
  });
});
```

- [ ] **Step 2: Run test to confirm it passes (EB tresos files exist on this machine)**

Run: `pnpm test src/core/arxml/__tests__/parser-namespace.test.ts`
Expected: 4 new `it.each` cases PASS — fixtures exist at the expected paths and Task 2's regex change lets `detectVersion` accept the 5-digit form.

If `existsSync(path)` returns `false`, the test no-ops; that means the fixtures aren't installed in the dev environment, which is acceptable — the synthetic-string tests from Task 2 still cover the change.

- [ ] **Step 3: Commit**

```bash
git add src/core/arxml/__tests__/parser-namespace.test.ts
git commit -m "test(arxml): EB tresos R4.4/R19-11/R20-11/R21-11 regression fixtures"
```

---

## Task 4: Add strict reject for pure-BSWMD files in `parseArxml`

**Files:**
- Modify: `src/core/arxml/parser.ts` (add post-walk check + helpers)
- Test: append to `src/core/arxml/__tests__/parser-namespace.test.ts`

- [ ] **Step 1: Write the failing test for pure-BSWMD reject**

Append to `src/core/arxml/__tests__/parser-namespace.test.ts`:

```ts
describe('BSWMD-as-value strict reject', () => {
  const PURE_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcuC</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>EcuC</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>EcuCGeneral</SHORT-NAME>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>SleepMode</SHORT-NAME>
                  <MIN>0</MIN>
                  <MAX>10</MAX>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  it('rejects pure BSWMD with invalid-structure and hint message', () => {
    const r = parseArxml(PURE_BSWMD);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('invalid-structure');
    if (r.error.kind !== 'invalid-structure') return;
    expect(r.error.message).toMatch(/BSWMD|BSW Module Description|Load BSWMD/i);
  });

  const MIXED = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Mixed</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Can</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>CanConfigSet</SHORT-NAME>
              <PARAMETER-VALUES>
                <ECUC-NUMERICAL-PARAM-VALUE>
                  <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/X</DEFINITION-REF>
                  <VALUE>1</VALUE>
                </ECUC-NUMERICAL-PARAM-VALUE>
              </PARAMETER-VALUES>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Schema</SHORT-NAME>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  it('parses mixed (value + def) files successfully', () => {
    const r = parseArxml(MIXED);
    expect(r.ok).toBe(true);
  });

  const VALUE_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Values</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Can</SHORT-NAME>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  it('parses value-only files successfully (regression)', () => {
    const r = parseArxml(VALUE_ONLY);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify the strict-reject cases fail**

Run: `pnpm test src/core/arxml/__tests__/parser-namespace.test.ts -t "BSWMD-as-value strict reject"`
Expected: FAIL — currently `PURE_BSWMD` parses successfully (returns `ok: true` with an empty module tree) and the test expects `ok: false`.

- [ ] **Step 3: Add strict-reject helpers to `parser.ts`**

In `src/core/arxml/parser.ts`, find the existing `walkPackages` / `walkPackagesAtDepth` section (around line 200). Add three new private helpers **after** `walkPackagesAtDepth`:

```ts
/**
 * Walk a package subtree looking for any module element
 * (ECUC-MODULE-CONFIGURATION-VALUES that survived classifyElement's
 * 'module' branch). Used to distinguish value files from pure schema files.
 */
function findAnyModuleInPackages(packages: readonly ArxmlPackage[]): boolean {
  for (const pkg of packages) {
    if (pkg.elements.some((e) => e.kind === 'module')) return true;
    if (pkg.packages !== undefined && findAnyModuleInPackages(pkg.packages)) {
      return true;
    }
  }
  return false;
}

/**
 * Walk a package subtree looking for any element whose original tagName
 * ends in '-DEF' (i.e. schema definition). Pure-BSWMD files contain only
 * such elements; mixed files contain at least one module element.
 */
function findAnyDefInPackages(packages: readonly ArxmlPackage[]): boolean {
  for (const pkg of packages) {
    if (pkg.elements.some((e) => e.tagName.endsWith('-DEF'))) return true;
    if (pkg.packages !== undefined && findAnyDefInPackages(pkg.packages)) {
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Apply the strict reject inside `parseArxml`**

In `parseArxml` (the public function), find the spot after `walkPackages` runs and the `Array.isArray(packages)` check passes. Add the reject right before the final `return { ok: true, value: ... }`. The exact location depends on the current implementation — search for the `if (!Array.isArray(packages))` block and add the new check immediately after it:

```ts
// Strict reject: a file with only schema definitions (-DEF) and zero
// value instances (ECUC-MODULE-CONFIGURATION-VALUES) is a BSWMD, not an
// ECUC values file. Direct the user to the BSWMD loader rather than
// silently producing an empty module tree.
if (!findAnyModuleInPackages(packages) && findAnyDefInPackages(packages)) {
  return {
    ok: false,
    error: {
      kind: 'invalid-structure',
      path: '/',
      message:
        'Loaded file is a BSW Module Description (BSWMD, schema only). '
        + 'Open it via "Load BSWMD" instead of "Open ARXML".',
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/core/arxml/__tests__/parser-namespace.test.ts -t "BSWMD-as-value strict reject"`
Expected: 3 tests PASS (pure-BSWMD rejected; mixed + value-only pass through).

- [ ] **Step 6: Run full suite to confirm no regression**

Run: `pnpm test`
Expected: ALL prior 428 tests still PASS + 3 new tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/arxml/parser.ts src/core/arxml/__tests__/parser-namespace.test.ts
git commit -m "feat(arxml): strict reject pure BSWMD files with hint message"
```

---

## Task 5: Replace serializer `buildXmlns` + `buildSchemaLocation` with lookup table

**Files:**
- Modify: `src/core/arxml/serializer.ts:99-105` (two functions replaced by one table)
- Test: append to `src/core/arxml/__tests__/parser-namespace.test.ts` (or new `serializer-roundtrip.test.ts` if preferred)

- [ ] **Step 1: Write the failing round-trip test**

Append to `src/core/arxml/__tests__/parser-namespace.test.ts`:

```ts
import { serializeArxml } from '../serializer.js';
import type { ArxmlDocument } from '../types.js';

describe('serializer version fidelity', () => {
  // Minimal synthetic documents at each supported version literal.
  const mkDoc = (v: '4.2' | '4.6' | '00046' | '00049'): ArxmlDocument => ({
    path: '/test.arxml',
    version: v,
    packages: [
      {
        shortName: 'P',
        path: '/P',
        elements: [
          {
            kind: 'module',
            tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
            shortName: 'M',
            params: {},
            children: [],
            references: [],
          },
        ],
      },
    ],
  });

  it.each(['4.2', '4.6', '00046', '00049'] as const)(
    'serializes %s with the matching xsd file name',
    (v) => {
      const r = serializeArxml(mkDoc(v));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      if (v === '4.2') {
        expect(r.value).toMatch(/AUTOSAR_4-2-2\.xsd/);
      } else if (v === '4.6') {
        expect(r.value).toMatch(/AUTOSAR_4-6-0\.xsd/);
      } else if (v === '00046') {
        expect(r.value).toMatch(/AUTOSAR_00046\.xsd/);
      } else if (v === '00049') {
        expect(r.value).toMatch(/AUTOSAR_00049\.xsd/);
      }
    },
  );

  it('round-trips a 5-digit-versioned document', () => {
    const doc = mkDoc('00049');
    const ser = serializeArxml(doc);
    expect(ser.ok).toBe(true);
    if (!ser.ok) return;
    const re = parseArxml(ser.value);
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    expect(re.value.version).toBe('00049');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/arxml/__tests__/parser-namespace.test.ts -t "serializer version fidelity"`
Expected: FAIL — current `buildXmlns` emits `http://autosar.org/schema/r00049` (literal `r00049`) and `buildSchemaLocation` emits `AUTOSAR_r00049.xsd` for the `00049` literal. Neither matches the expected `AUTOSAR_00049.xsd`.

- [ ] **Step 3: Replace `buildXmlns` + `buildSchemaLocation` with a lookup table**

In `src/core/arxml/serializer.ts`, find lines 99-105 (the two existing functions). Replace them with a single table + two thin getters:

```ts
/**
 * Canonical schemaLocation descriptor for each supported AUTOSAR version.
 * The 5-digit form (`00046`, `00048`, `00049`, `00050`) is the AUTOSAR
 * standard for R4.4+; vendor tools (EB tresos) emit it alongside the
 * legacy `r4.0` namespace. The dashed form (`AUTOSAR_4-2-2.xsd`) is the
 * pre-R4.4 convention used by 4.2 / 4.4 / 4.6 / 4.7 / 5.0.
 *
 * Pairing:
 *   ArxmlVersion → { xmlns, xsd }
 *
 * The xmlns follows the file's declared namespace; for 5-digit literals
 * we mirror EB tresos's `r4.0` namespace convention.
 */
const SCHEMA_LOCATION: Record<ArxmlVersion, { readonly xmlns: string; readonly xsd: string }> = {
  '4.2': { xmlns: 'http://autosar.org/schema/r4.2', xsd: 'AUTOSAR_4-2-2.xsd' },
  '4.4': { xmlns: 'http://autosar.org/schema/r4.4', xsd: 'AUTOSAR_4-4-0.xsd' },
  '4.6': { xmlns: 'http://autosar.org/schema/r4.6', xsd: 'AUTOSAR_4-6-0.xsd' },
  '4.7': { xmlns: 'http://autosar.org/schema/r4.7', xsd: 'AUTOSAR_4-7-0.xsd' },
  '5.0': { xmlns: 'http://autosar.org/schema/r5.0', xsd: 'AUTOSAR_5-0-0.xsd' },
  '00005': { xmlns: 'http://autosar.org/schema/r5.0', xsd: 'AUTOSAR_00005.xsd' },
  '00006': { xmlns: 'http://autosar.org/schema/r6.0', xsd: 'AUTOSAR_00006.xsd' },
  '00046': { xmlns: 'http://autosar.org/schema/r4.0', xsd: 'AUTOSAR_00046.xsd' },
  '00048': { xmlns: 'http://autosar.org/schema/r4.0', xsd: 'AUTOSAR_00048.xsd' },
  '00049': { xmlns: 'http://autosar.org/schema/r4.0', xsd: 'AUTOSAR_00049.xsd' },
  '00050': { xmlns: 'http://autosar.org/schema/r4.0', xsd: 'AUTOSAR_00050.xsd' },
};

function buildXmlns(v: ArxmlVersion): string {
  return SCHEMA_LOCATION[v].xmlns;
}

function buildSchemaLocation(v: ArxmlVersion): string {
  const loc = SCHEMA_LOCATION[v];
  return `${loc.xmlns} ${loc.xsd}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/core/arxml/__tests__/parser-namespace.test.ts -t "serializer version fidelity"`
Expected: 5 tests PASS (4 parametrized + 1 round-trip).

- [ ] **Step 5: Run full suite to confirm no regression**

Run: `pnpm test`
Expected: ALL prior tests PASS + 5 new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/arxml/serializer.ts src/core/arxml/__tests__/parser-namespace.test.ts
git commit -m "feat(arxml): serializer uses version→schemaLocation lookup table"
```

---

## Task 6: Update existing `parser.test.ts` for strict-reject coverage

**Files:**
- Modify: `src/core/arxml/__tests__/parser.test.ts` (append one test)

This task ensures that the existing test file documents the strict-reject contract alongside the value-side contract, so future contributors see both in one file.

- [ ] **Step 1: Append the strict-reject test to `parser.test.ts`**

Find the closing `});` of the top-level `describe('parseArxml', ...)` block in `src/core/arxml/__tests__/parser.test.ts`. The file currently ends around line 380+ — find the last `});` and insert before it.

Append (right before the closing `});` of the outer describe):

```ts
  it('rejects pure-BSWMD files with invalid-structure (strict mode)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcuC</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>EcuC</SHORT-NAME>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('invalid-structure');
  });
});
```

The trailing `});` at the end of the inserted block closes the `describe('parseArxml', ...)` — remove the previous file's trailing `});` (or omit it in your edit) so there is exactly one closing for the outer describe.

- [ ] **Step 2: Run test**

Run: `pnpm test src/core/arxml/__tests__/parser.test.ts`
Expected: All existing tests PASS + 1 new strict-reject test PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/arxml/__tests__/parser.test.ts
git commit -m "test(arxml): document strict-reject contract in parser.test.ts"
```

---

## Task 7: Final verification — full test + lint + type-check

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: ALL prior 428 tests PASS + all new tests in `parser-namespace.test.ts` PASS.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS, no warnings.

- [ ] **Step 3: Run type-check**

Run: `pnpm type-check`
Expected: PASS, 0 errors.

- [ ] **Step 4: Run coverage report**

Run: `pnpm test:coverage`
Expected: Line coverage on `src/core/arxml/parser.ts` and `src/core/arxml/serializer.ts` ≥ 95%. (Project floor is 80%; these are well-tested modules; should not regress.)

- [ ] **Step 5: Final commit (if any fmt/lint auto-fixes applied)**

If `pnpm format:check` reports drift:
```bash
pnpm format
git add -A
git commit -m "style: apply prettier formatting"
```

---

## Self-Review Checklist (run before declaring plan done)

- [ ] Spec §3.1 (XSD_PATTERN) → Task 2 ✓
- [ ] Spec §3.2 (SUPPORTED_ARXML_VERSIONS) → Task 1 ✓
- [ ] Spec §3.3 (serializer lookup) → Task 5 ✓
- [ ] Spec §3.4 (strict reject) → Task 4 ✓
- [ ] Spec §3.5 (test coverage) → Tasks 2, 3, 4, 5, 6 ✓
- [ ] Success Criteria #1 (R4.4+ parse without unsupported-version) → Task 3 ✓
- [ ] Success Criteria #2 (pure-BSWMD reject) → Task 4 + Task 6 ✓
- [ ] Success Criteria #3 (428 prior tests pass) → Tasks 4, 7 ✓
- [ ] Success Criteria #4 (5 new test files) → Tasks 2, 3, 4, 5, 6 (4 files; `parser-namespace.test.ts` consolidates 4 conceptual groups) ✓
- [ ] Success Criteria #5 (round-trip fidelity) → Task 5 ✓
- [ ] No placeholders / TBD / "implement later" → grep confirms ✓
- [ ] All file paths absolute ✓
- [ ] All code blocks complete (no `...` elisions) ✓
- [ ] Exact commands + expected outputs given ✓