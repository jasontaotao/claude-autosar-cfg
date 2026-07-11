# v1.44.1 PATCH — Lesson #14 Fix Implementation + M2 Closure

**Released:** 2026-07-11
**Tag:** [`v1.44.1`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.44.1)
**Cycle type:** PATCH (process-improvement + tooling)
**Ship basis:** 1 source commit (T2) + 1 vault-only M2 fix (T1, no commit)

## Summary

Implements the Lesson #14 (`marker-based-text-replacement-must-validate-block-contents-not-line-count`) fix recommendation as a reusable Python module. Closes code-reviewer M2 finding (catalog 14 frontmatter `status: active` → `superseded`; same for catalog 13). 0 functional change for `src/` tree.

| | v1.44.0 baseline | **v1.44.1** | Delta |
|---|---|---|---|
| `src/` LoC | unchanged | +174 (new `scripts/validate_hook_range.py`) | +174 |
| Process Cluster catalog | 17 lessons (active) | 17 lessons (catalog 14 + 13 → superseded) | 0 |
| Tests | 3128 + 7 SKIP | 3128 + 7 SKIP | 0 |
| Functional change | — | **0** (tooling only) | — |

## Commits (1 source + 1 vault-only)

| # | Commit | Title |
|---|---|---|
| T1 (vault) | n/a | Set `status: superseded` on `process-cluster-14-lessons-catalog-2026-07-11.md` + `process-cluster-13-lessons-catalog-2026-07-10.md` |
| T2 | `8ffb8be` | `feat(scripts): v1.44.1 PATCH T2 -- add validate_hook_range module (Lesson #14 fix recommendation: hook-count guard for chunk-replacement scripts)` |

## What's new

### `scripts/validate_hook_range.py` (174 LoC, NEW)

Reusable Python module that counts React hook declarations in a source range and asserts the count matches expectations. Future tmp-*.py chunk-replacement scripts (per the `.gitignore` rule `scripts/tmp-*.py` added in v1.42.1 `e79ef70`) can import the guard and abort cleanly if the count doesn't match expectations.

```python
from validate_hook_range import assert_hook_count, HookCountMismatch

# Before applying src.replace(range_block, new_text, 1):
try:
    assert_hook_count(
        range_block,
        expected_count=3,
        label="R2: shell state+selectors → hook destructure",
    )
except HookCountMismatch as e:
    print(f"ABORT: {e}", file=sys.stderr)
    sys.exit(1)

# Proceed with the replacement
src = src.replace(range_block, "<new destructure>", 1)
```

The guard runs as a pre-flight check BEFORE the `src.replace()` call, so the script aborts cleanly without modifying the file if the count mismatches.

**API**:
- `count_hooks_in_range(source_range: str) -> int` — returns hook count (no exception)
- `assert_hook_count(source_range: str, expected_count: int, label: str) -> int` — returns count on match, raises `HookCountMismatch` on mismatch
- `class HookCountMismatch(Exception)` — diagnostic context: label + expected + actual + range_chars + first_line of range

**Regex coverage**:
- Built-in hooks: `useState` / `useEffect` / `useCallback` / `useRef` / `useMemo` / `useReducer` / `useContext` / `useLayoutEffect` / `useImperativeHandle` / `useDebugValue` / `useTransition` / `useId` / `useSyncExternalStore` / `useInsertionEffect` / `useActionState` / `useOptimistic`
- Custom hooks: any `use[C-Z]\w*` pattern (by React naming convention)
- Generics: `<T>` / `<AppHeaderState>` / `<string>` etc.
- Array destructuring: `const [x, setX] = useState(...)`
- Direct call: `useEffect(...)`
- Skip: non-hook functions named `usefoo` (lowercase second char, indicating utility not hook)
- Skip: `useState` inside string literals / comments (line-anchored regex doesn't match across line breaks)

**Why this module exists**:

Lesson #14 was promoted to standalone after 3 confirmations in a single session (v1.42.2 T4 R3 + v1.42.3 T2 R2 + v1.42.4 T2 R2). All 3 incidents used Python `must_replace` scripts that anchored on `const [X, setX] = useState(...)` and silently swallowed 1-7 unintended hooks in the range. The fix recommendation in Lesson #14 was:

> Count the actual hook declarations in the source range before applying

This PATCH implements that recommendation as a reusable module so future tmp-*.py scripts can prevent the pattern by construction, not just by lesson-recall.

### Vault-only M2 fix (T1, no source commit)

`process-cluster-14-lessons-catalog-2026-07-11.md` + `process-cluster-13-lessons-catalog-2026-07-10.md` frontmatter set to:
- `status: superseded`
- `superseded-by: process-cluster-17-lessons-catalog-2026-07-11.md`
- `updated: 2026-07-11`

Closes code-reviewer M2 finding from the v1.44.0 PATCH review (2026-07-11). Future dispatches will see `status: superseded` when consulting the old catalogs, preventing confusion about which catalog is the canonical reference.

## Test results

- 4 self-tests in `validate_hook_range.py` docstring all PASS (run via `python -c "..."`)
- vitest 350/350 files / 3128 + 7 SKIP / 0 fail (zero delta vs v1.44.0)
- `pnpm tsc --noEmit -p tsconfig.json` clean
- `pnpm tsc --noEmit -p tsconfig.web.json` clean
- `pnpm verify` 7-stage GREEN

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Process Cluster catalog**: `01-Projects/claude-AutosarCfg/development/process-cluster-17-lessons-catalog-2026-07-11.md`
- **Lesson #14 file**: `01-Projects/claude-AutosarCfg/development/lessons/marker-based-text-replacement-must-validate-block-contents-not-line-count.md`
- **v1.44.0 ship notes** (predecessor): `docs/release-notes/v1.44.0/README.md`
- **Code-reviewer findings** (this PATCH closes): code-reviewer agent `a4448159553a23021` (run 2026-07-11)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)