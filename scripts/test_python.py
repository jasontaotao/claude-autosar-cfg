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
    (
        "case 5 (v1.45.1): single-identifier binding `const x = useState(...)` matched",
        lambda: _case_single_identifier_binding(),
    ),
    (
        "case 6 (v1.45.1): let binding `let x = useRef(...)` matched",
        lambda: _case_let_binding(),
    ),
    (
        "case 7 (v1.45.1): standalone useFoo(...) at line start matched",
        lambda: _case_standalone_call(),
    ),
    (
        "case 8 (v1.45.1): false positives remain guarded (obj.foo.useState, JSX)",
        lambda: _case_false_positives_guarded(),
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

    Counted hooks (v1.45.1 regex relaxation):
      - 1 array-destructure useState (line 2): `const [appVersion, ...] = useState<string>('')`
      - 1 array-destructure useState (line 3): `const [menuOpen, ...] = useState(false)`
      - 1 array-destructure useCallback (line 4): `const [closeStencil] = useCallback(...)`
        Wait -- line 4 is `const closeStencil = useCallback(...)` (single-identifier
        binding, NOT array destructure). v1.45.1 regex adds support for this form;
        the pre-v1.45.1 regex did NOT match it.
      - 1 standalone useEffect (line 5): `useEffect(() => {`
        The pre-v1.45.1 regex did not match this either; the v1.45.1 standalone-prefix
        alternative now counts it.

    Total: 4 hooks (after v1.45.1 PATCH relaxation). Pre-v1.45.1 (regex
    over-anchoring) this case would have counted only 2 (the two useState lines).
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
    assert count == 4, f"expected 4 hooks, got {count}"


def _case_single_identifier_binding() -> None:
    """v1.45.1 PATCH — `const x = useState(...)` form now matched.

    The pre-v1.45.1 regex required `[name, setName]` array-destructure form,
    which meant `const x = useState(0)` and `const x = useRef(null)` slipped
    through the guard. v1.45.1 relaxes the binding prefix to accept either
    `[name, setName]` or a single identifier `x`. This case verifies the new
    form is recognized.
    """
    src = (
        "const x = useState(0);\n"
        "const y = useRef(null);\n"
        "const z = useCallback(() => {}, []);\n"
    )
    count = assert_hook_count(
        src, expected_count=3, label="case 5 (single-identifier binding)"
    )
    assert count == 3, f"expected 3 hooks, got {count}"


def _case_let_binding() -> None:
    """v1.45.1 PATCH — `let x = useFoo(...)` form now matched."""
    src = (
        "let x = useRef(null);\n"
        "let y = useState(0);\n"
        "var z = useReducer(reducer, 0);\n"
    )
    count = assert_hook_count(
        src, expected_count=3, label="case 6 (let/var binding)"
    )
    assert count == 3, f"expected 3 hooks, got {count}"


def _case_standalone_call() -> None:
    """v1.45.1 PATCH — standalone `useFoo(...)` at line start matched.

    Pre-v1.45.1 the regex required a binding prefix. The relaxation adds a
    no-prefix alternative so `useEffect(() => {}, []);` at line start counts.
    Used by `useEffect` lines that aren't assigned to a binding.
    """
    src = (
        "useEffect(() => {\n"
        "  document.title = 'test';\n"
        "}, []);\n"
        "useEffect(() => {}, []);\n"
    )
    count = assert_hook_count(
        src, expected_count=2, label="case 7 (standalone useEffect)"
    )
    assert count == 2, f"expected 2 hooks, got {count}"


def _case_false_positives_guarded() -> None:
    """v1.45.1 PATCH — false positives from relaxation remain guarded.

    These forms must still NOT be matched:
      - `obj.foo.useState(...)` (method-call on property)
      - `useFoo.useState(...)` (static call on custom object)
      - `<Foo onClick={() => useState(0)} />` (JSX attribute, hook is nested in arrow)
      - `const cb = () => useState(0);` (hook in arrow body, not at line start)
    """
    src = (
        "obj.foo.useState(0);\n"  # NOT matched
        "useFoo.useState(0);\n"  # NOT matched (custom object access)
        "<Foo onClick={() => useState(0)} />\n"  # NOT matched (JSX)
        "const cb = () => useState(0);\n"  # NOT matched (arrow body, not line-start)
    )
    count = count_hooks_in_range(src)
    assert count == 0, (
        f"expected 0 hooks (false positives guarded), got {count}. "
        f"Check that the regex doesn't match obj.foo.useState, "
        f"useFoo.useState, JSX-attribute hooks, or arrow-body hooks."
    )


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
