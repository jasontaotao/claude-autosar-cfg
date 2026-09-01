# ECUC Instance Rename and DEFINITION-REF Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ECUC container schema identity follow `DEFINITION-REF` first and support safe renaming of ECUC value instance `SHORT-NAME`s.

**Architecture:** Add a core BSWMD lookup keyed by container `DEFINITION-REF`, then route container/parameter/reference mutations through that identity before falling back to path matching. Add a transactional rename primitive that rewrites instance paths and inbound references, followed by store and UI integration. Internal stable node IDs remain out of scope.

**Tech Stack:** TypeScript, React, Zustand, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-01-ecuc-instance-name-definition-ref.md`

## Global Constraints

- Do not alter `DEFINITION-REF` during ECUC instance rename.
- Do not make ECUC `SHORT-NAME` equal to the BSWMD definition name a required product rule.
- Preserve exact BSWMD definition matches before any `_N` suffix fallback.
- Preserve combined-mode behavior: mutations target the source document, not the virtual combined document.
- Every new behavior has a failing test written before implementation.
- Run tests with:
  ```powershell
  node node_modules\vitest\vitest.mjs run <path> --reporter=dot
  ```
- Type-check with both configs before each commit.
- Leave existing unrelated desktop-path test failures out of scope.

---

### Task 1: Core definition lookup by `DEFINITION-REF`

**Files:**
- Create: `src/core/project/bswmd/definitionLookup.ts`
- Modify: `src/core/project/bswmd/index.ts`
- Test: `src/core/project/__tests__/definitionLookup.test.ts`

**Interfaces:**
- Consumes: `BswmdDocument`, `BswModuleDef`, `ContainerDef` from `@core/project/bswmd.js`.
- Produces:
  ```ts
  export interface DefinitionLookupResult {
    readonly moduleDef: BswModuleDef;
    readonly containerDef: ContainerDef;
  }
  export function findContainerDefByDefinitionRef(
    schemas: readonly BswmdDocument[],
    definitionRef: string,
  ): DefinitionLookupResult | null;
  ```

- [ ] **Step 1: Write failing tests**

Cover:
  - exact definition path resolves module + container;
  - leading-slash mismatch is normalized;
  - missing or empty definition ref returns null;
  - exact definition wins over suffix heuristic.

- [ ] **Step 2: Run the test and verify RED**

Run: `node node_modules\vitest\vitest.mjs run src/core/project/__tests__/definitionLookup.test.ts --reporter=dot`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal lookup**

Implementation rules:
  - normalize definition ref to `/segment/...`;
  - search every schema and module;
  - search top-level containers, `subContainers`, and `choices`;
  - compare against `ContainerDef.path`;
  - do not use short-name suffix stripping in this lookup.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Task 1 test command again.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/project/bswmd/definitionLookup.ts src/core/project/bswmd/index.ts src/core/project/__tests__/definitionLookup.test.ts
git commit -m "feat(bswmd): resolve container definitions by definition-ref"
```

---

### Task 2: Resolve ECUC containers through definition identity

**Files:**
- Modify: `src/renderer/store/helpers/bswmdLookup.ts`
- Test: `src/renderer/store/helpers/__tests__/bswmdLookup.definitionRef.test.ts`

**Interfaces:**
- Consumes: `findContainerDefByDefinitionRef`.
- Produces:
  ```ts
  export function resolveContainerDefinitionContext(
    schemas: readonly BswmdDocument[],
    containerPath: string,
    definitionRef: string | undefined,
  ): {
    readonly moduleDef: BswModuleDef;
    readonly parentContainerDef: ContainerDef;
  } | null;
  ```

- [ ] **Step 1: Write failing tests**

Cover:
  - a custom instance name such as `FrontValidSet` resolves by its definition ref;
  - `definitionRef === undefined` falls back to `resolveModuleAndParentContainer`;
  - a stale definition ref that cannot resolve falls back to path lookup;
  - the returned `parentContainerDef` is the selected container definition, matching existing mutation semantics.

- [ ] **Step 2: Run the test and verify RED**

Run: `node node_modules\vitest\vitest.mjs run src/renderer/store/helpers/__tests__/bswmdLookup.definitionRef.test.ts --reporter=dot`

