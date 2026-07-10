# v1.37.0 MINOR Implementation Plan — Mutation Engine Purity + Reference Correctness + BSWMD Module-Level Validation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 3 HIGH-severity findings from the v1.36.1 post-ship core review: (C1) `setParamInDocument` + `addChildInDocument` + `removeChildInDocument` mutate `doc.packages[].elements[]` in place; (H1) `addReference` signature has no `value` param but its comment claims it carries user-supplied target path; (H2) `addParameter` + `addReference` skip BSWMD validation at module-level container paths.

**Architecture:** Three surgical fixes in the core data path. C1 makes `core/project/setters.ts` helpers return new `ArxmlDocument` (replaceElement pattern from `core/arxml/mutation.ts`). H1 adds `options?: { value?: string }` to `addReference` signature, default `''` for backward compat. H2 adds a `moduleDef.parameters.some(...)` / `moduleDef.references.some(...)` check at the `subPath === ''` branch of `addParameter` and `addReference`.

**Tech Stack:** Electron + TypeScript 5.6 + React 19 + vitest 3 + jsdom 30+. Pure TypeScript core, no new dependencies.

**Baseline:** v1.36.1 PATCH `c661a13` (3048 + 7 SKIP / 0 fail)
**Target:** 3055 + 7 SKIP / 0 fail (+7 net: 2 setter-purity tests + 1 addReference value test + 4 module-level BSWMD validation tests)

## Global Constraints

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` allowed for defensive warnings.
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task, one task reviewer per task.
- Each task ends with its own test running and passing.
- Test additions must include the covering test command and pass locally before commit.
- Exact values (error kind strings, file paths, function signatures) MUST match this plan verbatim.
- Implementer MUST NOT dispatch `pkm-capture` (parent controller's job — same rule from v1.32.0 T3 finding).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.

---

## Task 1 (C1): `setParamInDocument` + `addChildInDocument` + `removeChildInDocument` return new `ArxmlDocument`

### Files

- Modify: `src/core/project/setters.ts:88-114` (`setParamInDocument`)
- Modify: `src/core/project/setters.ts:116-143` (`addChildInDocument`)
- Modify: `src/core/project/setters.ts:145-159` (`removeChildInDocument`)
- Modify: `src/core/project/setters.ts:160-226` (`spliceContainer` → renamed + restructured + demoted to non-export)
- Modify: `src/core/mutation/applyPatchSteps.ts:243-272` (`applySetParam` consumer)
- Modify: `src/core/mutation/applyPatchSteps.ts:415-510` (`applyReplaceOp` consumer + `applyAddParamStep` if relevant)
- Modify: `src/core/mutation/applyPatchSteps.ts:8-21` (top contract comment block — make truthful post-fix)
- Modify: `src/core/project/__tests__/setters.test.ts` (existing `spliceContainer` imports may need rewiring; add 2 ref-equality tests)
- Test: `src/core/project/__tests__/setters.test.ts` (NEW tests: T1.5 + T1.6 below)

### Interfaces

**Consumes:**

- Existing public API: `setParamInDocument(doc, containerPath, paramName, newValue): void`
- Existing public API: `addChildInDocument(doc, containerPath, newShortName): void`
- Existing public API: `removeChildInDocument(doc, containerPath, shortName): void`

**Produces:**

```ts
export function setParamInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  paramName: string,
  newValue: ParamValue,
): ArxmlDocument; // was void

export function addChildInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  newShortName: string,
): ArxmlDocument; // was void

export function removeChildInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  shortName: string,
): ArxmlDocument; // was void

// Renamed + demoted to non-export internal helper:
function replaceContainer(
  doc: ArxmlDocument,
  path: string,
  container: ArxmlContainer | ArxmlModule,
): ArxmlDocument; // immutably rebuild the doc tree with `container` replacing whatever was at `path`
```

### Why this is C1

The 3 helpers are part of `core/project/` set of standalone utilities that the legacy renderer store used before the `core/arxml/` engine was built. The mutation engine (`core/arxml/mutation.ts`) is immutable — uses `replaceElement` to build a new doc ref. The legacy helpers bypass this by mutating the array in place via `splice(0, pkg.elements.length, ...nextElements)` at setters.ts:212 / 219. `applyPatchSteps.ts:8-21` documents "Mutation semantics … immutable and return new doc refs" but the helpers don't honor it. Today the 2 callers in `applyPatchSteps` are pre-guarded so no throw escapes, but the contract is misleading + the next caller will silently mutate the caller's doc.

### Steps

#### Step 1.1: Write the failing tests (TDD RED — ref-equality must be **different** when helper returns new doc)

Open `src/core/project/__tests__/setters.test.ts` and add 2 tests at the end:

```ts
test('v1.37.0 MINOR T1 (C1) — setParamInDocument returns a NEW doc ref, not the same', () => {
  // Arrange — load a small fixture doc, get a container path
  const doc = loadFixture('SomeVendor/SomeModule/SomeContainer'); // use the file's existing fixture loader
  const originalRef = doc;
  const originalParams = JSON.parse(JSON.stringify(doc.packages[0].elements[0].params)); // deep snapshot

  // Act
  const next = setParamInDocument(doc, '/V/Pkg/Mod/Container', 'someParamName', {
    type: 'integer',
    value: 42,
  });

  // Assert — return is a different reference, but the source doc's params object is unchanged
  expect(next).not.toBe(originalRef);
  expect(doc.packages[0].elements[0].params).toEqual(originalParams); // source tree untouched

  // And the mutation is visible in the new doc
  expect((next.packages[0].elements[0].params['someParamName'] as { value: number }).value).toBe(
    42,
  );
});

