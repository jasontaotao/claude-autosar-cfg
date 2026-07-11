# v1.45.1 — Regex Over-Anchoring Closure (PATCH)

**Released:** 2026-07-11
**Tag:** [`v1.45.1`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.45.1)
**Cycle type:** PATCH (1-tooling-fix + 4 new test cases + 1 lesson amendment)
**Ship basis:** 1 source commit (T1) + 1 vault-only T3 lesson amendment + 1 docs ship

## Summary

Closes v1.45.0 honest deviation (a): `scripts/validate_hook_range.py`'s `_HOOK_DECL_RE` over-anchored on array-destructure binding form. Lines like `const x = useState(0)` or `let x = useRef(null)` were NOT counted by the guard, producing a silent coverage gap on lesson #14 protection. v1.45.1 PATCH relaxes the regex to accept single-identifier binding (`const|let|var x = useFoo(...)`) plus retains array-destructure and standalone forms. **No source-code behavior change** (regex is internal to the guard module, runs only in CI); the only externally-observable effect is "fewer chunk-replacement scripts will accidentally swallow hooks in non-array-destructure form".

| | v1.45.0 baseline | **v1.45.1** | Delta |
|---|---|---|---|
| `scripts/validate_hook_range.py` regex binding forms supported | 2 (array destructure + standalone) | 3 (+ single-identifier) | +1 |
| `scripts/test_python.py` self-test cases | 4 | 8 | +4 |
| `pnpm verify` `python-self-test` stage | 4/4 PASS | 8/8 PASS | +4 |
| Tests | 3128 + 7 SKIP | 3128 + 7 SKIP | 0 |
| `Lesson #14` evidence | 1 systematic flaw × 3 instances (single-session caveat) | unchanged (no new observations) | 0 |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `c755cba` | `fix(scripts): v1.45.1 PATCH -- validate_hook_range regex over-anchoring relaxation` |
| T2 | (in T1) | (same commit: `scripts/test_python.py` 4 new cases + case 4 expected_count 3 → 4) |
| T3 (vault) | n/a | `01-Projects/claude-AutosarCfg/development/lessons/marker-based-text-replacement-must-validate-block-contents-not-line-count.md` extended with "Update 2026-07-11 (v1.45.1 PATCH) — regex over-anchoring relaxation" section |
| T4 | (this commit) | `docs(release): v1.45.1 PATCH -- regex over-anchoring closure` |

## What's new

### Regex relaxation in `_HOOK_DECL_RE`

The pre-v1.45.1 regex required the binding prefix to be either `[name, setName]` array-destructure form or absent (standalone `useFoo(...)`). v1.45.1 accepts:

```ts
// Retained from v1.44.1:
const [a, setA] = useState(0);
useEffect(() => {}, []);

// NEW in v1.45.1:
const x = useState(0);
let y = useRef(null);
var z = useReducer(reducer, 0);
```

### Why this gap was latent (and not an observed bug)

All 3 lessons-#14 confirmations (v1.42.2 T4 R3, v1.42.3 T2 R2, v1.42.4 T2 R2) anchored on array-destructure form. Why?

- The chunk-replacement scripts "naturally" gravitated toward `const [X, setX] = useState(...)` anchor strings because array-destructure is the most common hook-call shape in TS code.
- The original regex matched array-destructure more reliably than other forms, so scripts anchoring on array-destructure strings passed the count check.
- No script had yet exercised the single-identifier form, so the silent coverage gap was not caught.

The lesson-#14 fix recommendation ("count hooks in range BEFORE applying") was correct all along — the lesson applies by-construction whether the binding is array-destructure or single-identifier. The regex over-anchoring just narrowed the **coverage of the guard**, not the principle.

### 4 new self-test cases

| Case | Verifies |
|---|---|
| case 5 (single-identifier binding) | `const x = useState(0); const y = useRef(null); const z = useCallback(() => {}, []);` → count = 3 |
| case 6 (let/var binding) | `let x = useRef(null); let y = useState(0); var z = useReducer(reducer, 0);` → count = 3 |
| case 7 (standalone useEffect) | `useEffect(() => {}, []);` at line start counted |
| case 8 (false-positives-guarded) | `obj.foo.useState`, `useFoo.useState`, JSX-attribute hooks, arrow-body hooks → count = 0 |

Plus: **case 4 expected_count 3 → 4** (the relaxed regex now counts the `useEffect` at line 5 of the integration test that the old regex incidentally missed).

### Lesson #14 amendment (vault-only)

`01-Projects/claude-AutosarCfg/development/lessons/marker-based-text-replacement-must-validate-block-contents-not-line-count.md` extended with an "Update 2026-07-11 (v1.45.1 PATCH) — regex over-anchoring relaxation" section that documents:

1. The latent coverage gap (silent, not observed)
2. Why the gap was masked by the single-session script-template bias in lessons-#14 confirmations
3. The v1.45.1 regex change + false-positives-still-guarded
4. Explicit "**not a new lesson observation**" disclaimer (no promotion 1/3 → 2/3; the lesson's confirmation count remains "1 systematic script-template flaw × 3 instances")

## Decisions

- **D1 PATCH-not-MINOR** — single regex fix + 4 test cases, no src-tree behavioral change; per v1.45.0 D1 complement (tree-touching src/process improvements ship as MINOR), this fits at the small end of the boundary. PATCH for size-of-change.
- **D2 case 4 expected_count 3 → 4** — the relaxed regex now counts the useEffect at line 5 that the old regex incidentally missed. **Coverage correction**, not behavior change. Test reflects reality.
- **D3 single-line lesson amendment, no new lesson promotion** — extension of lesson #14, not a new observation.
- **D4 accept false-negative trade-off for arrow-body hooks** (`const cb = () => useState(0)`) — regex is line-anchored; only line-start hooks count. Hook calls nested in arrow/function bodies that are NOT at line start remain uncounted. Acceptable because lesson-#14 chunk-replacement scripts anchor on top-level hook statements.

## Test results

- `pnpm format:check` → clean
- `pnpm lint --max-warnings 0` → 0 errors, 0 warnings
- `pnpm type-check` → both tsconfigs clean
- `pnpm test` → 350/350 files / 3128 + 7 SKIP / 0 fail (zero delta vs v1.45.0)
- `pnpm verify` → **8-stage GREEN, python-self-test now 8/8** (was 4/4 in v1.45.0)

## Process lessons applied

- **Lesson #14** (chunk-replacement guard) — by-construction now extends to single-identifier binding form. Lesson #14 amendment recorded in `01-Projects/claude-AutosarCfg/development/lessons/marker-based-text-replacement-must-validate-block-contents-not-line-count.md`.
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; inline write path used for forward-propagation (avoids the pkm-capture stall pattern observed earlier today).

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`
- **v1.45.0 ship notes** (predecessor): `docs/release-notes/v1.45.0/README.md`
- **Lesson #14 file**: `01-Projects/claude-AutosarCfg/development/lessons/marker-based-text-replacement-must-validate-block-contents-not-line-count.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