Expected: FAIL because the function does not exist.

- [ ] **Step 3: Implement minimal routing**

Use `findByPath` to obtain the container element when needed by tests/helpers. Definition-first lookup must return the BSWMD container for the selected ECUC container; path lookup remains fallback.

- [ ] **Step 4: Run the test and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/helpers/bswmdLookup.ts src/renderer/store/helpers/__tests__/bswmdLookup.definitionRef.test.ts
git commit -m "fix(ecuc): prefer definition-ref when resolving container schemas"
```

---

### Task 3: Wire container, parameter, and reference mutations to definition identity

**Files:**
- Modify: `src/renderer/store/slices/mutationSlice.ts`
- Test: `src/renderer/store/__tests__/useArxmlStore.definitionRefMutation.test.ts`

**Interfaces:**
- Consumes: `resolveContainerDefinitionContext`.
- Produces: existing mutation signatures unchanged:
  ```ts
  addContainer(parentPath, shortName)
  addParameter(containerPath, paramShortName)
  addReference(containerPath, refShortName)
  ```

- [ ] **Step 1: Write failing store tests**

Build a BSWMD and ECUC document whose container instance is named `FrontValidSet` but whose `DEFINITION-REF` points to `ValidSet`. Assert:
  - adding a declared child container succeeds;
  - adding a declared parameter succeeds;
  - adding a declared reference succeeds;
  - undeclared children/parameters still fail.

- [ ] **Step 2: Run tests and verify RED**

Run: `node node_modules\vitest\vitest.mjs run src/renderer/store/__tests__/useArxmlStore.definitionRefMutation.test.ts --reporter=dot`

Expected: FAIL because current mutation lookup infers schema from path.

- [ ] **Step 3: Replace lookup call sites**

For combined mode, resolve the source document and strip the combined prefix first, then use the inner path plus the resolved container's `definitionRef`. For single mode, use the active document path directly. Preserve existing error i18n keys.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Run adjacent mutation tests**

Run:
```powershell
node node_modules\vitest\vitest.mjs run src/renderer/store/__tests__/useArxmlStore.mutation.test.ts src/core/arxml/__tests__/mutation-multi-instance.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/store/slices/mutationSlice.ts src/renderer/store/__tests__/useArxmlStore.definitionRefMutation.test.ts
git commit -m "fix(ecuc): use definition-ref for schema-driven mutations"
```

---

### Task 4: Rename validation primitive

**Files:**
- Create: `src/core/arxml/mutation/rename.ts`
- Test: `src/core/arxml/mutation/__tests__/rename.test.ts`

**Interfaces:**
- Consumes: `ArxmlDocument`, `ArxmlContainer`.
- Produces:
  ```ts
  export type RenameShortNameError =
    | { readonly kind: 'path-not-found'; readonly path: string }
    | { readonly kind: 'not-container'; readonly path: string }
    | { readonly kind: 'empty-short-name' }
    | { readonly kind: 'invalid-short-name'; readonly shortName: string }
    | { readonly kind: 'sibling-name-conflict'; readonly shortName: string };

  export function validateContainerRename(
    doc: ArxmlDocument,
    containerPath: string,
    newShortName: string,
  ): RenameShortNameError | null;
  ```

- [ ] **Step 1: Write failing validation tests**

Cover:
  - empty name;
  - invalid identifier;
  - valid name;
  - sibling conflict;
  - same current name is treated as valid for validation (idempotence is handled by the caller/core action).

- [ ] **Step 2: Run tests and verify RED**

Run: `node node_modules\vitest\vitest.mjs run src/core/arxml/mutation/__tests__/rename.test.ts --reporter=dot`

Expected: FAIL because the file does not exist.

- [ ] **Step 3: Implement validation**

Use `findByPath`, require `kind === 'container'`, and require the new name to be unique among sibling containers. Keep identifier validation conservative:
  ```text
  /^[A-Za-z_][A-Za-z0-9_]*$/
  ```

- [ ] **Step 4: Run tests and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/arxml/mutation/rename.ts src/core/arxml/mutation/__tests__/rename.test.ts
git commit -m "feat(ecuc): add container rename validation"
```

