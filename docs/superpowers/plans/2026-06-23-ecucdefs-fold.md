# EcucDefs Fold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th fold trigger to `foldVendorPackages` so `EcucDefs` (carrying exactly one `<ECUC-MODULE-CONFIGURATION-VALUES>`) collapses into the parent AR-PACKAGE, matching the existing vendor fold UX.

**Spec reference:** `docs/superpowers/specs/2026-06-23-ecucdefs-fold-design.md`

**Architecture:**

- 1 helper constant added to `foldPackage` in `combinedDoc.ts`
- 1 disjunct added to `isFoldableHere`
- 4 test cases added to `combinedDoc.test.ts`
- 0 IPC changes
- 0 store action changes
- 0 i18n key changes (no new user-facing strings)
- 0 CSS / component changes (fold is invisible to the renderer beyond the depth delta)

**Tech Stack:** existing — TypeScript 5 strict + Vitest 1.

---

## 起点状态 (2026-06-23)

| 项                   | 状态                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `local HEAD`         | `5b425c4` on `feature/sprint-x-vendor-prefix` (6 commits ahead of `origin/main = fff92a5`)                                            |
| Working tree         | clean (4 untracked docs from this design session only)                                                                                |
| Tests baseline       | TBD — run `pnpm exec vitest run` first; the Sprint X WIP added 333+ lines to `combinedDoc.test.ts` and ~240 lines to `combinedDoc.ts` |
| v1.9.0 SHIPPED       | at `599a417` on `main` per `chore(release): v1.9.0` commit                                                                            |
| branch for this work | `feature/v1-9-1-ecucdefs-fold` from `5b425c4`                                                                                         |

**Compatibility note**: existing EcucDefs tests in `combinedDoc.test.ts`
(line 142, 275, 287, 323 — all under `describe('computeDisplayDoc vendor fold (Sprint X T7)')`)
exercise `EcucDefs (elements: []) > nested pkg` shapes only. Tier 4 fires
only on `EcucDefs (elements: [module])` with no sub-packages — **strictly
disjoint** from existing cases. No test modifications needed.

---

## Conventions

- **TDD**: every task writes the failing test FIRST, then the minimal implementation
- **Coverage floor**: ≥ 80% overall; pure functions aim ≥ 95% (helper is at 100% in current state)
- **No `any`** in production code
- **Immutability**: helper returns a new ArxmlPackage; never mutates input
- **Frequent commits**: one commit per task minimum

---

### Task 1: 4 failing tests in `combinedDoc.test.ts` (RED)

**Files:**

- Modify: `src/renderer/store/helpers/__tests__/combinedDoc.test.ts`

- [ ] **Step 1: Add `makeEcucDefsDoc` helper at top of file (after existing `makeBswmd`)**

```ts
/**
 * Build a doc shaped like the Adc skeleton output: a wrap package
 * (e.g. `AUTOSAR_R22`) optionally containing `EcucDefs`, which in
 * turn contains a single module element directly in its `elements`
 * (mirrors skeleton.ts:115-175 where the module is emitted into
 * `pkg.elements`, not into a sub-package).
 */
function makeEcucDefsDoc(opts: {
  wrapShortName: string | null;
  moduleShortName: string;
}): ArxmlDocument {
  const moduleEl: ArxmlElement = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: opts.moduleShortName,
    params: {},
    children: [],
    references: [],
  };
  const ecucDefsPkg: ArxmlPackage = {
    shortName: 'EcucDefs',
    path: opts.wrapShortName === null ? '/EcucDefs' : `/${opts.wrapShortName}/EcucDefs`,
    elements: [moduleEl],
  };
  if (opts.wrapShortName === null) {
    return {
      path: '/test',
      version: '4.6',
      packages: [ecucDefsPkg],
    };
  }
  const wrapPkg: ArxmlPackage = {
    shortName: opts.wrapShortName,
    path: `/${opts.wrapShortName}`,
    elements: [],
    packages: [ecucDefsPkg],
  };
  return {
    path: '/test',
    version: '4.6',
    packages: [wrapPkg],
  };
}

/**
 * Build an EcucDefs pkg that has MORE than one element (mixed module
 * + reference). Used to verify the new tier refuses to fold in this
 * case.
 */
function makeEcucDefsMixedDoc(): ArxmlDocument {
  const moduleEl: ArxmlElement = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Adc',
    params: {},
    children: [],
    references: [],
  };
  const refEl: ArxmlElement = {
    kind: 'reference',
    tagName: 'ECUC-REFERENCE-VALUE',
    shortName: 'DemoRef',
    params: {},
    children: [],
    references: [],
  };
  const ecucDefsPkg: ArxmlPackage = {
    shortName: 'EcucDefs',
    path: '/EcucDefs',
    elements: [moduleEl, refEl],
  };
  return {
    path: '/test',
    version: '4.6',
    packages: [ecucDefsPkg],
  };
}
```

