# v1.4.0 — Trust Sprint (2026-06-20)

## TL;DR

v1.4.0 closes three trust-critical issues in one release. After this update:

- **Round-trip safety**: opening an ARXML with vendor extensions (SERVICE-NEEDS, EXCLUSIVE-AREA, /EAS/ namespace) and saving it no longer silently drops the unknown content.
- **Language safety**: the dialog family is fully localized — switching to `locale=en` no longer leaves you with Chinese button labels.
- **Write-path safety**: the main process rejects `..` parent-traversal in renderer-supplied paths, closing the CVE-shaped vector where a compromised renderer could write to `../../etc/passwd`.

MINOR bump (no breaking API changes; the v1.3.0 → v1.4.0 migration is transparent).

## What changed

### Fixed

| ID                  | Issue                                                                                      | Fix                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1                | `classifyElement` drops unknown tags (SERVICE-NEEDS, EXCLUSIVE-AREA, vendor extensions)    | New 4th `ArxmlUnknown` variant on the `ArxmlElement` union; `classifyElement` fallback returns it instead of `null`; `renderElement` re-emits the original fast-xml-parser node verbatim via `{ [tagName]: parsed }` |
| P0-1 (second-order) | `renderModule` only emitted `m.references[0]`, silently dropping all other DEFINITION-REFs | All `m.references` are now emitted as top-level `<DEFINITION-REF>` siblings, matching the parser's `asArray` contract at `parser.ts:500`                                                                             |
| H8                  | No `..` parent-traversal check in main-process write paths                                 | `path.normalize(p).includes('..')` pre-flight check in PROJECT_SAVE, saveArxmlHandler, and script-handler                                                                                                            |

### Changed

| ID      | Issue                                                  | Fix                                                                                                                                                      |
| ------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H6 → P0 | 9 hardcoded user-facing strings in 4 Dialog components | All replaced with `t(locale, key)` lookups. 7 new i18n keys added. `ImportEntry.tsx:64` migrated from `window.confirm` to the app's 3-state `confirm()`. |

## Known limitations (deliberate, deferred to v1.5+)

- **Sibling order between known and unknown elements** is determined by model iteration order, not original source order. Full preservation requires `preserveOrder: true` everywhere — a 2-week refactor.
- **XML comments, CDATA, and processing instructions** are still lost. The parser config doesn't request preservation.
- **Full `isPathInside(manifestDir)` containment** is deferred because it would break the loose-mode back-compat contract: users can open ARXMLs from anywhere and save back to the same path. The 17b fix closes the actual attack vector without changing UX.
- **Symlink bypass** — `path.normalize` doesn't resolve symlinks. A renderer with write access to a symlink target can still write through it. Tracked for v1.5+.

## Test summary

| Metric      | Before (v1.3.0)  | After (v1.4.0)   | Delta |
| ----------- | ---------------- | ---------------- | ----- |
| Test count  | 1493 + 1 skipped | 1511 + 1 skipped | +18   |
| Type errors | 0                | 0                | —     |
| Lint errors | 0                | 0                | —     |
| Build       | success          | success          | —     |

## Files touched

- **33 files changed** in 4 commits
- **+838 / -116 LOC** total
- New: `src/main/ipc/projectSaveHandler.ts`, `tests/fixtures/arxml/vendor-extension.arxml`, 3 new test files
- Audit: 11 production files + 6 test files updated to handle the new `ArxmlUnknown` variant

## Upgrade

No action required. The v1.3.0 → v1.4.0 migration is transparent:

- All existing ARXML files load and save identically to v1.3.0 behavior.
- The new `ArxmlUnknown` variant only kicks in for tags the parser didn't recognize before — which were being silently dropped, so adding them is strictly additive.
- Existing `SaveArxmlErrorKind` consumers don't break — the new `'invalid-path'` variant has an i18n key ready but is never reached in legitimate flow.
- The `path.normalize(p).includes('..')` check rejects only paths with residual `..` segments. Normal absolute paths and paths inside the user's filesystem tree pass through.

## Commits (4)

1. `feat(i18n): Sprint 17a — Dialog i18n audit (H6 → P0)` — 5 renderer files + i18n.ts + 3 test files
2. `fix(security): Sprint 17b — Path containment for save paths (H8)` — 3 main-process handlers + new `projectSaveHandler.ts` + 3 test files
3. `fix(arxml): Sprint 17c — Round-trip preservation (P0-1 + P0-2 + multi-ref)` — 11 production files + 6 test files + new fixture
4. `chore(release): bump v1.3.0 → v1.4.0 + CHANGELOG entry + release notes`

## Next

- Sprint 14 #2: real mutation replay pipeline (Sprint 14 #2 applyMutation stub)
- v1.5.0 brainstorm: undo/redo, global keyboard shortcuts, tree search, etc. (per the deferred HIGH items)
- v1.5.0 path-containment migration: full `isPathInside(manifestDir)` + symlink resolution