---

### Task 5: Core transactional rename

**Files:**
- Modify: `src/core/arxml/mutation/rename.ts`
- Test: `src/core/arxml/mutation/__tests__/rename.test.ts`

**Interfaces:**
- Consumes: `validateContainerRename`.
- Produces:
  ```ts
  export interface RenameContainerResult {
    readonly doc: ArxmlDocument;
    readonly oldPath: string;
    readonly newPath: string;
    readonly rewrittenReferenceCount: number;
  }
  export function renameContainer(
    doc: ArxmlDocument,
    containerPath: string,
    newShortName: string,
  ): Result<RenameContainerResult, RenameShortNameError>;
  ```

- [ ] **Step 1: Write failing transaction tests**

Cover:
  - rename changes only target `SHORT-NAME`;
  - `DEFINITION-REF` is unchanged;
  - descendant paths are reachable under `newPath`;
  - reference parameter values ending with `oldPath` are rewritten to `newPath`;
  - invalid input returns the original document reference and typed error.

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL because `renameContainer` does not exist.

- [ ] **Step 3: Implement minimal transaction**

Algorithm:
  1. validate;
  2. locate target and replace it with `{ ...target, shortName: newShortName }`;
  3. compute `oldPath` and `newPath` by replacing the final path segment;
  4. scan reference parameter values whose value equals or ends with `oldPath + '/'` boundary semantics and rewrite the matched prefix;
  5. return a new immutable document only when something changed.

Do not rewrite `DEFINITION-REF`.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/arxml/mutation/rename.ts src/core/arxml/mutation/__tests__/rename.test.ts
git commit -m "feat(ecuc): transactionally rename container instances"
```

---

### Task 6: Store rename action

**Files:**
- Modify: `src/renderer/store/slices/mutationSlice.ts`
- Modify: `src/renderer/store/helpers/mutationErrors.ts` if a new error mapper branch is required
- Test: `src/renderer/store/__tests__/useArxmlStore.rename.test.ts`

**Interfaces:**
- Consumes: `renameContainer`, `RenameShortNameError`.
- Produces:
  ```ts
  renameContainer: (containerPath: string, newShortName: string) => void;
  ```

- [ ] **Step 1: Write failing store tests**

Cover single and combined modes:
  - successful rename updates `doc`, `displayDoc`, selected path, and dirty state;
  - validation error surfaces localized error without mutating the document;
  - references are rewritten;
  - combined mode mutates the source document.

- [ ] **Step 2: Run tests and verify RED**

Run: `node node_modules\vitest\vitest.mjs run src/renderer/store/__tests__/useArxmlStore.rename.test.ts --reporter=dot`

Expected: FAIL because the action does not exist.

- [ ] **Step 3: Implement action**

Follow the existing combined-mode dispatch pattern:
  1. resolve source target;
  2. strip combined prefix;
  3. call core `renameContainer`;
  4. apply result via `applyMutationResultToSource`;
  5. set `selectedPath` to `newPath`.

For single mode, use `applyMutationResultToActive`.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/slices/mutationSlice.ts src/renderer/store/helpers/mutationErrors.ts src/renderer/store/__tests__/useArxmlStore.rename.test.ts
git commit -m "feat(ecuc): add rename container store action"
```

---

### Task 7: Rename UI and localized messages

**Files:**
- Modify: `src/renderer/components/ContextMenu.tsx`
- Modify: `src/renderer/components/editor/ParamEditor.tsx`
- Modify: `src/renderer/components/tree/Tree.tsx`
- Modify: `src/shared/i18n/validation.ts`
- Modify: `src/shared/i18n.en/validation.ts`
- Modify: `src/shared/i18n.zh-CN/validation.ts`
- Test: `src/renderer/components/__tests__/ContextMenu.rename.test.tsx`
- Test: `src/renderer/components/editor/__tests__/ParamEditor.rename.test.tsx`

**Interfaces:**
- Consumes: `useArxmlStore.renameContainer`.
- Produces:
  - context-menu item: Rename;
  - editor header pencil action: Rename;
  - dialog submit invokes `renameContainer(selectedPath, value)`.