- [ ] **Step 2: Add the new `describe` block at the bottom of the test file**

```ts
// ---------------------------------------------------------------------------
// 2026-06-23 — EcucDefs fold (tier 4).
//
// Verifies the new fold trigger added in combinedDoc.ts#foldPackage:
// when `pkg.shortName === 'EcucDefs'` AND it carries exactly one
// `kind: 'module'` element AND no sub-packages, the EcucDefs layer
// collapses and the module element is hoisted to the parent.
// ---------------------------------------------------------------------------

describe('EcucDefs fold (tier 4)', () => {
  it('folds AUTOSAR_R22 > EcucDefs > Adc_module to AUTOSAR_R22 > [Adc hoisted]', () => {
    // Arrange
    const doc = makeEcucDefsDoc({ wrapShortName: 'AUTOSAR_R22', moduleShortName: 'Adc' });
    const bswmds = [makeBswmd(['Adc'])];

    // Act
    const result = computeDisplayDoc('single', doc, [], bswmds);

    // Assert
    expect(result.doc).not.toBeNull();
    const topPkg = result.doc!.packages[0]!;
    expect(topPkg.shortName).toBe('AUTOSAR_R22');
    // The wrap now contains a single child pkg carrying the hoisted module
    expect(topPkg.packages).toBeDefined();
    expect(topPkg.packages!.length).toBe(1);
    const hoisted = topPkg.packages![0]!;
    expect(hoisted.isVendorFoldResult).toBe(true);
    expect(hoisted.shortName).toBe('Adc');
    expect(hoisted.elements.length).toBe(1);
    expect(hoisted.elements[0]!.kind).toBe('module');
  });

  it('folds EcucDefs > Adc_module (single wrap) to [Adc hoisted at root]', () => {
    // Arrange
    const doc = makeEcucDefsDoc({ wrapShortName: null, moduleShortName: 'Adc' });
    const bswmds = [makeBswmd(['Adc'])];

    // Act
    const result = computeDisplayDoc('single', doc, [], bswmds);

    // Assert
    expect(result.doc).not.toBeNull();
    expect(result.doc!.packages.length).toBe(1);
    const hoisted = result.doc!.packages[0]!;
    expect(hoisted.isVendorFoldResult).toBe(true);
    expect(hoisted.shortName).toBe('Adc');
    expect(hoisted.elements[0]!.kind).toBe('module');
  });

  it('refuses to fold when EcucDefs has sibling elements (module + reference)', () => {
    // Arrange
    const doc = makeEcucDefsMixedDoc();
    const bswmds = [makeBswmd(['Adc'])];

    // Act
    const result = computeDisplayDoc('single', doc, [], bswmds);

    // Assert — EcucDefs preserved unchanged
    expect(result.doc).not.toBeNull();
    const pkg = result.doc!.packages[0]!;
    expect(pkg.shortName).toBe('EcucDefs');
    expect(pkg.isVendorFoldResult).toBeUndefined();
    expect(pkg.elements.length).toBe(2);
  });

  it('folds EcucDefs even when the module is NOT in loaded BSWMDs (naming-only)', () => {
    // Arrange — empty BSWMD list (no modules known)
    const doc = makeEcucDefsDoc({ wrapShortName: null, moduleShortName: 'Adc' });
    const bswmds = [makeBswmd([])];

    // Act
    const result = computeDisplayDoc('single', doc, [], bswmds);

    // Assert — fold still fires (the new tier has no BSWMD gate)
    expect(result.doc).not.toBeNull();
    const hoisted = result.doc!.packages[0]!;
    expect(hoisted.isVendorFoldResult).toBe(true);
    expect(hoisted.shortName).toBe('Adc');
  });
});
```

