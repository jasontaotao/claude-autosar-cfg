# scripts/tier3_push.py — Tier 3 Ship Fallback

Used when `github.com:443` git protocol is blocked but `api.github.com`
HTTPS works. Two modes:

**AUTO mode** (default): walks the commit chain from local HEAD to a
commit whose tree matches remote main's tree, uploads only the CHANGED
blobs (via curl, bypassing gh's command-line length limit), and creates
each commit on the server.

**COMPOSITE mode** (`--base <local_sha>`): when local and remote histories
diverged, uploads ALL blobs from local HEAD tree in a single server
commit parented to remote main. Resulting tree equals local HEAD; remote
main fast-forwards.

## When to use

If `git push origin main` returns 30s timeout errors (TCP connect blocked),
fall back to:

```bash
python scripts/tier3_push.py
```

For composite (orphan-recovery) scenarios:

```bash
python scripts/tier3_push.py --base <local_sha_before_push_chain>
```

## Provenance

First used in production in v1.33.1 PATCH T5 (after embedded-creds
workaround failed mid-ship). Ported from `aspice-toolkit/scripts/tier3_push.py`
with one 1-line patch for the `parent-tree-sha-thread-prev-server-sha`
process lesson learned in v1.34.0 MINOR T5 ship.

## Regression-guard

The unit test `scripts/__tests__/test_tier3_push.py` exercises the
`get_parent_tree_sha(commit_sha, server_sha)` helper. When `server_sha` is
supplied, the helper must call `gh_api("GET", f"git/commits/{server_sha}")`
and return `resp["tree"]["sha"]` — NOT call `git rev-parse` to look up a
local SHA. This guards against the v1.34.0 ship-blocking bug where the
local `parent_tree_sha` returned 404 because the parent commit's SHA on
the server differed from the local SHA (content-identical but
content-addressed under different tree SHAs).

## Orphan Recovery

When the script successfully pushes but the local SHA differs from the
server SHA (because the script creates commits via the GitHub API and
the API-assigned commit objects have different content-addressed SHAs
than locally-created ones), local git state will be temporarily out of
sync with origin/main. Recovery:

```bash
# 1. Wait for github.com:443 to return (the 30s Connection was reset
#    typically resolves within 5-10 minutes; verify with:
curl -I https://github.com/jasontaotao/claude-autosar-cfg 2>&1 | head -3

# 2. Once reachable, fetch + reset to align local to the server:
git fetch origin main
git reset --hard origin/main
```

This is a **safe operation** — `git reset --hard origin/main` only
discards local commits whose tree is identical to (or a subset of)
origin/main's tree. The Tier 3 server SHAs that just landed on origin
are content-equivalent to the local SHAs (same tree, different SHA
because content-addressing under different parent chains).

If `git fetch origin main` itself times out (the same github.com:443
block that triggered Tier 3 in the first place), wait for the
block to lift, then retry. Tier 3 itself is not repeatable on the
same commits (the second walk would find no commits to push).