test('v1.37.0 MINOR T1 (C1) — addChildInDocument returns a NEW doc ref, source tree untouched', () => {
  const doc = loadFixture('SomeVendor/SomeModule/SomeContainer');
  const originalRef = doc;
  const originalChildrenLen = doc.packages[0].elements[0].children.length;
  const shortName = `newChild-${Date.now()}`;

  const next = addChildInDocument(doc, '/V/Pkg/Mod/Container', shortName);

  expect(next).not.toBe(originalRef);
  expect(doc.packages[0].elements[0].children.length).toBe(originalChildrenLen);

  // new doc has the child
  expect(next.packages[0].elements[0].children.some((c) => c.shortName === shortName)).toBe(true);
});
```

**Adapt fixture names and loader to whatever the existing test file uses.** Read the existing `src/core/project/__tests__/setters.test.ts` first to match its conventions for loading fixtures (probably `loadFixture()` or `parseArxmlLite()` from `core/arxml/`).

#### Step 1.2: Run tests to verify they fail

Run: `pnpm exec vitest run src/core/project/__tests__/setters.test.ts`
Expected: 2 NEW tests FAIL — the current helpers return `void`, so `next` is `undefined` (not a doc ref). The `expect(next).not.toBe(originalRef)` assertion fails because `expect(undefined).not.toBe(...)` is `true` BUT the subsequent `.packages[0]` accesses throw on undefined.

If the tests fail with TypeError "Cannot read property 'packages' of undefined" — that's the intended RED (return is void).

If the tests already pass — STOP, the helpers already return new docs. Don't proceed.

#### Step 1.3: Rename `spliceContainer` to `replaceContainer` + restructure to be immutable

In `src/core/project/setters.ts`, find the existing `spliceContainer` function (around line 173-226). Refactor:

```ts
/**
 * Replace the container at `path` with a new container value.
 *
 * Returns a new `ArxmlDocument` (the original is unchanged — immutable
 * update pattern, mirroring `replaceElement` in `core/arxml/mutation.ts`).
 * The walk supports 2 layers (pkg.elements + first-level pkg.packages[*].elements)
 * — same depth as `findContainerByPath` above. Deeper vendor-package nesting
 * is out of scope for v1.37.0 (deferred to L2 PATCH chain).
 *
 * Throws if `path` is not reachable (this matches the prior contract; the
 * 2 callers — applyPatchSteps + tests — pre-flight with findContainerByPath).
 */
function replaceContainer(
  doc: ArxmlDocument,
  path: string,
  container: ArxmlContainer | ArxmlModule,
): ArxmlDocument {
  // Walk to find which package owns this container, mirroring findContainerByPath
  for (const pkg of doc.packages) {
    const nextPkg = replaceInList(pkg, '/', path, container);
    if (nextPkg !== pkg) {
      // Build new doc with this package replaced
      const nextPackages = doc.packages.map((p) => (p === pkg ? nextPkg : p));
      return { ...doc, packages: nextPackages };
    }
    if (pkg.packages) {
      for (const sub of pkg.packages) {
        const nextSub = replaceInList(sub, `/${pkg.shortName}`, path, container);
        if (nextSub !== sub) {
          const nextSubPackages = pkg.packages.map((p) => (p === sub ? nextSub : p));
          const nextPkgWithSubs = { ...pkg, packages: nextSubPackages };
          const nextPackages = doc.packages.map((p) => (p === pkg ? nextPkgWithSubs : p));
          return { ...doc, packages: nextPackages };
        }
      }
    }
  }
  throw new Error(`replaceContainer: path ${path} not reachable from document root`);
}

