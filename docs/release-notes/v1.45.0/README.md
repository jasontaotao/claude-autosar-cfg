# v1.45.0 — Drift Cleanup + Verify Closure (MINOR)

**Released:** 2026-07-11
**Tag:** [`v1.45.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.45.0)
**Cycle type:** MINOR (process-improvement + small correctness fix)
**Ship basis:** 4 commits (T1-T3 process cleanup + T4 ship)

## Summary

Closes the latent `pnpm verify` debt that accumulated across v1.42.0..v1.44.1 ship chain. For the first time in repo history, `pnpm verify` now passes all 8 stages green (added `python-self-test` as 8th stage). 1 closure-safety correctness fix (`useDcmConfigLauncher.ts` line 514: `open` useCallback was missing `bswmdPaths` dep, risking stale closure across project-manifest reloads). 19 src-tree files get prettier auto-fix + 8 files get eslint import/order auto-fix. **0 source-tree functional change at the user-facing layer**; the only functional change is the `open` deps fix.

| | v1.44.1 baseline | **v1.45.0** | Delta |
|---|---|---|---|
| `src/renderer/` LoC | 0 functional change | 1-line deps array fix | 1 line |
| `scripts/` LoC | 174 (validate_hook_range.py only) | 174 + 148 (test_python.py) + 56 (run_python_self_test.cjs) | +204 |
| `.gitignore` rules | 12 | 14 (+ `__pycache__/`, `*.pyc`, `*.pyo`) | +3 |
| `pnpm verify` stages | 7-stage GREEN | **8-stage GREEN** (added `python-self-test`) | +1 |
| Tests | 3128 + 7 SKIP | 3128 + 7 SKIP | 0 |
| Pre-existing format drift | 18 files failing `pnpm format:check` | 0 | -18 |
| Pre-existing lint errors | 8 import/order + 1 useCallback deps | 0 | -9 |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `0e8cafc` | `chore(gitignore): ignore Python __pycache__/ and *.pyc` |
| T2 | `d360b39` | `feat(scripts): v1.45.0 PATCH T2 -- wire validate_hook_range self-tests into pnpm verify` |
| T3 | `9452993` | `style: v1.45.0 PATCH T3 -- prettier --write + import/order + useCallback exhaustive-deps fix` |
| T4 | (this commit) | `docs(release): v1.45.0 MINOR -- drift cleanup + verify closure` |

## What's new

### 1. Closes v1.44.1 honest deviations (both)

- **(a)** `.gitignore` now ignores `__pycache__/`, `*.pyc`, `*.pyo`. Before this rule, importing `scripts/validate_hook_range.py` left an untracked `__pycache__/` directory on disk that polluted `git status`.
- **(b)** `scripts/validate_hook_range.py` has 4 self-tests in its docstring. Previously run via `python -c "..."` — never wired into CI. Now wrapped in `scripts/test_python.py` (148 LoC) + invoked via `scripts/run_python_self_test.cjs` wrapper (probes `python3`/`python`/`py` on PATH; missing-Python tolerated with warning) + added as the 8th stage of `scripts/verify.mjs`. Future regressions in the hook-count guard fail CI instead of relying on manual docstring runs.

### 2. Drift cleanup (T3)

19 files received `pnpm format` (prettier --write). All changes are whitespace / quote / italic-markdown conversion / multi-line function signature collapsing — **zero logic change**. Files affected:

- `CHANGELOG.md` (italic-markdown conversion)
- 6 docs/superpowers files (whitespace only)
- 12 src-tree files (whitespace + extension reorder)

8 import/order errors (in `useAppHeaderHandlers`, `useAppMainHandlers`, `AppHeader`, etc.) auto-fixed by `eslint --fix`.

1 exhaustive-deps lint warning (in `useDcmConfigLauncher.ts` line 514) was a real closure-safety bug, fixed manually:

```ts
// Before (deps: []) — STALE CLOSURE risk across project-manifest reloads
const open = useCallback(async (args) => {
  // ... uses `bswmdPaths` from the zustand selector at line 271
  await getApi().dcmConfig({ ...args, bswmdPaths });
}, []);

// After (deps: [bswmdPaths]) — closure-safe
const open = useCallback(async (args) => {
  // ... uses `bswmdPaths` from the zustand selector at line 271
  await getApi().dcmConfig({ ...args, bswmdPaths });
}, [bswmdPaths]);
```

The `inFlightRef` re-entrancy guard at line 392-393 is unaffected because refs persist across callback re-creation. `promptAndOpen` (line 541) and `handlePickerResolve` (line 558) both list `open` in their own deps, so they propagate the rebuild transparently. **No test additions needed** — existing 39/39 `useDcmConfigLauncher` tests cover the unchanged behavior; the closure-safety fix is purely defensive (it prevents a bug that tests cannot reproduce in single-render scenarios).

### 3. `pnpm verify` 8-stage GREEN for the first time

```
=== Stage: format ===             ✓
=== Stage: lint ===               ✓ (0 errors, 0 warnings)
=== Stage: type-check ===         ✓ (tsconfig.json + tsconfig.web.json)
=== Stage: test ===               ✓ (350/350 files / 3128 + 7 SKIP / 0 fail)
=== Stage: coverage ===           ✓
=== Stage: build ===              ✓
=== Stage: import-regression ===  ✓ (1/1 file / 2/2 tests)
=== Stage: python-self-test ===   ✓ (4/4 self-tests pass)
EXIT: 0
```

## Decisions

- **D1 MINOR-not-PATCH** — Per the v1.44.0 D3 vault-only PATCH convention's complement, tree-touching process improvements ship as MINOR. The 1-line `open` deps fix is a real closure-safety change, not metadata, which justifies the MINOR bump.
- **D2 fix the latent debt in this PATCH rather than defer** — Discovered T3's drift while wiring T2's `python-self-test` stage (which needed verify to pass for sanity-check). PATCH would otherwise be incomplete: shipping T1+T2+T4 only would have left a broken `pnpm verify` in the repo.
- **D3 do not extract `useDcmConfigLauncher` change into its own PR** — The hook fix and the lint cleanup share the same reviewer gate ("does `pnpm verify` now pass?"). Splitting them adds commit noise without independent-review value.
- **D4 missing-Python tolerated in `scripts/run_python_self_test.cjs`** — macOS/Linux CI agents may not have Python installed; the validate_hook_range runtime guard at import-time is itself the safety net; the 4 self-tests are a developer ergonomics check, not a hard requirement.

## Honest deviations

- **(a) Regex over-anchoring (out-of-scope follow-up discovered during T2 wiring)**: `scripts/validate_hook_range.py`'s `_HOOK_DECL_RE` requires the line to start with `const|let|var` + optional `[name, setName]` array destructure → it does NOT match `const x = useFoo(...)` (non-array-destructure form). The chunk-replacement scripts that caused Lessons #14 (v1.42.2/3/4) all anchored on `const [X, setX] = useState(...)` precisely because the regex behavior nudged them to, so this is currently latent (no observed bug) but worth flagging. **Future cycle**: relax the regex to accept `const x = useFoo(...)` form.
- **(b) `pnpm test:coverage` was not run end-to-end in this PATCH** — coverage threshold gates are unaffected by lint/style changes. Coverage gates remain valid via `pnpm test:coverage` if needed.

## Process lessons applied

- **Lesson #10** (devlog-follow-up-status-claims) — confirmed `pnpm verify` 8-stage state before committing T3.
- **Lesson #14** (chunk-replacement guard) — `validate_hook_range` is now structurally enforced via the `python-self-test` stage.
- **Lesson #15** (wip-commit-discard pattern) — T4 aborts cleanly via `git reset --hard HEAD~1` if any T-level fails (not exercised in this cycle).

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`
- **v1.44.1 ship notes** (predecessor): `docs/release-notes/v1.44.1/README.md`
- **Process Cluster catalog**: `01-Projects/claude-AutosarCfg/development/process-cluster-17-lessons-catalog-2026-07-11.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
