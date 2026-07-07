"""scripts/__tests__/test_tier3_push.py — v1.35.0 MINOR T1 regression-guard.

Pins the v1.34.0 ship-blocking bug fix: get_parent_tree_sha must prefer
the supplied `server_sha` argument over a local git rev-parse lookup.

Bug history: v1.34.0 T5 first shipped via Tier 3. Initial implementation
called `git rev-parse {commit_sha}^` to look up the parent locally and
then queried `commits/{parent_local}` on the server. This returned 404
because the local parent SHA differs from the server's parent SHA
(content-identical but content-addressed under different tree SHAs —
`Local SHA ≠ remote SHA — 内容一致, SHA 不同`).

Fix: thread the prev-server-sha through the call chain. When supplied,
the helper uses `git/commits/{server_sha}` directly (the /git/commits/
endpoint returns the commit object with `tree.sha` at the top level,
unlike /commits/:sha which nests it under .commit.tree.sha).

This test mocks gh_api to assert the helper takes the server_sha path and
returns the server's tree SHA verbatim. It does NOT mock git (the local
rev-parse path is unreachable when server_sha is supplied; if the impl
regresses, the mock will not be called and the assertion will pass with
the wrong value).
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

# Allow `import tier3_push` regardless of where pytest is invoked from.
# The test rootdir contains scripts/, but pytest 9 (importlib-mode)
# imports scripts/__tests__/tier3_push.test as scripts.__tests__.tier3_push.test
# and does not auto-prepend scripts/. The conftest.py at
# scripts/__tests__/conftest.py handles the sys.path insertion.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import tier3_push  # noqa: E402


def test_get_parent_tree_sha_prefers_server_sha_over_local_lookup():
    """When server_sha is supplied, gh_api must be called with the
    server endpoint (/git/commits/{server_sha}) and the response's
    `tree.sha` must be returned verbatim. Local git rev-parse MUST NOT
    be called.
    """
    server_sha = "abc123def456abc123def456abc123def456abcd"
    expected_tree_sha = "deadbeef" * 5  # 40-char SHA, format-checked downstream

    fake_response = {"tree": {"sha": expected_tree_sha}}

    with patch.object(tier3_push, "gh_api", return_value=fake_response) as gh_mock, \
         patch.object(tier3_push, "git") as git_mock:
        result = tier3_push.get_parent_tree_sha(
            commit_sha="local_commit_sha_will_not_be_used",
            server_sha=server_sha,
        )

    # Assert: gh_api called with the server endpoint + server_sha
    gh_mock.assert_called_once_with("GET", f"git/commits/{server_sha}")
    # Assert: result is the server's tree SHA, not a local lookup
    assert result == expected_tree_sha
    # Assert: local git rev-parse was NOT called (the fix path)
    git_mock.assert_not_called()


def test_get_parent_tree_sha_falls_back_to_local_lookup_when_no_server_sha():
    """When server_sha is None, the helper falls back to local
    git rev-parse + a /commits/{parent_local} lookup. This is the
    pre-fix path; still valid for use cases where server_sha is unknown.
    """
    local_commit_sha = "1111111111111111111111111111111111111111"
    parent_local_sha = "2222222222222222222222222222222222222222"
    expected_tree_sha = "cafebabe" * 5

    with patch.object(tier3_push, "git", return_value=parent_local_sha) as git_mock, \
         patch.object(
             tier3_push,
             "gh_api",
             return_value={"commit": {"tree": {"sha": expected_tree_sha}}},
         ) as gh_mock:
        result = tier3_push.get_parent_tree_sha(
            commit_sha=local_commit_sha,
            server_sha=None,
        )

    # Local rev-parse called for parent
    git_mock.assert_called_once_with("rev-parse", f"{local_commit_sha}^")
    # Server endpoint uses /commits/{parent_local} (nested commit.tree.sha)
    gh_mock.assert_called_once_with("GET", f"commits/{parent_local_sha}")
    assert result == expected_tree_sha
