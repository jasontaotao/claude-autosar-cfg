# v1.44.0 PATCH — Lessons-Sweep (Process Cluster 14 → 17)

**Released:** 2026-07-11
**Tag:** [`v1.44.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.44.0)
**Cycle type:** PATCH (vault-only metadata change)
**Ship basis:** Vault-only — no source-code commits

## Summary

Closes the remaining 3 1-of-1 lesson candidates that surfaced during the v1.42.0..v1.43.1 rapid-ship cycle. **No source-code changes** — lessons live in the vault as metadata; `src/` is unchanged from v1.43.1 PATCH.

| | v1.43.1 baseline | **v1.44.0** | Delta |
|---|---|---|---|
| `src/` LoC | 0 changes | 0 changes | **0** |
| Process Cluster lessons | 14 | **17** | **+3** |
| Tests | 3128 + 7 SKIP | 3128 + 7 SKIP | 0 |
| Functional change | — | **0** | — |

## Lessons promoted (3)

All 3 lessons are promoted from **1/3 confirmations** with the **single-session confirmation caveat** prescribed by the v1.43.1 amendment to lesson #14. Each promotion includes an explicit "Confirmation count" section noting the 1/3 status + what would count as 2nd/3rd confirmations.

### Tier 11 — Mid-flight recovery

**`wip-commit-discard-pattern-is-stable-mid-flight-context-loss-recovery`** — When a multi-commit refactor hits an Edit-tool context-loss loop (repeatedly interrupted by session messages), the stable recovery pattern is `git reset --hard HEAD~1` to discard the WIP commit + delete the new file + drop the stash + ship the previous T-level commit, NOT to continue the partial work.

- *Source*: v1.42.0 PATCH T4b (WIP commit `759be76` discarded before v1.42.1 T5 ship)
- *Vault file*: `01-Projects/claude-AutosarCfg/development/lessons/wip-commit-discard-pattern-is-stable-mid-flight-context-loss-recovery.md`

### Tier 12 — Version-bump discipline

**`ship-minor-with-partial-source-changes-when-verified-clean-and-deferred-items-have-clear-reason`** — When a MINOR-version cycle's planned scope is only partially complete (some T-levels shipped, others deferred), ship the MINOR with the partial deliverable rather than reverting to a PATCH or aborting — provided all 3 conditions are met: (1) shipped changes are verified-clean, (2) measurable improvement is achieved, (3) deferred items have a clear reason + path forward.

- *Source*: v1.42.1 MINOR T5 ship (7 of 9 planned commits shipped)
- *Inverse of*: `aborting-MINOR-with-zero-source-changes-prevents-misleading-version-bump` (captured earlier session)
- *Vault file*: `01-Projects/claude-AutosarCfg/development/lessons/ship-minor-with-partial-source-changes-when-verified-clean-and-deferred-items-have-clear-reason.md`

### Tier 13 — MCP tool reliability

**`vault-edit-may-silently-fail-with-undefined-content-requires-read-after-write-verification`** — The `vault_edit` MCP tool may return `success: true` while the underlying file write silently writes literal `undefined\n` (10 bytes) instead of the intended content. Recovery requires read-after-write verification (hex dump + length check via `vault_read` or direct filesystem read) + manual file IO (`Path.write_text(intended_content, encoding="utf-8")`) if the write failed.

- *Source*: v1.43.0 MINOR pkm-capture dispatch
- *Vault file*: `01-Projects/claude-AutosarCfg/development/lessons/vault-edit-may-silently-fail-with-undefined-content-requires-read-after-write-verification.md`

## Process Cluster catalog updated

`process-cluster-14-lessons-catalog-2026-07-11.md` → `process-cluster-17-lessons-catalog-2026-07-11.md`. Added Tier 11 (mid-flight recovery) + Tier 12 (version-bump discipline) + Tier 13 (MCP tool reliability). The "shape of a v1.41.x PATCH implementer decision" list extended from 6 questions to 10, mapping to lessons #14 (Python chunk replacement) + #15 (WIP discard) + #16 (partial-MINOR ship) + #17 (vault_edit verification).

## Vault-only PATCH convention

This PATCH ships metadata changes (CHANGELOG + release-notes + 4 vault files) with **zero `src/` changes**. Mirrors v1.41.3 PATCH (drive-by prettier pass with 0 logic change). The version bump records the Process Cluster expansion; future dispatches can consult the new lessons to avoid repeating the rapid-ship cycle mistakes.

## Single-session confirmation caveat

All 3 lessons are promoted from **1/3 confirmations** with the caveat (per the v1.43.1 amendment to lesson #14):

> When promoting a lesson from N confirmations, distinguish between "N confirmations from the same root cause (which count as ~1 confirmation)" vs "N confirmations from independent root causes (which count as N)". This caveat should be applied retroactively to any lesson promotion where confirmations clustered in a single session using a shared template.

Each lesson file includes this caveat in its "Confirmation count" section. Future dispatches that observe the same pattern from **different scripts / different files / different sessions** should be logged as 2nd/3rd confirmations and the lesson promoted to fully-validated standalone.

## Test results

**3128 + 7 SKIP / 0 fail** (zero test delta — no source changes). pnpm verify 7-stage GREEN.

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Process Cluster catalog**: `01-Projects/claude-AutosarCfg/development/process-cluster-17-lessons-catalog-2026-07-11.md`
- **v1.43.1 ship notes** (predecessor): `docs/release-notes/v1.43.1/README.md`
- **Lesson #14 amendment** (single-session caveat precedent): `01-Projects/claude-AutosarCfg/development/lessons/marker-based-text-replacement-must-validate-block-contents-not-line-count.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)