- [ ] **Step 3: Run tests — expect 4 new FAILs**

```bash
cd D:/claude_proj2/claude-AutosarCfg
pnpm exec vitest run src/renderer/store/helpers/__tests__/combinedDoc.test.ts
```

Expected: 4 tests fail with "expected `isVendorFoldResult` to be true" / "expected EcucDefs to be preserved" — current code does not have the new tier.

- [ ] **Step 4: Commit failing tests**

```bash
git add src/renderer/store/helpers/__tests__/combinedDoc.test.ts
git commit -m "test(combinedDoc): add EcucDefs fold (tier 4) RED cases"
```

---

### Task 2: Add the 4th tier to `foldPackage` (GREEN)

**Files:**

- Modify: `src/renderer/store/helpers/combinedDoc.ts:628-662`

- [ ] **Step 1: Update the block comment in `foldPackage`**

Find the block comment at `src/renderer/store/helpers/combinedDoc.ts:628-639` and replace with:

```ts
// Foldable? A package is foldable when:
//   - it has EXACTLY ONE nested package (vendor wrappers don't
//     carry siblings)
//   - it carries no `elements` of its own (vendor wrappers are
//     pass-through)
//   - any of the following hold:
//       a. inner.shortName is a BSWMD module (gold path), OR
//       b. pkg.shortName matches a trusted vendor pack prefix
//          (folds on naming alone, no BSWMD gate), OR
//       c. pkg.shortName matches a generic vendor prefix AND
//          inner.shortName is a BSWMD module (sanity gate
//          against user-defined `EcucDefs`).
//       d. 2026-06-23 EcucDefs tier — pkg.shortName is exactly
//          'EcucDefs' AND pkg carries exactly one module element
//          in pkg.elements (skeleton.ts emits the module into
//          `elements`, not into a sub-package, so the existing
//          nested.length === 1 gate cannot see it). The strict
//          length === 1 check refuses to fold EcucDefs that
//          carries sibling elements (e.g. a reference), which
//          would otherwise be silently dropped. See spec §Invariants
//          I1 + I2.
//
// v1.9.0 Sprint X Phase 5c — split the former
// `VENDOR_PREFIX_RE` into trusted (b) vs generic (c) tiers. The
// generic tier still requires the BSWMD match (MEDIUM #2
// invariant). The trusted tier is the Phase 5b regression fix:
// the previous AND-combined rule refused to fold `JWQ_CDD_PACK >
// JWQ_Packet > JWQ3399` because the outer wrapper's inner
// (`JWQ_Packet`) wasn't a BSWMD module, leaving the vendor parent
// visible. The trusted-prefix rule alone is sufficient — naming
// convention is the contract.
//
// This check applies at ANY level — top-level wrappers and
// intermediate wrappers alike. Recursion walks down the chain
// until we find a non-foldable package (the leaf).
```

- [ ] **Step 2: Add the new disjunct**

Find the `isFoldableHere` declaration at `src/renderer/store/helpers/combinedDoc.ts:654-662` and replace with:

```ts
const innerMatchesBswmd =
  nested !== undefined && nested.length === 1 && bswmdNames.has(nested[0]!.shortName);
// 2026-06-23 — EcucDefs tier. Fires when the package IS the
// standard AUTOSAR `EcucDefs` namespace AND it carries exactly
// one `kind: 'module'` element directly (no sub-packages).
// No BSWMD gate: a fresh project with no BSWMDs loaded should
// still see the EcucDefs layer collapsed, matching the user's
// mental model of "EcucDefs is a namespace, not a UI surface".
// The `length === 1` + `kind === 'module'` check is the I1 + I2
// safety guard — mixed elements (e.g. reference + module) are
// preserved unchanged instead of silently dropped.
const ecucDefsHasSingleModule =
  pkg.shortName === 'EcucDefs' &&
  pkg.packages === undefined &&
  pkg.elements.length === 1 &&
  pkg.elements[0]!.kind === 'module';
