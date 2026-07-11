"""Hook-count guard for marker-based chunk replacement scripts.

Implements the fix recommendation from lesson #14
(`marker-based-text-replacement-must-validate-block-contents-not-line-count`,
Process Cluster Tier 10). Before applying a chunk replacement that
spans React hook declarations (useState / useEffect / useCallback /
useRef / useMemo / custom hooks starting with `use[C-Z]`), count the
hooks in the source range and warn if the count doesn't match the
expected count. This prevents the pattern observed in v1.42.2 T4 +
v1.42.3 T2 + v1.42.4 T2 where Python `must_replace` scripts
anchored on `const [X, setX] = useState(...)` silently swallowed
1-7 unintended hooks between anchors.

**Promotion**: promoted to standalone after 3/3 confirmations in a
single session (v1.42.2 + v1.42.3 + v1.42.4). The promotion is
qualified by a single-session caveat per v1.43.1 D5 amendment — the
3 confirmations may indicate 1 systematic script-template flaw
rather than 3 independent observations. Even so, the script-template
flaw is real and the guard is correct advice.

**Usage in tmp-*.py scripts**:

```python
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
from validate_hook_range import count_hooks_in_range, HookCountMismatch

src = Path("src/renderer/components/AppHeader.tsx").read_text(encoding="utf-8")
head_marker = "const [state, setState] = useState<AppHeaderState>(INITIAL);"
tail_marker = "const canSaveProject = project !== null && !state.busy && projectDirtyCount === 0;"
head_idx = src.find(head_marker)
tail_idx = src.find(tail_marker, head_idx)
range_block = src[head_idx:tail_idx + len(tail_marker)]

try:
    count_hooks_in_range(
        range_block,
        expected_count=3,
        label="R2: shell state+selectors → hook destructure",
    )
except HookCountMismatch as e:
    print(f"ABORT: {e}", file=sys.stderr)
    sys.exit(1)

# Proceed with the replacement
src = src.replace(range_block, "<new destructure>", 1)
Path("src/renderer/components/AppHeader.tsx").write_text(src, encoding="utf-8")
```

The guard runs as a pre-flight check BEFORE the `src.replace()` call,
so the script aborts cleanly without modifying the file if the count
mismatches.
"""

from __future__ import annotations

import re
from typing import Final


# Regex matching React hook declarations + custom hooks (useXXX where
# XXX starts with a non-lowercase letter, covering useState/useEffect/
# useCallback/useRef/useMemo/useTransition/etc.).
#
# Anchored at the start of a line (with optional leading whitespace)
# so it doesn't match `useState` inside a string literal or comment.
#
# The hook-call prefix accepts two shapes (v1.45.1 PATCH relaxation):
#
#   (1) Binding prefix: `const|let|var X = useFoo(...)` where X is
#       either an array-destructure `[a, setA]` or a single identifier
#       `x`. The previous regex only matched the array-destructure
#       form (lesson #14 chunk-replacement scripts all anchored on
#       `const [X, setX] = useState(...)` precisely because the regex
#       behavior nudged them to). This over-anchoring meant that
#       `const x = useFoo(...)` and `let x = useRef(...)` slipped
#       through the guard -- a latent lesson-#14 coverage gap because
#       no tmp-*.py chunk-replacement script had yet exercised the
#       single-identifier form, but the risk shape was identical.
#
#   (2) Standalone prefix: bare `useFoo(...)` at line start (covers
#       `useEffect(() => {}, []);` lines with no assignment).
#
# Generic type arguments (`<T>`, `<AppHeaderState>`, `<string>` etc.)
# are accepted via `(?:<[^<>]*>)?`. The `<[^<>]*>` (no nested `<>`)
# rule prevents greedy matches across multi-line arrow functions.
#
# Excluded (false-positive guarded):
#   - `obj.foo.useState(...)` -- method call on a property
#   - `useFoo.useState(...)`    -- static call on a custom object
#   - JSX `<Foo onClick={() => useState(0)} />` -- expression in JSX
#     attribute (the `useState` is inside the arrow body which is not
#     at line start)
#   - Hook calls in arrow/function bodies NOT at line start (e.g.
#     `const cb = () => useState(0);`) -- the regex is line-anchored,
#     so only line-start hooks count. This is a known false-negative
#     accepted trade-off (chunk-replacement scripts that want to
#     absorb hooks inside callbacks should NOT use this guard; they
#     should not be writing callbacks at all).
_HOOK_DECL_RE: Final[re.Pattern[str]] = re.compile(
    r"^\s*"
    r"(?:"
    r"(?:const|let|var)\s+(?:\[[^\]]+\]|[A-Za-z_$][\w$]*)\s*=\s*"
    r"|"
    r""  # no-prefix alternative (standalone `useFoo(...)` at line start)
    r")"
    r"(use(?:State|Effect|Callback|Ref|Memo|Reducer|Context|LayoutEffect|ImperativeHandle|DebugValue|Transition|Id|SyncExternalStore|InsertionEffect|ActionState|Optimistic)|use[A-Z]\w*)"
    r"(?:<[^<>]*>)?\s*\(",
    re.MULTILINE,
)


