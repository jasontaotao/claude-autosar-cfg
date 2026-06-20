# claude-AutosarCfg v1.5.1 Foundation Design

**Date**: 2026-06-21
**Author**: brainstorm output (6 + 2 agents, 3 rounds)
**Status**: APPROVED (all 6 design sections, all 6 clarifying Q answered)
**Type**: Foundation sprint (no user-visible features; PATCH bump)
**Source brainstorm memory**: [[claude-autosarcfg-v1-6-brainstorm]]
**Next version**: v1.6.0 (Cluster 1+2, scheduled)

---

## 0. Why v1.5.1

v1.5.0 SHIPPED 2026-06-20 with 1557 tests, 96.34% stmts, 88.21% branches.
Brainstorm for v1.6.0 surfaced 5 deferred tech-debt items that block future
work, plus an opportunity to ship a shared infrastructure layer (ARXML
streaming + IndexedDB cache) that 5 of the top 10 v1.6.0 candidates
depend on.

v1.5.1 = **foundation sprint**: pay down the tech-debt blockers and ship
the shared infrastructure **without exposing it to users** (feature-flagged
default OFF). v1.6.0 then has a clean foundation to build on.

## 1. Scope

### In scope (6 atomic PRs)
1. **`isPathInside` hardening** — v1.4.0 Trust Sprint already partial; finish
2. **`preserveOrder` determinism** — explicit serialization order
3. **`removeReference` store action** — cascade delete helper
4. **`applyMutation` realization** — replace Sprint 14 #2 stub
5. **Renderer file split** — `useArxmlStore.ts` 3406 lines → 4 files
6. **Streaming module + IndexedDB cache** — feature-flagged, default OFF

### Out of scope (v1.6.0+)
- v1.6.0 features (W Onboarding / A+C Headless CLI / G SWS Validator / U Keyboard)
- Cross-platform packaging polish (A11y item X)
- Locale-deep scripting docs (A11y item Y)
- ASPICE Traceability Hooks (item N) — deferred to v1.7.0
- Variants (item B) — deferred to v1.8.0+
- UDS/DoIP (item J) — parked as `research/uds-doip` branch

## 2. Decisions Locked (Q1–Q6)

| # | Question | Answer | Why |
|---|----------|--------|-----|
| Q1 | v1.5.1 scope boundary | **A — Full Foundation** (4 tech-debt + H streaming) | Unlocks 5/10 v1.6.0 items; PATCH is right size for a foundation sprint |
| Q2 | Streaming approach | **D — Independent module + DOM unchanged** | DOM stays default; new module outputs same `NormalizedDocument` abstraction; gradual migration path |
| Q3 | File split target | **A — 800-line cap (ECC common rule)** | Follows existing project rule; 4-file decomposition; conservative refactor |
| Q4 | Test coverage bar | **D — Per-type** (refactor 0 net; new code ≥ 90/80; total ≥ 95.5/87) | Acknowledges streaming/IndexedDB hard to mock; doesn't lower total bar unnecessarily |
| Q5 | Round-trip acceptance | **B — All fixtures + explicit tolerance rules** | Catches v1.4.2-style P0 regressions; tolerance whitelist is documented (not ad-hoc) |
| Q6 | Feature flag policy | **A — Dual track** (refactor default ON; new code feature-flagged) | Refactors have 1557 tests as fuse; new code warrants opt-in |

## 3. Build Approach

**Approach 1 — Layered Atomic (chosen)**. Six PRs, three merge waves:

```
Wave 1 (parallel, ~1 wk):
  PR(1) isPathInside hardening   ─┐
  PR(2) preserveOrder            ─┤
  PR(3) removeReference          ─┤
  PR(5) useArxmlStore split      ─┘

Wave 2 (depends on Wave 1, ~1 wk):
  PR(4) applyMutation realization

Wave 3 (depends on PR(2), ~2-3 wks):
  PR(6) streaming module + IndexedDB
                    ↓
              v1.5.1 tag
```

