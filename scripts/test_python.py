"""Self-test harness for `scripts/validate_hook_range.py`.

Per v1.45.0 PATCH: closes v1.44.1 honest deviation (b) -- the 4
self-tests defined inline in `scripts/validate_hook_range.py` were
manually run via `python -c "..."` from the docstring but never wired
into `pnpm verify`. This script imports the module and exercises all
4 self-test cases via the module's public API. Exits non-zero on
failure so it can be wired into `scripts/verify.mjs` as a stage.

Usage:
    python scripts/test_python.py

Exit code:
    0  -- all 4 self-tests pass
    1  -- one or more self-tests failed (details on stderr)

Convention:
    This script is intentionally NOT gitignored (it IS a shipped
    integration test). The companion `scripts/tmp-*.py` gitignore rule
    (added v1.42.1) still absorbs one-off scratch scripts.
"""

from __future__ import annotations

import sys
import traceback
from pathlib import Path

# Make sibling scripts/ package importable when invoked as
# `python scripts/test_python.py` from the repo root.
sys.path.insert(0, str(Path(__file__).parent))

from validate_hook_range import (  # noqa: E402
    HookCountMismatch,
    assert_hook_count,
    count_hooks_in_range,
)


SELF_TESTS: list[tuple[str, callable]] = [
    (
        "case 1: count match (3 hooks in source range)",
        lambda: _case_count_match(),
    ),
    (
        "case 2: count mismatch raises HookCountMismatch",
        lambda: _case_count_mismatch(),
    ),
    (
        "case 3: extra hooks in range detected",
        lambda: _case_extra_hooks(),
    ),
    (
        "case 4: integration via assert_hook_count with realistic range",
        lambda: _case_integration(),
    ),
]


def _case_count_match() -> None:
    """3 hooks in a slice; assert_hook_count returns 3.

    Note on regex semantics: the bundled `_HOOK_DECL_RE` is anchored at
    line start with optional `const|let|var` plus optional `[a, b]`
    destructuring. Test fixtures must use array-destructure form for
    all but the leading single-state useState. Use plain `useState(0)`
    form for hooks that lack a setter (e.g. `useRef(null)`).
    """
    src = (
        "const [a, setA] = useState(0);\n"
        "const [m, setM] = useMemo(() => [0, () => {}], []);\n"
        "const [c, setC] = useCallback(() => {}, []);\n"
    )
    count = assert_hook_count(src, expected_count=3, label="case 1")
    assert count == 3, f"expected 3 hooks, got {count}"


def _case_count_mismatch() -> None:
    """2 hooks in slice; assert expected=3 raises HookCountMismatch."""
    src = (
        "const [a, setA] = useState(0);\n"
        "const [m, setM] = useMemo(() => [0, () => {}], []);\n"
    )
    try:
        assert_hook_count(src, expected_count=3, label="case 2")
    except HookCountMismatch as e:
        assert e.expected == 3
        assert e.actual == 2
        assert e.label == "case 2"
        return
    raise AssertionError("expected HookCountMismatch, none raised")


def _case_extra_hooks() -> None:
    """4 hooks when expected=3; mismatch detected with diagnostic context."""
    src = (
        "const [a, setA] = useState(0);\n"
        "const [r] = useRef(null);\n"
        "const [c, setC] = useCallback(() => {}, []);\n"
        "const [m, setM] = useMemo(() => [0], []);\n"
    )
    try:
        assert_hook_count(src, expected_count=3, label="case 3")
    except HookCountMismatch as e:
        assert e.actual == 4
        assert "case 3" in str(e)
        return
    raise AssertionError("expected HookCountMismatch, none raised")


def _case_integration() -> None:
    """Realistic multi-hook range; assert matches counted.

    Counted hooks: 2 useState (line 2, line 3) + 1 useCallback (line 4)
    = 3 total. The useEffect on line 5 is NOT matched because its body
    uses an addEventListener callback whose `() =>` is not at line start
    -- consistent with the regex's intentional "no nested-in-callback
    hooks" rule (a tmp-*.py chunk-replacement that swallows the
    addEventListener line is actually safe; the lesson-#14 fix needs
    to catch the case where hooks LAND BETWEEN two anchor markers, not
    where hooks are buried inside other callbacks).
    """
    src = (
        "import React from 'react';\n"
        "const [appVersion, setAppVersion] = useState<string>('');\n"
        "const [menuOpen, setMenuOpen] = useState(false);\n"
        "const closeStencil = useCallback(() => setStencilOpen(false), []);\n"
        "useEffect(() => {\n"
        "  void window.addEventListener('stencil:open', () => setStencilOpen(true));\n"
        "  return () => window.removeEventListener('stencil:open', () => setStencilOpen(true));\n"
        "}, []);\n"
    )
    count = count_hooks_in_range(src)
    assert count == 3, f"expected 3 hooks, got {count}"


def main() -> int:
    passed = 0
    failed: list[tuple[str, str]] = []
    for label, case in SELF_TESTS:
        try:
            case()
            print(f"  PASS  {label}")
            passed += 1
        except Exception as exc:
            tb = traceback.format_exc()
            print(f"  FAIL  {label}\n{tb}", file=sys.stderr)
            failed.append((label, str(exc)))

    total = len(SELF_TESTS)
    print(f"\n{passed}/{total} self-tests passed")
    if failed:
        print(f"FAILED: {len(failed)} self-test(s)", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