def count_hooks_in_range(source_range: str) -> int:
    """Count React hook declarations in the given source range.

    Args:
        source_range: A slice of source code (typically the substring
            between two anchor markers in a chunk-replacement script).

    Returns:
        The number of hook declarations found. Includes both built-in
        hooks (useState/useEffect/useCallback/useRef/useMemo) and
        custom hooks (useFooBar where FooBar starts with a capital
        letter, indicating it's a hook by React convention).

    Note:
        The regex is intentionally permissive — it counts any
        line-anchored call to a function whose name starts with `use`
        followed by a capital letter. This may produce false positives
        if the source range contains a non-hook function named e.g.
        `useSomeUtil`. The companion `expected_count` check in
        `assert_hook_count` allows the caller to specify the expected
        count, so a false positive is detectable by a mismatched
        count.
    """
    return len(_HOOK_DECL_RE.findall(source_range))


class HookCountMismatch(Exception):
    """Raised when the hook count in a source range doesn't match the
    expected count.

    Attributes:
        label: Human-readable label for the assertion (e.g. "R2:
            shell state+selectors → hook destructure").
        expected: The expected hook count.
        actual: The actual hook count found.
        range_chars: The length of the source range (in chars).
        range_first_line: The first line of the source range, for
            debugging context.
    """

    def __init__(
        self,
        label: str,
        expected: int,
        actual: int,
        range_chars: int,
        range_first_line: str,
    ) -> None:
        self.label = label
        self.expected = expected
        self.actual = actual
        self.range_chars = range_chars
        self.range_first_line = range_first_line
        super().__init__(
            f"[{label}] hook count mismatch: expected {expected}, "
            f"found {actual} in {range_chars} chars. "
            f"First line of range: {range_first_line!r}"
        )


def assert_hook_count(
    source_range: str,
    expected_count: int,
    label: str,
) -> int:
    """Count hooks in source range and assert the count matches
    expected. Returns the actual count on success.

    Args:
        source_range: The source range to inspect.
        expected_count: The number of hooks the caller expects to find.
        label: Human-readable label for the assertion (used in error
            message).

    Returns:
        The actual hook count found in the range.

    Raises:
        HookCountMismatch: If the actual count doesn't match
            `expected_count`.
    """
    actual = count_hooks_in_range(source_range)
    if actual != expected_count:
        first_line = source_range.split("\n", 1)[0][:120]
        raise HookCountMismatch(
            label=label,
            expected=expected_count,
            actual=actual,
            range_chars=len(source_range),
            range_first_line=first_line,
        )
    return actual


__all__ = [
    "HookCountMismatch",
    "assert_hook_count",
    "count_hooks_in_range",
]