Total: 4–6 wks, with 4 work-streams at peak parallelism. Each PR ≤ 500
lines (except PR(6) ≈ 800 lines, but new package + feature-flagged).

### Why not Big-Bang (Approach 2)
v1.4.2 taught us: large PRs hide P0 bugs. Two P0 regressions in v1.4.2
(IPC field drop, chip 0/0 inconsistency) were both visible to code
review only after the bug-class was understood. Big-Bang would compound
that risk.

### Why not Parallel-Streams (Approach 3)
2 parallel branches + 1 release cut = merge conflict risk on shared
types. v1.5.1 has enough parallelism within Layered Atomic without
the release-branch complexity.

## 4. Architecture

### Layer A — Refactor layer (default ON)

```
src/main/                          src/core/                          src/renderer/
  ├─ paths/                          ├─ arxml/                          └─ store/
  │   └─ isPathInside.ts  ←PR(1)   │   ├─ mutation.ts   ←PR(4)★        └─ useArxmlStore.ts  ←PR(5) split
  │   (existing)                     │   │   (replaces stub)             ├─ index.ts
  │                                  │   ├─ preserveOrder.ts ←PR(2)      ├─ ecucSlice.ts
  │                                  │   └─ removeReference.ts ←PR(3)   ├─ bswmdSlice.ts
  │                                                                         ├─ i18nSlice.ts
  │                                                                         └─ historySlice.ts
  └─ (existing)                       └─ (existing)
```