// helper: walk element list under a base path; if match found, rebuild
// the owning package/sub-package with the new container splice.
function replaceInList(
  pkg: ArxmlPackage | ArxmlSubPackage,
  basePath: string,
  targetPath: string,
  container: ArxmlContainer | ArxmlModule,
): typeof pkg {
  // ... (write a recursive helper that returns a new pkg if the target
  // path is inside it, or returns the same pkg if not. If found, replaces
  // the matched element with `container`.)
}
```

**`replaceInList` implementation guidance** (full code is required; here's the shape):

```ts
function replaceInList(
  pkg: ArxmlPackage | ArxmlSubPackage,
  basePath: string,
  targetPath: string,
  container: ArxmlContainer | ArxmlModule,
): typeof pkg {
  // Returns SAME ref if nothing changed; new ref with replacement if found.
  // Walks pkg.elements; if targetPath === `${basePath}/${el.shortName}` and (el is module/container), return new elements list.
  // Else for el.kind === 'container', recurse into el.children with extended basePath.
  // If found in a sub-tree, rebuild that el with new children; map the elements list with the replacement.
}
```

Use the existing `ArxmlElement` / `ArxmlPackage` / `ArxmlSubPackage` types. Read the existing `spliceContainer` body (lines 173-226) for the walk semantics — convert to immutable.

#### Step 1.4: Update `setParamInDocument` to return new doc

Edit `src/core/project/setters.ts:88-114`:

```ts
export function setParamInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  paramName: string,
  newValue: ParamValue,
): ArxmlDocument {
  // ← return new doc
  const target = findContainerByPath(doc, containerPath);
  if (target === null) {
    throw new Error(`setParam: container ${containerPath} not found`);
  }
  if (!(paramName in target.params)) {
    throw new Error(`setParam: param "${paramName}" not found at ${containerPath}`);
  }
  const nextParams: Record<string, ParamValue> = { ...target.params };
  const existing = nextParams[paramName]!;
  // ... same logic for value/dest merge ...
  return replaceContainer(doc, containerPath, { ...target, params: nextParams });
}
```

The body is the same except `spliceContainer(...)` becomes `return replaceContainer(...)` and the return type becomes `ArxmlDocument`.

#### Step 1.5: Update `addChildInDocument` to return new doc

Edit `src/core/project/setters.ts:116-143`:

```ts
export function addChildInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  newShortName: string,
): ArxmlDocument {
  const target = findContainerByPath(doc, containerPath);
  if (target === null) {
    throw new Error(`addChild: container ${containerPath} not found`);
  }
  // ... duplicate-check same ...
  const newChild: ArxmlContainer = { kind: 'container', ... };
  const nextChildren: readonly ArxmlElement[] = [...target.children, newChild];
  return replaceContainer(doc, containerPath, { ...target, children: nextChildren });
}
```

#### Step 1.6: Update `removeChildInDocument` to return new doc

Edit `src/core/project/setters.ts:145-159`:

```ts
export function removeChildInDocument(
  doc: ArxmlDocument,
  containerPath: string,
  shortName: string,
): ArxmlDocument {
  const target = findContainerByPath(doc, containerPath);
  if (target === null) return doc; // no-op, return same ref
  const nextChildren: readonly ArxmlElement[] = target.children
    .filter
    // ... same filter logic ...
    ();
  if (nextChildren.length === target.children.length) return doc; // not found → no-op, return same ref
  return replaceContainer(doc, containerPath, { ...target, children: nextChildren });
}
```

Note the early-return `return doc` for no-op cases — this preserves ref-equality: if nothing changed, return the same ref so callers can short-circuit `if (next === doc) return`.

#### Step 1.7: Update consumers in `applyPatchSteps.ts`

Edit `src/core/mutation/applyPatchSteps.ts:243-272` (`applySetParam`):

```ts
// was: setParamInDocument(doc, containerPath, paramName, coerced);  // void
// now:
const nextDoc = setParamInDocument(doc, containerPath, paramName, coerced);
```

Then use `nextDoc` instead of `doc` in the subsequent `findContainerByPath(nextDoc, ...)` call at line 263-272.

Edit `applyReplaceOp` similarly — search for `setParamInDocument` calls; each gets the returned new doc.

Edit `applyAddParamStep` if it also calls `setParamInDocument`. (Read `applyPatchSteps.ts` and grep for callsites.)

#### Step 1.8: Update the top comment block

Edit `src/core/mutation/applyPatchSteps.ts:8-21`. Replace:

```ts
// Mutation semantics: the `add-child` and `remove-with-cascade`
// ops delegate to `coreAddContainer` / `coreRemoveWithCascade`,
// which are immutable and return new doc refs. The `set-param`
// op delegates to the legacy `setParamInDocument` helper, which
// mutates the doc in place (Sprint 14-era API; pre/post value
// snapshots detect "did anything change?" for the `applied`
// counter). The `add` / `remove` / `replace` RFC 6902 subset ops
// route through the same backends. Callers that rely on doc
// reference equality to detect mutation MUST use `applied` or
// re-walk the doc tree instead.
```

With:

```ts
// Mutation semantics: all ops are immutable and return new doc refs.
// The `add-child` and `remove-with-cascade` ops delegate to
// `coreAddContainer` / `coreRemoveWithCascade` (both immutable).
// The `set-param` op delegates to `setParamInDocument` (also
// immutable as of v1.37.0 — returns a new ArxmlDocument, never
// mutates in place). Reference-equality (`nextDoc !== doc`) is
// the authoritative "did anything change?" signal; the
// `applied` counter tracks the per-step applied count for
// CLI reporting.
```

#### Step 1.9: Run tests + typecheck

Run:

```bash
pnpm exec vitest run src/core/project/__tests__/setters.test.ts
pnpm exec vitest run src/core/mutation/__tests__/  # or wherever applyPatchSteps tests live
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec tsc --noEmit -p tsconfig.web.json
```

Expected:

- setters tests: all 2 new T1 tests PASS + pre-existing tests still PASS
- applyPatchSteps tests: all PASS (ref-equality callers updated)
- tsc clean on both projects

#### Step 1.10: Commit

```bash
git add src/core/project/setters.ts \
        src/core/project/__tests__/setters.test.ts \
        src/core/mutation/applyPatchSteps.ts \
        src/core/mutation/__tests__/   # if test files were touched
