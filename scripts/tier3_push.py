"""scripts/tier3_push.py — push commits to GitHub via gh api when direct git push is blocked.

Tier 3 fallback (per project MEMORY): github.com:443 blocked, api.github.com works.

This script has TWO modes:

AUTO mode (default):
1. Walks the commit chain from local HEAD to a commit whose tree matches
   remote main's tree (oldest first)
2. For each commit, uses `git diff-tree` to find only the CHANGED blobs
3. Uploads each changed blob via curl (bypasses gh's command-line length limit)
4. Creates a new tree with base_tree=parent_tree (server computes delta)
5. Creates the new commit on server
6. PATCHes the main ref to point at the new HEAD

COMPOSITE mode (when --base is supplied AND multiple commits pending):
Local and remote histories diverged such that no local commit has the
same tree as remote main. Walker cannot find a stop point. Composite mode
uploads ALL blobs from local HEAD tree in a single server commit parented
to remote main. Resulting tree equals local HEAD; remote main fast-forwards
to a non-ancestor commit (orphan by SHA but superset by content).

Orphan-recovery: if the push produces a non-fast-forward PATCH (server
already advanced or composite produced non-ancestor), the script exits with
an explicit RuntimeError. Recovery: `git fetch origin main && git reset
--hard origin/main` after Tier 3 fallback completes.

Usage:
  python scripts/tier3_push.py [--dry-run] [--base <local_sha>]
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys

REPO = "jasontaotao/claude-autosar-cfg"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], encoding="utf-8").strip()


def get_remote_main_sha() -> str:
    """Fetch the actual remote main SHA via gh api (not stale git origin/main cache)."""
    out = subprocess.check_output(
        ["gh", "api", f"repos/{REPO}/git/refs/heads/main", "--jq", ".object.sha"],
        encoding="utf-8",
    )
    return out.strip()


def find_local_commit_with_remote_tree(remote_sha: str) -> str | None:
    """Walk local history to find a commit whose tree matches the remote SHA's tree.

    Local and remote have different commit SHAs for the same content (per
    project MEMORY: 'Local SHA ≠ remote SHA'). Tier 3 push needs to identify
    which local commit corresponds to the current remote main, so it can
    stop the walk there and push only NEW commits.
    """
    remote_tree = gh_api("GET", f"git/commits/{remote_sha}")["tree"]["sha"]
    print(f"Remote {remote_sha[:8]} tree: {remote_tree[:8]}")

    # Walk local HEAD backwards, comparing each commit's tree to remote tree
    current = "HEAD"
    seen = set()
    while current not in seen:
        seen.add(current)
        local_tree = git("rev-parse", f"{current}^{{tree}}")
        if local_tree == remote_tree:
            return current
        parent = git("rev-parse", f"{current}^")
        if parent == current:
            # Reached root
            return None
        current = parent
    return None


def git_bytes(*args: str) -> bytes:
    return subprocess.check_output(["git", *args])


def gh_api(method: str, path: str, body: dict | None = None) -> dict:
    """Make a gh api call with JSON body. For complex bodies, use curl via stdin."""
    cmd = ["gh", "api", "-X", method, f"repos/{REPO}/{path}"]
    if body is not None:
        for k, v in body.items():
            cmd += ["-f", f"{k}={v}"]
    out = subprocess.check_output(cmd, encoding="utf-8")
    return json.loads(out) if out.strip() else {}


def curl_json(method: str, path: str, body: dict) -> dict:
    """POST/PATCH via curl with JSON body from stdin (bypasses command line length limit).

    Must explicitly pass the gh auth token — `gh api` adds it automatically,
    but plain curl gets 401 "Requires authentication" without it. Use
    `gh auth token` to retrieve the current token (same keyring source).
    """
    url = f"https://api.github.com/repos/{REPO}/{path}"
    payload = json.dumps(body)  # str, not bytes — encoding="utf-8" on run() makes stdin str
    token = subprocess.check_output(["gh", "auth", "token"], encoding="utf-8").strip()
    result = subprocess.run(
        [
            "curl", "-sS", "-X", method,
            "-H", f"Authorization: token {token}",
            "-H", "Content-Type: application/json",
            "-H", "Accept: application/vnd.github+json",
            "--data-binary", "@-",
            url,
        ],
        input=payload,
        capture_output=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return json.loads(result.stdout) if result.stdout.strip() else {}


def get_changed_blobs(commit_sha: str) -> list[dict]:
    """For a commit, return list of {path, mode, sha} for blobs that changed.

    `git diff-tree -r --no-renames -z COMMIT^ COMMIT` output format:
    :old_mode new_mode old_sha new_sha status\\0path\\0
    e.g.: ":000000 100644 0000... 7288... A\\0docs/.../view-f.md\\0"
    """
    raw = git("diff-tree", "-r", "--no-commit-id", "--no-renames", "-z", f"{commit_sha}^", commit_sha)
    blobs = []
    # Split on NUL; the format alternates [meta, path, meta, path, ...]
    parts = raw.split("\0")
    # Skip the trailing empty part if present
    parts = [p for p in parts if p]
    i = 0
    while i + 1 < len(parts):
        meta = parts[i]
        path = parts[i + 1]
        i += 2
        if not meta.startswith(":"):
            continue
        # meta format: ":old_mode new_mode old_sha new_sha status"
        meta_parts = meta.split()
        if len(meta_parts) != 5:
            continue
        old_mode, new_mode, _old_sha, new_sha, status = meta_parts
        if status.startswith("D"):
            continue
        if status.startswith("R") or status.startswith("C"):
            # Renames/copies: path is "orig\tnew"; we don't support these here
            continue
        blobs.append({
            "path": path,
            "mode": new_mode,
            "sha": new_sha,
        })
    return blobs


def upload_blob(blob: dict) -> str:
    """Upload a single blob via curl. Returns server SHA (== local SHA for unchanged bytes)."""
    content_bytes = git_bytes("cat-file", "blob", blob["sha"])
    # Detect encoding
    try:
        content_text = content_bytes.decode("utf-8")
        body = {"content": content_text, "encoding": "utf-8"}
    except UnicodeDecodeError:
        body = {"content": base64.b64encode(content_bytes).decode("ascii"), "encoding": "base64"}

    resp = curl_json("POST", "git/blobs", body)
    server_sha = resp.get("sha", "")
    if server_sha != blob["sha"]:
        print(f"  WARN: blob SHA mismatch {blob['path']}: local={blob['sha']} server={server_sha}", file=sys.stderr)
    return server_sha


def get_commit_message(sha: str) -> str:
    return git("log", "-1", "--format=%B", sha)


def get_parent_tree_sha(commit_sha: str, server_sha: str | None = None) -> str:
    """Get the parent commit's tree SHA, as it exists on the SERVER.

    Local `git rev-parse` returns the local tree SHA, which differs from
    the server's tree SHA (the commit objects have different content
    addressing). Tier 3 must use the server's SHA as base_tree, otherwise
    the POST /git/trees call returns 404 / KeyError 'sha'.

    Per memory: "Local SHA ≠ remote SHA — 内容一致, SHA 不同".

    If `server_sha` is supplied, use it directly (avoids a network call
    to look up a local SHA that doesn't exist on the server).
    """
    if server_sha:
        resp = gh_api("GET", f"git/commits/{server_sha}")
        return resp["tree"]["sha"]
    parent_local = git("rev-parse", f"{commit_sha}^")
    # Fetch parent commit from server to get its server-side tree SHA.
    resp = gh_api("GET", f"commits/{parent_local}")
    # /commits/:sha returns nested commit object: resp["commit"]["tree"]["sha"]
    return resp["commit"]["tree"]["sha"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--base",
        help="Local commit SHA whose tree matches remote main's tree. "
        "Use when local chain diverged from remote (no commit in local has "
        "the same tree as remote main). Default: auto-detect via tree match.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Acknowledge divergent --base (tree mismatch with remote main). "
        "Composite push will proceed anyway, producing an orphan server commit.",
    )
    args = parser.parse_args()

    local_head = git("rev-parse", "HEAD")
    origin_main = get_remote_main_sha()
    print(f"Local HEAD:  {local_head}")
    print(f"Origin main: {origin_main} (via gh api, not stale local cache)")

    if local_head == origin_main:
        print("Already in sync, nothing to push")
        return 0

    # Determine the base local commit: its tree matches remote main's tree.
    # If --base is provided, use it; otherwise walk local history to find a match.
    remote_main_tree_resp = gh_api("GET", f"git/commits/{origin_main}")
    remote_main_tree = remote_main_tree_resp["tree"]["sha"]
    print(f"Remote main tree: {remote_main_tree[:8]}")

    base_local = args.base
    if base_local:
        base_local = git("rev-parse", base_local)  # normalize short SHA to full
        base_local_tree = git("rev-parse", f"{base_local}^{{tree}}")
        if base_local_tree != remote_main_tree:
            print(
                f"ERROR: --base {base_local[:8]} tree {base_local_tree[:8]} "
                f"does not match remote main tree {remote_main_tree[:8]}.\n"
                f"This produces a divergent composite push (orphan by SHA).\n"
                f"Either:\n"
                f"  (a) pick a --base whose tree matches remote main "
                f"({remote_main_tree[:8]}) so the walker produces a clean chain, or\n"
                f"  (b) pass --force to acknowledge the divergent push "
                f"(composite mode will run regardless)."
            )
            if not getattr(args, "force", False):
                return 4
            print(f"--force supplied; proceeding with divergent composite push")
        print(f"Using --base {base_local[:8]} (user-specified)")
    else:
        base_local = find_local_commit_with_remote_tree(origin_main)
        if base_local is None:
            print(
                "ERROR: no local commit has the same tree as remote main. "
                "Local chain diverged from remote. Re-run with --base <local_sha> "
                "specifying a local commit whose tree matches remote main (run "
                "`git log --format='%H %T %s'` and pick the one whose tree you "
                "want as the new base)."
            )
            return 2
        print(f"Auto-detected base: {base_local[:8]}")

    # Collect commits from base_local's child up to HEAD (oldest first)
    commits_to_push: list[str] = []
    current = local_head
    while current != base_local:
        commits_to_push.append(current)
        try:
            current = git("rev-parse", f"{current}^")
        except subprocess.CalledProcessError:
            # Reached root of local chain before finding base_local —
            # only happens if --base points past local history, which is
            # a user error. Bail with diagnostic.
            print(
                f"ERROR: walked past root of local chain without finding "
                f"--base {base_local[:8]}. Check that the SHA is in your "
                f"local history (`git log --all` to verify)."
            )
            return 3
    commits_to_push.reverse()
    print(f"Commits to push: {len(commits_to_push)}")
    for c in commits_to_push:
        print(f"  {c[:8]} {git('log', '-1', '--format=%s', c)}")

    if args.dry_run:
        # Count changed blobs per commit
        print("\nBlobs per commit:")
        for c in commits_to_push:
            changed = get_changed_blobs(c)
            print(f"  {c[:8]}: {len(changed)} changed blobs")
            for b in changed:
                print(f"    {b['path']} ({b['sha'][:8]})")
        return 0

    # Composite push strategy: when local has multiple commits to push AND
    # base_local was user-specified (because local and remote diverged and
    # no auto-match exists), collapse all changes into a SINGLE server commit
    # parented to remote main. This handles the v0.2 sync case where local
    # has tier3_fix + R5 + collision-fix + sync, and remote has v0.2 algorithm-lock
    # as a sibling chain.
    if args.base and len(commits_to_push) > 1:
        print(f"\n[composite] collapsing {len(commits_to_push)} local commits into 1 server commit")
        # Compute full diff: local HEAD tree vs remote main tree
        local_head_tree = git("rev-parse", f"{local_head}^{{tree}}")
        # Get all files in local HEAD tree
        changed = get_changed_blobs(local_head)  # against local HEAD~1
        # Filter to files that actually differ from remote main
        # Simpler: just upload all blobs from local HEAD tree
        raw = git("ls-tree", "-r", local_head_tree)
        all_blobs = []
        for line in raw.splitlines():
            parts = line.split(None, 3)
            if len(parts) < 4:
                continue
            mode, _type, sha, path = parts
            all_blobs.append({"path": path, "mode": mode, "sha": sha})
        print(f"  {len(all_blobs)} blobs in local HEAD tree")

        # Upload each blob
        tree_entries = []
        for b in all_blobs:
            server_sha = upload_blob(b)
            tree_entries.append({
                "path": b["path"],
                "mode": b["mode"],
                "type": "blob",
                "sha": server_sha,
            })

        # Create tree directly (no base_tree — full enumeration)
        server_tree_sha = curl_json("POST", "git/trees", {
            "tree": tree_entries,
        })["sha"]
        print(f"  server tree: {server_tree_sha[:8]}")

        # Composite commit message
        message = (
            "chore(composite): merge local + remote history (Tier 3 fallback)\n\n"
            "Local chain and remote main diverged after network-blocked push.\n"
            "This single server commit reconciles them by uploading local HEAD\n"
            f"tree content, parented to remote main {origin_main[:8]}.\n\n"
            "Local commits folded in:\n"
        )
        for c in commits_to_push:
            message += f"- {c[:8]} {git('log', '-1', '--format=%s', c)}\n"

        server_commit_sha = curl_json("POST", "git/commits", {
            "message": message,
            "tree": server_tree_sha,
            "parents": [origin_main],
        })["sha"]
        print(f"  server commit: {server_commit_sha[:8]}")
        prev_server_sha = server_commit_sha
    else:
        # Standard per-commit push (local chain not diverged)
        prev_server_sha = origin_main
        for i, commit_sha in enumerate(commits_to_push, 1):
            print(f"\n[{i}/{len(commits_to_push)}] pushing {commit_sha[:8]}...")
            parent_sha = git("rev-parse", f"{commit_sha}^")
            if i == 1:
                parent_tree_sha = remote_main_tree
                print(f"  using remote main tree as base for first push commit")
            else:
                # Parent commit was just pushed in the previous iteration
                # as prev_server_sha. Look up by server SHA to avoid the
                # "No commit found for SHA" 422 error.
                parent_tree_sha = get_parent_tree_sha(commit_sha, server_sha=prev_server_sha)
            message = get_commit_message(commit_sha)

            changed = get_changed_blobs(commit_sha)
            print(f"  {len(changed)} changed blobs")

            tree_entries = []
            for b in changed:
                server_sha = upload_blob(b)
                tree_entries.append({
                    "path": b["path"],
                    "mode": b["mode"],
                    "type": "blob",
                    "sha": server_sha,
                })

            server_tree_sha = curl_json("POST", "git/trees", {
                "base_tree": parent_tree_sha,
                "tree": tree_entries,
            })["sha"]
            print(f"  server tree: {server_tree_sha[:8]}")

            server_commit_sha = curl_json("POST", "git/commits", {
                "message": message,
                "tree": server_tree_sha,
                "parents": [prev_server_sha],
            })["sha"]
            print(f"  server commit: {server_commit_sha[:8]}")
            prev_server_sha = server_commit_sha

    # PATCH main ref
    print(f"\nUpdating main ref to {prev_server_sha[:8]}...")
    resp = curl_json("PATCH", "git/refs/heads/main", {"sha": prev_server_sha})
    if "object" not in resp or "sha" not in resp.get("object", {}):
        raise RuntimeError(
            f"PATCH main ref failed. Server response: {resp!r}. "
            f"New commit object {prev_server_sha} may exist on remote but is NOT pointed to by main. "
            f"Check via: gh api repos/$REPO/git/refs/heads/main"
        )
    print(f"  ref now: {resp['object']['sha'][:8]}")

    print(f"\n[OK] Tier 3 push complete.")
    print(f"Local SHA:  {local_head}")
    print(f"Remote SHA: {prev_server_sha}")
    print(f"Note: SHAs differ (local vs server) — run 'git fetch origin main && git reset --hard origin/main' to align.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