★ PR(4) modifies the existing `src/core/arxml/mutation.ts` (885 lines,
  contains the Sprint 14 #2 stub). Not a new file.

### Layer B — New infrastructure layer (feature-flagged, default OFF)

```
src/main/arxml-stream/          ← new sub-path (not new npm package;
                                  v1.7.0+ can split if needed)
  ├─ package.json               ← sub-path exports
  ├─ streaming/
  │   ├─ sax-reader.ts
  │   ├─ chunk-builder.ts
  │   └─ index.ts
  ├─ cache/
  │   ├─ indexeddb-store.ts
  │   ├─ schema-version.ts
  │   └─ invalidation.ts
  ├─ normalize/
  │   └─ output.ts              ← produces NormalizedDocument
  └─ feature-flag.ts
```

`pnpm-workspace.yaml` is currently `allowBuilds`-only (not a monorepo).
The streaming module is therefore a **sub-path of the main package**,
not a separate workspace member. If/when we want to publish it as a
standalone npm package (v1.7.0+), we extract then.

### Key contracts

**`NormalizedDocument`** — the abstraction that unifies DOM and
streaming paths. New file: `src/shared/normalized-document.ts`.

```ts
export interface NormalizedDocument {
  readonly version: '4.x' | '5.x' | '6.x'
  readonly packages: ReadonlyArray<ArPackage>
  readonly modules: ReadonlyArray<EcucModule>
  readonly references: ReadonlyArray<Reference>
  readonly sourceOrder: ReadonlyArray<string>     // for preserveOrder
  readonly origin: 'dom' | 'stream'              // diagnostics
}

export interface MutationPlan {
  readonly id: string
  readonly operations: ReadonlyArray<
    | { type: 'add'; path: string; value: unknown }
    | { type: 'remove'; path: string; cascade: boolean }
    | { type: 'replace'; path: string; value: unknown }
    | { type: 'reorder'; path: string; newIndex: number }
  >
}

export interface MutationResult {
  readonly planId: string
  readonly newDoc: NormalizedDocument
  readonly arxmlWritten: string | null           // null = dry-run
  readonly duration: number
  readonly warnings: ReadonlyArray<string>
}
```

**`applyMutation`** — the single point reducer. PR(4) replaces the
Sprint 14 #2 stub. All mutations route through this.

**`feature-flag.ts`** — `experimental.streaming` and
`experimental.indexedDb`. Both default OFF. Both live in
`src/main/arxml-stream/feature-flag.ts` and are queried by the path
router at load time.

## 5. Atomic PR Detail

### PR(1) — `isPathInside` hardening
- **File**: `src/main/paths/isPathInside.ts` (existing)
- **Lines**: ~80 (incl. tests)
- **Tests**: 12 (positive / negative / edge: `..`, case, trailing slash, cross-platform)
- **Behavior**:
  1. Normalize (strip trailing slash, resolve `.` and `..`)
  2. Detect path traversal
  3. Windows case-insensitive (`C:\foo` ≡ `c:\FOO`)
  4. UNC path support (`\\server\share\foo`)
- **Rollback**: `git revert PR(1)`; old impl preserved
- **Already partial** from v1.4.0 Trust Sprint; this finishes it

### PR(2) — `preserveOrder`
- **File**: new `src/main/store/preserveOrder.ts`
- **Lines**: ~250 (incl. tests)
- **Tests**: 5 fixtures round-trip
  - `eb-master-12mb.arxml` (v1.4.1 cap test)
  - `vector-cdd-sample.arxml` (Vector dialect)
  - `intewell-eas-namespace.arxml` (vendor `/EAS/`)
  - `comments-rich.arxml` (comment preservation)
  - `postbuild-variant.arxml` (POST-BUILD-VARIANT-CONDITION)
- **Tolerance whitelist** (Q5 B): namespace prefix order, whitespace,
  comments, attribute order. Documented in `tolerance-rules.ts`.
- **API**:
  ```ts
  export function serializeInSourceOrder(
    ecucValues: NormalizedDocument,
    sourceArxml: string
  ): string
  ```

### PR(3) — `removeReference` store action
- **File**: new `src/main/store/removeReference.ts` (+ extension to
  existing `src/core/arxml/mutation.ts`)
- **Lines**: ~150 (incl. tests)
- **Tests**: 6 (single ref / multi ref / cross-module ref / cycle
  defense / undo path / cross-module cascade)
- **API**:
  ```ts
  export function removeReference(
    store: Store,
    containerPath: string
  ): MutationPlan   // not direct mutation; outputs plan for PR(4)
  ```

### PR(4) — `applyMutation` realization
- **File**: `src/core/arxml/mutation.ts` (replaces Sprint 14 #2 stub)
- **Lines**: ~400 (incl. tests)
- **Tests**: 8 (reorder / add / delete / cascade / rollback / fsync
  verification / reentrancy defense / concurrency)
- **API**:
  ```ts
  // Before (stub):
  export function applyMutation(plan: MutationPlan): void {
    throw new Error('not implemented')
  }

  // After:
  export function applyMutation(plan: MutationPlan): MutationResult {
    // 1. Validate plan
    // 2. Route through preserveOrder
    // 3. ARXML serialize (DOM path)
    // 4. Atomic write (rename-of-temp pattern)
    // 5. Emit store event
  }
  ```
- **Atomic write**:
  - Write to `path.tmp` → `fsync` → `MoveFileEx` (Windows) / `rename(2)`
    (POSIX) with `MOVEFILE_REPLACE_EXISTING`
  - Failure → delete temp, leave original untouched
  - **Never** partial write

### PR(5) — Renderer file split
- **File**: `src/renderer/store/useArxmlStore.ts` (3406 lines)
- **Target**: 4 files, each < 400 lines
  - `useArxmlStore.ts` (root, public API)
  - `ecucSlice.ts` (ECUC state)
  - `bswmdSlice.ts` (BSWMD state)
  - `i18nSlice.ts` (i18n state)
  - `historySlice.ts` (undo/redo)
- **Net lines**: 0 (pure move + re-export)
- **Tests**: 0 new (existing 1557 tests act as fuse)
- **Risk**: low. Pure file refactor; no IPC contract changes

### PR(6) — Streaming module + IndexedDB
- **File**: new `src/main/arxml-stream/` (sub-path)
- **Lines**: ~800 (new package)
- **Tests**:
  - Unit: 12 (SAX reader on 5 fixtures)
  - Unit: 6 (IndexedDB store CRUD)
  - Integration: 4 (DOM vs streaming equivalence)
  - Perf: 1 benchmark (`10MB parse < 2s`)
- **API**:
  ```ts
  // streaming
  export async function streamParse(file: Buffer | string): Promise<NormalizedDocument>

  // cache
  export interface CacheKey {
    filePath: string
    mtime: number
    contentHash: string  // SHA-256
  }
  export async function cacheGet(key: CacheKey): Promise<NormalizedDocument | null>
  export async function cacheSet(key: CacheKey, doc: NormalizedDocument): Promise<void>

  // feature flag
  export function isStreamingEnabled(): boolean
  export function isIndexedDbEnabled(): boolean
  ```
- **Path router** (in main process):
  ```ts
  function routeArxmlReader(file: Buffer | string): Promise<NormalizedDocument> {
    if (file.byteLength < 2 * 1024 * 1024) return domParse(file)        // always
    if (isStreamingEnabled()) return streamParse(file)                  // flag
    return domParse(file)                                                // fallback
  }
  ```
- **Failure modes** (Q6 A dual track): streaming throws → fallback to
  DOM with one console warning; IndexedDB write fails → silent cache
  miss next time; **never** blocks user load.

## 6. Data Flow

### 6.1 Load

```
[ARXML file]
     │
     ▼
[Path Router]
  ├─ < 2MB      → DOMParser (existing)   ← always
  └─ >= 2MB + experimental.streaming  → SAX reader (new)
                                       (else DOM fallback)
     │
     ▼
[NormalizedDocument]   ← single abstraction
     │
     ▼ (if experimental.indexedDb)
[IndexedDB cache]   ← key = (filePath, mtime, sha256)
```

### 6.2 Edit

```
[UI edit action]
     │
     ▼
[MutationPlan]   ← PR(3) removeReference computes cascade
     │
     ▼
[applyMutation (PR(4))]   ← routes through preserveOrder (PR(2))
     │
     ▼
[MutationResult]   ← newDoc + arxmlWritten
     │
     ▼
[Zustand store]   ← state + dirty flag + history stack
```

### 6.3 Save (atomic write)

```
[MutationResult.arxmlWritten]
     │
     ▼
[write to path.tmp] → [fsync] → [MoveFileEx / rename(2)]
                                          │
                                          ▼
                          [delete temp on any failure]
                          [original file unchanged on failure]
```

### 6.4 Round-trip verification (Q5 B)

```
[Load fixture X.arxml]
     │
     ▼
[Normalize via DOM]
     │
     ▼
[applyMutation(noop)]    ← dry-run; forces serialize
     │
     ▼
[Parse arxmlWritten back]
     │
     ▼
[Deep diff: original vs reparsed]
     │
     ▼
[Apply tolerance whitelist]
  - namespace prefix order
  - whitespace
  - comments
  - attribute order
     │
     ▼
[Out-of-tolerance diff → test fail]
```

## 7. Error Handling

### 7.1 Parse errors

```ts
export type ArxmlParseError =
  | { kind: 'malformed-xml'; line: number; column: number; message: string }
  | { kind: 'schema-violation'; path: string; rule: string; severity: 'error' | 'warning' }
  | { kind: 'unsupported-version'; version: string; supported: string[] }
  | { kind: 'partial-stream'; completedChunks: number; totalExpected: number }
```

- Stop on error; never produce half-baked `NormalizedDocument`
- AppHeader dismissible error banner (v1.4.0 trust sprint pattern)
- No throw; return `Result<T, ArxmlParseError>`

### 7.2 Mutation errors

```ts
export type MutationError =
  | { kind: 'plan-invalid'; planId: string; violations: ReadonlyArray<string> }
  | { kind: 'reference-cycle'; from: string; to: string }
  | { kind: 'multiplicity-violation'; path: string; actual: number; required: string }
  | { kind: 'path-not-found'; path: string }
  | { kind: 'concurrent-mutation'; planId: string; conflictingPlanId: string }
```

- `applyMutation` **never** silent-swallow (per common/coding-style.md)
- Failed plans: `MutationResult { arxmlWritten: null, warnings: [...error] }`
- History stack **not** updated on error
- UI: toast + Issues panel row (v1.5.0 BSWMD picker pattern)

### 7.3 Persistence errors

```ts
export type PersistenceError =
  | { kind: 'disk-full'; path: string; required: number; available: number }
  | { kind: 'permission-denied'; path: string }
  | { kind: 'temp-rename-failed'; tempPath: string; targetPath: string; reason: string }
  | { kind: 'fsync-failed'; path: string; reason: string }
```

- Windows: `MoveFileEx` + `MOVEFILE_REPLACE_EXISTING`
- POSIX: `rename(2)` with `O_EXCL` fallback for cross-device
- All failures: delete temp, leave original untouched

### 7.4 Feature flag failure semantics

| Flag | Failure | Behavior |
|------|---------|----------|
| `experimental.streaming` | SAX throws | Fallback to DOM, console warning, metric |
| `experimental.indexedDb` | IndexedDB write fails | Silent cache miss, no metric |

**Invariants**: feature-flag failures **never** block user load. Flag
OFF = v1.5.0 behavior, bit-for-bit.

### 7.5 i18n

- Reuse v1.4.0 trust sprint i18n system
- 4 new error kinds × 2 locales (EN + ZH) = 8 new translation strings
- Test: snapshot for each error kind × locale

## 8. Testing Strategy

### 8.1 Per-PR unit tests

| PR | New unit tests | Notes |
|----|----------------|-------|
| (1) isPathInside | 12 | traversal, case, slash, platform |
| (2) preserveOrder | 5 fixtures round-trip | tolerance whitelist |
| (3) removeReference | 6 | cascade scenarios |
| (4) applyMutation | 8 | paths + failures |
| (5) file split | 0 | 1557 tests as fuse |
| (6) streaming | 12 SAX + 6 IndexedDB + 4 integration | new package |
| **Total** | **+53** | **1557 → ~1610 tests** |

### 8.2 Round-trip integration

```
test/round-trip/
  ├─ fixtures/
  │   ├─ eb-master-12mb.arxml
  │   ├─ vector-cdd-sample.arxml
  │   ├─ intewell-eas-namespace.arxml
  │   ├─ comments-rich.arxml
  │   └─ postbuild-variant.arxml
  ├─ round-trip.spec.ts           ← 5 fixture × 3 mode = 15 cases
  └─ tolerance-rules.ts           ← explicit whitelist
```

Run: `pnpm test:round-trip` — per-PR gate + nightly.

### 8.3 Coverage gate

| Type | Threshold |
|------|-----------|
| Pure refactor (PR 1, 2, 5) | 0 new tests required; existing pass |
| Contract change (PR 3, 4) | New code ≥ 90% stmts / 80% branches |
| New module (PR 6) | New code ≥ 90% stmts / 80% branches; critical paths 100% |
| **Total** | **≥ 95.5% stmts / ≥ 87% branches** |

### 8.4 Performance benchmark (PR 6 only)

```ts
test('10MB BSWMD parse', async () => {
  const start = Date.now()
  const doc = await streamParse(fixture)
  expect(Date.now() - start).toBeLessThan(2000)  // 2s vs DOM 5s
  expect(doc.modules.length).toBeGreaterThan(50)
})
```

Not a merge gate; regression alarm (common/performance.md spirit).

## 9. Acceptance Criteria

### BLOCK (must all pass to ship)

| # | Item | Verification |
|---|------|--------------|
| 1 | All 6 PRs merged to main | `git log --oneline ^v1.5.0..HEAD` |
| 2 | Tests pass | `pnpm test` — 1557 → ~1610 |
| 3 | Coverage gate | `pnpm test:coverage` — ≥ 95.5 / ≥ 87 |
| 4 | Round-trip all fixtures | `pnpm test:round-trip` — 15 cases |
| 5 | 0 type errors, 0 lint errors | `pnpm typecheck && pnpm lint` |
| 6 | Build success; bundle ≤ 850 kB | `pnpm build` |
| 7 | `experimental.streaming` default OFF | grep `settings.json` |
| 8 | AppHeader i18n EN+ZH pass | `pnpm test:i18n` |
| 9 | 4 new error kinds × 2 locales | grep error catalog |

### WARN (should pass, ship if minor miss)

| # | Item | Verification |
|---|------|--------------|
| 10 | Streaming 10MB parse < 2s | benchmark |
| 11 | DOM ≡ streaming NormalizedDocument (5 fixture) | integration |
| 12 | IndexedDB cache hit < 200ms | benchmark |
| 13 | code-reviewer 0 C / ≤ 2 H / ≤ 5 M | per-PR review |

### OUT of scope (v1.5.1 explicitly does NOT deliver)

- ❌ v1.6.0 features (W / A+C / G / U)
- ❌ v1.5.0 features (1557 tests passing = sufficient)
- ❌ Cross-platform packaging polish
- ❌ Locale-deep scripting docs
- ❌ ASPICE / Variants / UDS

## 10. Ship Mechanics

- **Tag**: `v1.5.1` (PATCH bump; package.json 1.5.0 → 1.5.1)
- **Release notes**: reuse v1.5.0 / v1.4.x template
- **Emphasis**: "Foundation sprint, no user-visible changes"
- **GH release**: manual (gh CLI still not installed)
- **Memory**: write `claude-autosarcfg-v1-5-1-shipped.md` after tag

## 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ARXML serialization regression | M | P0 | 6-PR fuse + 1557 tests per PR |
| streaming perf miss | M | P3 | feature-flag OFF = user unaffected |
| applyMutation contract change | M | P1 | PR(1)(2)(3) lock deps first |
| renderer split breaks IPC | L | P1 | pure file move, no contract change |
| new code coverage drop | M | P2 | per-type gate (Q4 D) |
| Round-trip tolerance rules miss edge case | M | P1 | explicit whitelist, documented |

## 12. v1.5.1 → v1.6.0 Interface Contracts

v1.5.1 must leave the following ready for v1.6.0:

1. **`NormalizedDocument` abstraction** — A+C Headless CLI consumes
2. **`applyMutation` realized** — Script Engine real mutation replay
3. **`preserveOrder` deterministic** — A+C `--format unified` output
4. **streaming module (flagged)** — A+C CLI optional streaming reader
5. **IndexedDB cache (flagged)** — A+C CLI optional local cache

If v1.5.1 ships these 5, v1.6.0 Cluster 1 (W + A+C + G + U) has a
clean foundation. This is the foundation sprint's core ROI.

## 13. References

- [[claude-autosarcfg-overview]] — v1.5.0 state
- [[claude-autosarcfg-v1-6-brainstorm]] — source brainstorm
- [[v1-4-1-bswmd-mcc-and-path-walker-bugfix]] — path safety context
- [[claude-AutosarCfg-sprint-14-v1-3-0-shipped]] — Script Engine v1.3.0
- [[dbc-forge-v0-1-0-overview]] — Cluster 3 reuse target (v1.7.0)
- `docs/superpowers/specs/2026-06-18-script-engine-design.md` — applies applyMutation stub
- `docs/superpowers/specs/2026-06-19-v1-1-2-polish-design.md` — i18n pattern
- `docs/superpowers/plans/` — implementation plans (to be written)