git commit -m "fix(core): v1.37.0 MINOR T1 (C1) — setParamInDocument + addChildInDocument + removeChildInDocument return new ArxmlDocument

The 3 core/project/ helpers previously mutated
doc.packages[].elements[] in place via spliceContainer
(setters.ts:212, 219). applyPatchSteps.ts:8-21 documented
'immutable and return new doc refs' but the helpers didn't
honor it. Today's 2 callsites (applySetParam + applyReplaceOp)
both pre-flight with findContainerByPath so the throws never
escape, but the contract was misleading and any future caller
would silently mutate the caller's doc.

C1 makes all 3 helpers return ArxmlDocument. Implementation:
- spliceContainer renamed to replaceContainer; demoted from
  export to file-private. New implementation walks the same
  2-layer pkg.elements + first-level pkg.packages structure
  as findContainerByPath (deeper walks are out of scope —
  deferred to L2 PATCH chain).
- setParamInDocument builds nextParams + returns
  replaceContainer(doc, path, { ...target, params }).
- addChildInDocument appends to children + returns new doc.
- removeChildInDocument returns same ref when no-op (preserves
  ref-equality for short-circuit), new ref when child removed.
- applySetParam + applyReplaceOp updated to capture returned
  nextDoc. applyPatchSteps.ts:8-21 top comment block updated
  to mark 'all ops immutable, ref-equality safe' (removes the
  'must use applied' excuse).