- [ ] **Step 1: Write failing UI tests**

Cover:
  - right-click container shows Rename;
  - Rename invokes the store action with the selected path and entered name;
  - invalid input is disabled or surfaces the existing validation error;
  - Rename is not shown for BSWMD tree nodes.

- [ ] **Step 2: Run tests and verify RED**

Run:
```powershell
node node_modules\vitest\vitest.mjs run src/renderer/components/__tests__/ContextMenu.rename.test.tsx src/renderer/components/editor/__tests__/ParamEditor.rename.test.tsx --reporter=dot
```

Expected: FAIL because UI does not expose rename.

- [ ] **Step 3: Implement minimal UI**

Use the existing confirm/dialog patterns. Label the field `Instance name` rather than `Definition`. Keep `DEFINITION-REF` read-only in the editor header/tooltip.

- [ ] **Step 4: On successful rename, repair tree-local expansion**

In `Tree.tsx`, map the old real-path prefix to the new real-path prefix when rename state changes. Collection keys beginning with `collection:` must not be blindly rewritten unless their embedded path lies under the renamed subtree.

- [ ] **Step 5: Run UI tests and verify GREEN**

Expected: PASS.

- [ ] **Step 6: Add i18n parity checks**

Run existing i18n tests:
```powershell
node node_modules\vitest\vitest.mjs run src/shared/__tests__/i18n.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/ContextMenu.tsx src/renderer/components/editor/ParamEditor.tsx src/renderer/components/tree/Tree.tsx src/shared/i18n src/shared/i18n.en src/shared/i18n.zh-CN src/renderer/components/__tests__/ContextMenu.rename.test.tsx src/renderer/components/editor/__tests__/ParamEditor.rename.test.tsx
git commit -m "feat(ui): rename ECUC container instances"
```

---

### Task 8: Regression and definition-ref validation

**Files:**
- Test: `src/core/validation/__tests__/definitionRefSchema.test.ts`
- Modify: schema validation lookup only if a documented gap is reproduced.

**Interfaces:**
- Consumes: `buildSchemaLayer`, `lookupSchemaAcrossModuleRoots`, `lookupContainerSchemaAcrossModuleRoots`.
- Produces: validated behavior for custom instance names.

- [ ] **Step 1: Write failing validation tests**

Use a custom instance name such as `FrontValidSet` with `DEFINITION-REF = .../ValidSet` and assert validation does not depend on the instance name matching the definition.

- [ ] **Step 2: Run tests and verify RED or document existing pass**

If validation already threads definition identity and passes, convert the test into an explicit regression test and state that in the commit body.

- [ ] **Step 3: Implement only the minimal missing validation wiring**

Do not introduce broad refactors.

- [ ] **Step 4: Run validation tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/validation/__tests__/definitionRefSchema.test.ts src/core/validation
git commit -m "test(validation): cover custom ECUC instance names"
```

---

### Task 9: Full verification and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-01-ecuc-instance-name-definition-ref.md` only if implementation decisions require clarification.

- [ ] **Step 1: Run focused regression suite**

```powershell
node node_modules\vitest\vitest.mjs run src/core/project src/core/arxml/mutation src/core/validation src/renderer/store src/renderer/components/tree src/renderer/components/editor src/shared/i18n --reporter=dot
```

Expected: PASS.

- [ ] **Step 2: Run type checks**

```powershell
node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json
node node_modules\typescript\bin\tsc --noEmit -p tsconfig.web.json
```

Expected: PASS.

- [ ] **Step 3: Run lint and format checks**

```powershell
node node_modules\eslint\bin\eslint.js <changed-files>
node node_modules\prettier\bin\prettier.cjs --check <changed-files>
```

Expected: PASS.

- [ ] **Step 4: Run full suite**

```powershell
node node_modules\vitest\vitest.mjs run --reporter=dot
```

Expected: no new failures beyond the known desktop-path/EPERM baseline.

- [ ] **Step 5: Final commit**

If documentation changed:

```bash
git add docs/superpowers/specs/2026-09-01-ecuc-instance-name-definition-ref.md
git commit -m "docs(ecuc): document instance rename rules"
```