// Tier 4 short-circuits BEFORE the wrapper checks because its
// preconditions (`pkg.packages === undefined && pkg.elements.length
// === 1`) are mutually exclusive with the wrapper checks'
// preconditions (`nested.length === 1 && pkg.elements.length === 0`).
// Putting it first avoids the wrapper short-circuit rejecting
// tier-4-eligible packages.
const isFoldableHere =
  ecucDefsHasSingleModule ||
  (nested !== undefined &&
    nested.length === 1 &&
    pkg.elements.length === 0 &&
    (innerMatchesBswmd ||
      trustedPackRe.test(pkg.shortName) ||
      (genericPrefixRe.test(pkg.shortName) && innerMatchesBswmd)));
```

- [ ] **Step 3: Run new tests — expect 4 PASS**

```bash
pnpm exec vitest run src/renderer/store/helpers/__tests__/combinedDoc.test.ts
```

Expected: 4 previously-failing tests now pass; all existing tests still pass.

- [ ] **Step 4: Run full suite — expect 2097 → 2101 passed**

```bash
pnpm exec vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/helpers/combinedDoc.ts
git commit -m "feat(combinedDoc): add EcucDefs fold (tier 4) GREEN"
```

---

### Task 3: Verify no regression in mutation / round-trip / display paths

**Files:** none modified; verification only

- [ ] **Step 1: Run full unit + integration suite**

```bash
pnpm exec vitest run
```

Expected: 2101 passed + 1 skipped (or higher if the new tests bumped the count). 0 type errors. 0 lint errors.

- [ ] **Step 2: Run `pnpm verify` (all 7 stages)**

```bash
pnpm verify
```

Expected: all 7 stages green (format / lint / typecheck / unit / build:renderer / build:main / build:preload).

- [ ] **Step 3: Manual smoke** (optional, only if a real `Adc_bswmd.arxml` fixture is available locally)

1. Launch the app.
2. Load a project containing `Adc_bswmd.arxml` with `mod.path = /AUTOSAR_R22/EcucDefs/Adc`.
3. Confirm the Tree shows `AUTOSAR_R22 > Adc > containers...` (2 layers).
4. Right-click the `Adc` module root → confirm the menu still shows
   "Remove module" (the Sprint 17 P3 T3.2 BSWMD re-route is unchanged).
5. Right-click a container → confirm the "Delete container" menu still works.
6. Save the project → confirm the on-disk ARXML is byte-identical to the
   pre-fold view (no path rewrite leaks into the serializer).

- [ ] **Step 4: No commit** (verification step only)

---

### Task 4: Push, tag, release notes

**Files:**

- Create: `docs/release-notes-v1.8.4.md` (or whatever the next slot is)

- [ ] **Step 1: Decide version bump**

This is a PATCH (no new feature, no breaking change). Bump `package.json`
1.8.3 → 1.8.4.

- [ ] **Step 2: Write release notes**

Use the v1.8.3 release notes as a template. Sections to include:

- Summary (one paragraph)
- Changed behavior: Tree now hides the `EcucDefs` AR-PACKAGE layer when it
  carries exactly one ECUC module
- Migration: none (fold is transparent; existing projects re-render correctly
  on next open)
- Tests: 2101 +1 passed (4 new + 0 removed)
- Spec: `2026-06-23-ecucdefs-fold-design.md`

- [ ] **Step 3: Push + tag**

```bash
git push origin feature/v1-8-4-ecucdefs-fold
gh pr create --base main --title "v1.8.4: EcucDefs fold" --body-file docs/release-notes-v1.8.4.md
# After PR merge:
git checkout main && git pull
git tag -a v1.8.4 -m "v1.8.4: EcucDefs fold"
git push origin v1.8.4
```

- [ ] **Step 4: Create GitHub release** (manual, since `gh` CLI is not installed)

Use `git credential fill` + `curl POST /repos/:owner/:repo/releases` per
the v1.7.1 GH release pattern. Attach the release notes as the body.