+2 tests in setters.test.ts: setParam returns new ref (source
tree untouched); addChild returns new ref (source tree untouched).
tsc clean on both projects."
```

---

## Task 2 (H1): `addReference` accepts `options?: { value?: string }` for user-supplied path

### Files

- Modify: `src/core/arxml/mutation.ts:680-754` (`addReference` signature + idempotent branch)
- Test: `src/core/arxml/__tests__/mutation.test.ts` (1 NEW test: seeded-then-addReference with non-empty value)

### Interfaces

**Consumes:**

- Existing: `addReference(doc, pkg, parent, containerPath, moduleDef, refDef): MutationResult`

**Produces:**

```ts
export function addReference(
  doc: ArxmlDocument,
  pkg: ArxmlPackage,
  parent: ArxmlModule | ArxmlContainer,
  containerPath: string,
  moduleDef: BswmdModuleDefinition,
  refDef: ReferenceDefinition,
  options?: { value?: string }, // v1.37.0 MINOR T2 (H1) — user-supplied target path
): MutationResult;
```

The idempotent branch (line 719-726) uses `options?.value ?? ''` as the new `value`. The fresh-write branch (line 738-753) gets the same treatment.

### Why this is H1

The idempotent branch's code comment (mutation.ts:721-722) says:

> "Replace its value with the new one — which carries the user-supplied target path"

But the implementation hard-codes `value: ''`. The `refDef` parameter has a `.path: string` field but `refDef.path` is only used for `definitionRef`, never for `value`. There is no `value` arg on the function signature, so the comment is documentary fraud. A user who picks a target path (`refDef.path === '/ar_pkg/...'`) gets `value: ''` and `definitionRef: refDef.path` — the comment promised the user path went into `value`; it actually went into `definitionRef`.

The downstream renderer that reads `record.value` to display the picked target will see `''` not the picked path. The mutation.tests only cover fresh-write (value='') and name-conflict — not the seeded-then-addReference branch.

### Steps

#### Step 2.1: Write the failing test

Open `src/core/arxml/__tests__/mutation.test.ts`. Read the existing `addReference` tests (around line 893-949 per reviewer's citation — verify). Add a NEW test:

```ts
test('v1.37.0 MINOR T2 (H1) — seeded-then-addReference with non-empty value option fills value', () => {
  // Arrange — seed an empty reference on the parent (matches the v1.27.2 PATCH auto-seed pattern)
  const seededDoc = addReference(/* fresh args */).value;  // first call seeds the empty reference
  const parent = findParentForTest(seededDoc, ...);
  const pkg = seedDoc.packages[0];

  const USER_PICKED_PATH = '/ar_pkg/PduR/SomeContainer';
  const refDef: ReferenceDefinition = {
    shortName: 'didRef',
    destKind: 'ECUC-PARAM-CONF-CONTAINER-DEF',
    path: USER_PICKED_PATH,
  };

  // Act — re-call addReference on the seeded shortName with value option
  const result = addReference(
    seededDoc, pkg, parent,
    containerPath, moduleDef, refDef,
    { value: USER_PICKED_PATH },  // NEW option
  );

  // Assert — the idempotent branch hit, and value is filled
  expect(result.ok).toBe(true);
  const ref = (result.ok ? findReferenceForTest(result.value, refDef.shortName) : null);
  expect(ref.value).toBe(USER_PICKED_PATH);  // not ''!
  expect(ref.definitionRef).toBe(USER_PICKED_PATH);
});
```

**Adapt to the file's fixture / helper conventions.** Use the same moduleDef + container fixtures used in existing `addReference` tests; read the file to match.

#### Step 2.2: Run test to verify it fails

Run: `pnpm exec vitest run src/core/arxml/__tests__/mutation.test.ts -- -t "seeded-then-addReference"`
Expected: FAIL with `Expected: '/ar_pkg/PduR/SomeContainer' / Received: ''` — the idempotent branch sets `value: ''`.

#### Step 2.3: Update `addReference` signature + idempotent branch

Edit `src/core/arxml/mutation.ts:680-754`:

```ts
// New signature:
export function addReference(
  doc: ArxmlDocument,
  pkg: ArxmlPackage,
  parent: ArxmlModule | ArxmlContainer,
  containerPath: string,
  moduleDef: BswmdModuleDefinition,
  refDef: ReferenceDefinition,
  // v1.37.0 MINOR T2 (H1) — optional user-supplied target path. The
  // idempotent overwrite branch (when the param was auto-seeded empty
  // by addContainer) writes this into the stored ParamValue's `value`
  // field (previously hard-coded to '' despite the comment claiming
  // it carried the user path — see H1 review finding). Defaults to
  // '' for backward compat with callers that don't pass the option.
  options?: { value?: string },
): MutationResult {
  // ... existing module/parent checks ...
  // ... existing subPath === '' branch (T3 will add the validation) ...
  if (Object.prototype.hasOwnProperty.call(parent.params, refDef.shortName)) {
    // Idempotent branch:
    const existing: ParamValue | undefined = parent.params[refDef.shortName];
    if (
      existing !== undefined &&
      existing.type === 'reference' &&
      existing.value === '' &&
      existing.dest === refDef.destKind
    ) {
      const userValue = options?.value ?? '';
      const nextValue: ParamValue =
        refDef.path !== ''
          ? ({ ...existing, value: userValue, definitionRef: refDef.path } as ParamValue)
          : existing;
      // ... rest of body unchanged (build nextParams + replaceElement) ...
    }
    return { ok: false, error: { kind: 'name-conflict', shortName: refDef.shortName } };
  }
  // Fresh-write branch:
  const userValue = options?.value ?? '';
  const nextValue: ParamValue = makeReferenceParamValue({
    value: userValue,
    dest: refDef.destKind,
    definitionRef: refDef.path,
  });
  // ... rest of body unchanged ...
}
```

The fresh-write branch also gets `options?.value` — this is more consistent than only the idempotent branch.

#### Step 2.4: Run test to verify it passes

Run: `pnpm exec vitest run src/core/arxml/__tests__/mutation.test.ts`
Expected: 1 NEW test PASS, all pre-existing tests still PASS.

#### Step 2.5: Typecheck

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: clean. No other callsites to update (the option is optional).

#### Step 2.6: Commit

```bash
git add src/core/arxml/mutation.ts src/core/arxml/__tests__/mutation.test.ts
git commit -m "fix(core): v1.37.0 MINOR T2 (H1) — addReference accepts user-supplied value via options bag

The idempotent branch's code comment claimed 'Replace its value
with the new one — which carries the user-supplied target path'
but the implementation hard-coded value: ''. The refDef param
has a .path field but it was only used for definitionRef —
never for value. The function signature had no value argument,
so the comment was documentary fraud.

H1 closes by adding options?: { value?: string } to the
addReference signature (default '' for backward compat). The
idempotent branch writes options?.value into the stored
ParamValue's value field; the fresh-write branch is updated
to the same treatment (consistency). Both align with the
documented intent.

+1 test: seeded-then-addReference with non-empty value option
fills the stored ParamValue's value field (not '').
tsc clean."
```

---

## Task 3 (H2): module-level BSWMD validation in `addParameter` + `addReference`

### Files

- Modify: `src/core/arxml/mutation.ts:554-569` (`addParameter` `subPath === ''` branch + validation block)
- Modify: `src/core/arxml/mutation.ts:690-701` (`addReference` `subPath === ''` branch + validation block)
- Test: `src/core/arxml/__tests__/mutation.test.ts` (4 NEW tests — 2 per helper: declared passes, undeclared errors)

### Interfaces

**Consumes:** the optional `moduleDef.parameters[]` / `moduleDef.references[]` arrays present on every BSWMD module definition.

**Produces:** validation logic that, when `subPath === ''` (container path is at module root), checks `moduleDef.parameters.some(p => p.shortName === paramDef.shortName)` for `addParameter` and `moduleDef.references.some(r => r.shortName === refDef.shortName)` for `addReference`. Both return the same `{ ok: false, error: { kind: 'invalid-param-type', ... } }` shape.

### Why this is H2

The current code:

```ts
if (subPath !== '') {
  const parentContainerDef = getContainerDefByPath(moduleDef, subPath);
  if (parentContainerDef === null || !parentContainerDef.parameters.some((p) => p.shortName === paramDef.shortName)) {
    return { ok: false, error: { kind: 'invalid-param-type', ... } };
  }
}
// ELSE: subPath === '' — skip validation entirely
```

The comment notes "modules rarely carry parameters" as the justification. AUTOSAR modules DO have top-level parameters (e.g. `EcuC` has `<ModuleId>`, `<VendorId>`) and references (e.g. `PduR`'s `<PduRBswImplication>` reference). The fix checks the module's own `parameters[]` / `references[]` arrays when subPath is empty — defending against stale paramDef/refDef, restoring defence-in-depth.

### Steps

#### Step 3.1: Write the failing tests

Open `src/core/arxml/__tests__/mutation.test.ts`. Locate the existing `addParameter` and `addReference` test sections. Add 4 NEW tests:

```ts
// 2 for addParameter:
test('v1.37.0 MINOR T3 (H2) — addParameter at module-level with declared paramDef passes', () => {
  const moduleDef = makeModuleDefWithParams({ shortName: 'ModuleId' });  // existing fixture helper
  const paramDef: ParameterDefinition = { shortName: 'ModuleId', type: 'integer' };
  const result = addParameter(/* ... */, moduleDef, paramDef, /* containerPath ending at module segment */);
  expect(result.ok).toBe(true);
});

test('v1.37.0 MINOR T3 (H2) — addParameter at module-level with UNDECLARED paramDef returns invalid-param-type error', () => {
  const moduleDef = makeModuleDefWithParams({});  // no params
  const paramDef: ParameterDefinition = { shortName: 'NotDeclared', type: 'integer' };
  const result = addParameter(/* ... */, moduleDef, paramDef, /* module-level */);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.kind).toBe('invalid-param-type');
  }
});

// 2 for addReference:
test('v1.37.0 MINOR T3 (H2) — addReference at module-level with declared refDef passes', () => {
  const moduleDef = makeModuleDefWithRefs({ shortName: 'DidRef' });
  const refDef: ReferenceDefinition = { shortName: 'DidRef', destKind: '...', path: '/...' };
  const result = addReference(/* ... */, moduleDef, refDef);
  expect(result.ok).toBe(true);
});

test('v1.37.0 MINOR T3 (H2) — addReference at module-level with UNDECLARED refDef returns invalid-param-type error', () => {
  const moduleDef = makeModuleDefWithRefs({});
  const refDef: ReferenceDefinition = { shortName: 'NotDeclared', destKind: '...', path: '' };
  const result = addReference(/* ... */, moduleDef, refDef);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.kind).toBe('invalid-param-type');
  }
});
```

**Adapt to the file's fixture conventions** — match the helper names used by the existing tests.

#### Step 3.2: Run tests to verify they fail

Run: `pnpm exec vitest run src/core/arxml/__tests__/mutation.test.ts -- -t "module-level"`
Expected: 4 NEW tests FAIL — the undeclared cases currently succeed silently (the validation skip). Declared cases pass by chance because the test setup doesn't reach any code path that errors.

#### Step 3.3: Add module-level BSWMD validation to `addParameter`

Edit `src/core/arxml/mutation.ts:554-569`. Update the validation block:

```ts
// Cross-reference the `paramDef` against the BSWMD container's
// declared parameters OR, for module-level container paths
// (subPath === ''), the module's own declared parameters.
// The picker is the happy-path source; this is defence-in-depth.
const subPath = containerPathToSubPath(containerPath, moduleDef);
if (subPath === null) {
  return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
}
if (subPath !== '') {
  // Sub-container: validate against the parent container def
  const parentContainerDef = getContainerDefByPath(moduleDef, subPath);
  if (
    parentContainerDef === null ||
    !parentContainerDef.parameters.some((p) => p.shortName === paramDef.shortName)
  ) {
    return {
      ok: false,
      error: { kind: 'invalid-param-type', key: paramDef.shortName, expected: 'string' },
    };
  }
} else {
  // v1.37.0 MINOR T3 (H2) — module-level: validate against module
  // root's own declared parameters. "Modules rarely carry parameters"
  // is no longer an excuse to skip validation — AUTOSAR modules
  // like EcuC do declare top-level parameters (ModuleId, VendorId).
  if (!moduleDef.parameters.some((p) => p.shortName === paramDef.shortName)) {
    return {
      ok: false,
      error: { kind: 'invalid-param-type', key: paramDef.shortName, expected: 'string' },
    };
  }
}
```

#### Step 3.4: Add module-level BSWMD validation to `addReference`

Edit `src/core/arxml/mutation.ts:690-701`. Mirror the same change for the `addReference` validation block — the `subPath === ''` branch now checks `moduleDef.references.some(...)`:

```ts
if (subPath !== '') {
  const parentContainerDef = getContainerDefByPath(moduleDef, subPath);
  if (
    parentContainerDef === null ||
    !parentContainerDef.references.some((r) => r.shortName === refDef.shortName)
  ) {
    return {
      ok: false,
      error: { kind: 'invalid-param-type', key: refDef.shortName, expected: 'string' },
    };
  }
} else {
  // v1.37.0 MINOR T3 (H2) — module-level reference validation
  if (!moduleDef.references.some((r) => r.shortName === refDef.shortName)) {
    return {
      ok: false,
      error: { kind: 'invalid-param-type', key: refDef.shortName, expected: 'string' },
    };
  }
}
```

#### Step 3.5: Run tests + typecheck

Run:

```bash
pnpm exec vitest run src/core/arxml/__tests__/mutation.test.ts
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: 4 NEW tests PASS, all pre-existing tests still PASS, tsc clean.

#### Step 3.6: Commit

```bash
git add src/core/arxml/mutation.ts src/core/arxml/__tests__/mutation.test.ts
git commit -m "fix(core): v1.37.0 MINOR T3 (H2) — module-level BSWMD validation in addParameter + addReference

addParameter and addReference previously skipped BSWMD
validation when containerPath resolved to the module root
(subPath === ''). The justification was 'modules rarely carry
parameters' — but AUTOSAR modules do declare top-level
parameters (EcuC has ModuleId/VendorId) and references (PduR
has PduRBswImplication). The skip was defence-in-depth
breach: a stale paramDef/refDef could slip through.

H2 adds the else branch: when subPath === '', validate
against moduleDef.parameters (for addParameter) or
moduleDef.references (for addReference). Same error kind
('invalid-param-type') as the sub-container path.

+4 tests: addParameter declared-passes / undeclared-errors;
addReference declared-passes / undeclared-errors, each at
module-level container path.
tsc clean."
```

---

## Task 4: release-notes + CHANGELOG + progress ledger + applyPatchSteps top comment update verification

### Files

- Modify: `docs/release-notes/v1.37.0/README.md` (NEW)
- Modify: `CHANGELOG.md` (add v1.37.0 MINOR row above v1.36.1)
- Modify: `.git/sdd/progress-v1.37.0.md` (NEW)

### Why this task

Release-artifact baseline (3 locations) matches v1.36.0 + v1.36.1 conventions. The applyPatchSteps top comment was already updated in T1 (Step 1.8); T4 verifies it landed correctly + writes the public release artifacts.

### Steps

#### Step 4.1: Verify T1's comment update landed

Run: `grep -A 3 "Mutation semantics" src/core/mutation/applyPatchSteps.ts`
Expected: the v1.37.0-true version (no "mutates the doc in place" excuse).

If it didn't land, dispatch a quick fixer — but this should already be in T1's diff.

#### Step 4.2: Write v1.37.0 README release notes

Create `docs/release-notes/v1.37.0/README.md`. Read `docs/release-notes/v1.36.0/README.md` and `docs/release-notes/v1.36.1/README.md` to mirror the format. Cover:

- **Title:** "v1.37.0 MINOR — Mutation Engine Purity + Reference Correctness + BSWMD Module-Level Validation"
- **What shipped (C1 + H1 + H2, with file:line citations):**
  - C1 — `setParamInDocument` + `addChildInDocument` + `removeChildInDocument` now return `ArxmlDocument` (immutable). Replaces the legacy in-place `spliceContainer` mutation pattern.
  - H1 — `addReference` accepts optional `{ value?: string }` for user-supplied target path. Idempotent + fresh-write branches both use the option (default `''` for backward compat).
  - H2 — `addParameter` + `addReference` validate against `moduleDef.parameters[]` / `moduleDef.references[]` when container path is at module root (`subPath === ''`). Restores defence-in-depth for the module-level path.
- **Test budget:** 3055 + 7 SKIP / 0 fail (+7 net from v1.36.1's 3048).
- **Lessons (NEW):**
  1. `legacy-mutation-helper-bypasses-documented-immutable-contract` — when a public API documents "immutable" but a legacy helper mutates in place, refactor the helper to return new refs; mirrors the immutable engines in the same file.
  2. `api-comment-vs-implementation-divergence-is-a-symptom-of-an-api-gap` — when a code comment claims behavior the implementation doesn't deliver, the function signature is missing a parameter. Add the parameter (defaults to current behavior), let the comment become true.
  3. `conditional-validation-skip-with-justification-still-skips-validation` — "rarely" ≠ "never". When a guard has `if (...)` justification, the `else` should validate against the right other-def, not skip.
- **Known follow-ups (deferred to v1.37.x + PATCH chain):** C1 siblings (L2 deep-walk, M1 equality, M3 dest equality, M4 permissive fallback, L1 null coerce).

#### Step 4.3: Update CHANGELOG

Edit `CHANGELOG.md`. Add a v1.37.0 MINOR row above v1.36.1. Use the same format as v1.36.0/v1.36.1 rows.

#### Step 4.4: Write progress ledger

Create `.git/sdd/progress-v1.37.0.md`. Read `.git/sdd/progress-v1.36.1.md` for format. Cover T1-T4 + ship task with commit SHAs + test results + reviewer verdicts.

#### Step 4.5: Run pnpm verify 7-stage GREEN

Run: `pnpm verify`
Expected: 7 stages green, exit 0. If any stage fails, STOP — don't ship.

Record the output in the progress ledger ("pnpm verify GREEN 2026-07-08").

#### Step 4.6: Commit release artifacts

```bash
git add docs/release-notes/v1.37.0/README.md CHANGELOG.md .git/sdd/progress-v1.37.0.md
git commit -m "docs(release): v1.37.0 MINOR T4 — release notes + CHANGELOG + progress ledger"
```

Do NOT ship yet — T5.

---

## Task 5: ship v1.37.0 MINOR

### Files

- Modify: local git state (tag, push)
- Verify: GH release

### Steps

#### Step 5.1: Pre-ship sanity check

Run:

```bash
git status  # clean tree
git log --oneline origin/main..HEAD  # exactly 5 commits (T1+T2+T3+T4 + fixup if needed)
pnpm verify  # still GREEN
```

If any check fails, STOP — fix before pushing.

#### Step 5.2: Push commits to origin/main

```bash
git push origin main
```

If `github.com:443` blocked, wait 90s and retry. If still blocked, use Tier 3 (`scripts/tier3_push.py`).

#### Step 5.3: Create v1.37.0 tag

```bash
git tag -a v1.37.0 -m "v1.37.0 MINOR — Mutation engine purity + reference correctness + BSWMD module-level validation"
git log --oneline -1 v1.37.0
git log --oneline -1 HEAD
# Both should match
```

#### Step 5.4: Push tag (no --follow-tags)

```bash
git push origin v1.37.0
```

If blocked, use `gh api repos/jasontaotao/claude-autosar-cfg/git/refs/tags/v1.37.0 -X POST --field sha=... --field ref=refs/tags/v1.37.0`.

#### Step 5.5: Create GH release

```bash
gh release create v1.37.0 \
  --title "v1.37.0 MINOR" \
  --notes-file docs/release-notes/v1.37.0/README.md
```

If `gh release create` complains, fall back to `--generate-notes` flag.

#### Step 5.6: Verify release + record ship state

Run: `gh release view v1.37.0 --json tagName,publishedAt,url`

Append the final state to `.git/sdd/progress-v1.37.0.md` ("Ship" section with GH release URL + commit SHA + push command output).

#### Step 5.7: Final commit

```bash
git add .git/sdd/progress-v1.37.0.md
git commit -m "docs(ship): v1.37.0 MINOR T5 — record GH release URL + ship state"
git push origin main
```

---

## Self-Review

### 1. Spec coverage — finding → task mapping

- **C1** (setParamInDocument + addChild + removeChild immutability) → T1. ✓
- **H1** (addReference value parameter) → T2. ✓
- **H2** (module-level BSWMD validation in addParameter + addReference) → T3. ✓
- **L2** (deeply nested vendor package walk) → Deferred to v1.37.x PATCH chain. ✓
- **M1 / M3 / M4 / L1** → Deferred to v1.37.x PATCH chain. ✓

### 2. Placeholder scan

- All test code shown verbatim. No "appropriate test" / "similar to above" placeholders.
- All commands have expected output spelled out.
- No "implement later" / TBD strings.
- `replaceInList` body described in prose with shape — implementer should write the recursion, but the signature + the call pattern is fixed. (Spec provides the complete signature + calling code; only the recursion body has prose. If this becomes ambiguous during implementation, escalate.)

### 3. Type consistency

- `addReference` signature change in T2 — `options?: { value?: string }` is additive (optional). Existing callers passing positional args still compile (TS treats missing optional as `undefined`). ✓
- `replaceContainer` is a NEW private name; the old `spliceContainer` is no longer exported (T1.3). Any test that imports `spliceContainer` (per reviewer's note at `src/core/project/__tests__/setters.test.ts:??`) needs to remove that import. T1.1 instructs the implementer to read the existing test file first. ✓
- T1.7 applies the return-value capture to all 3 known callsites (`setParamInDocument` + potentially `applyAddParamStep`). Implementer must grep for both names.

### 4. Reverse-closes

No specific feature-delivery promise; closes review findings from the v1.36.1 post-ship core review session.

### 5. Cross-version consistency

- v1.36.0 + v1.36.1 lessons were about persistence-layer (history file + JSON validation + single source-of-truth). v1.37.0 lessons are about mutation-engine (immutability + API gap + BSWMD validation gap). Different scope, same 1-of-1 lesson style. ✓
