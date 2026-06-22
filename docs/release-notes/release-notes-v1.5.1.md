# claude-AutosarCfg v1.5.1 SHIPPED

## Source

- Repo: <https://github.com/jasontaotao/claude-autosarcfg>
- Tag: `v1.5.1`
- Commits since v1.5.0: **12** (1 Foundation sprint + 8 pre-Foundation + 1 T12-pre fix + 1 release)
- Diffstat: 217 files changed, +19842 / -13103

## What's in this release

### Foundation sprint (4 tech-debt items + ARXML streaming + IndexedDB cache)

| PR        | What                                           | Why it matters                                                                                                                                                                                                                                                                |
| --------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR(1)** | `isPathInside` extracted + hardened            | Path containment check used by every save handler — now lives in `src/shared/paths/` with 12 unit tests covering `..` traversal, trailing slashes, UNC paths, case-insensitivity on Windows. Safe to reuse from any layer.                                                    |
| **PR(2)** | `preserveOrder` source-aware serializer        | Hand-edit round-trips now preserve source element order via a new `SerializeOptions.sourceArxml` parameter. Default OFF (feature-flagged) so v1.5.0 behavior is bit-for-bit preserved until you opt in.                                                                       |
| **PR(3)** | `removeWithCascade` cascade-aware ref deletion | When you remove a container, inbound `REFERENCE-VALUES` are auto-dangled in a single BFS walk with cycle defense. Returns a `Result` envelope; no UI yet (UI integration planned for v1.6.0).                                                                                 |
| **PR(4)** | `applyMutation` real + atomic disk write       | **Closes the Sprint 14 #2 follow-up.** Scripts can now actually commit mutations to disk. New `writeAtomic` helper (write-to-temp + fsync + rename) lives in `src/main/ipc/projectSaveHandler.ts`.                                                                            |
| **PR(5)** | `useArxmlStore` split                          | Pure refactor, 0 behavior change. **3446-line monolith → 16 files** (7 slices + 7 helpers), largest file 492 lines. The test count is the fuse.                                                                                                                               |
| **PR(6)** | `arxml-stream` package                         | New opt-in sub-path for future renderer progressive rendering + large-file support. Three sub-tasks: scaffolding + `routeArxmlReader` router + `streamParse` SAX-style `AsyncIterable` + IndexedDB cache. **All three feature flags default OFF** per the v1.5.1 design lock. |

### Sprint 17 P1 + P2 (BSWMD remove-from-disk)

- **P1** (`fc2bf75`): `BSWMD_DELETE` IPC + `useArxmlStore.removeBswmdFromDisk` + `undoLastRemoveBswmd` (8-step rollback).
- **P2** (`2128e43`): `RemoveModuleConfirmDialog` — 4-option dialog (cancel / remove this BSWMD only / cascade-delete dependent ECUC values / cascade + unlink refs) + `removeBswmdWithFullFlow` hook.

### Sprint 17d (vendor-CDD module-root fallback)

- `d296a6f` + `fe521bb`: The `EnumEditor` for enum parameters now reads the BSWMD layer end-to-end, including the vendor-CDD namespace mismatch (e.g. `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/...` BSWMD paths vs `/JWQ3399/...` value-side queries). The `ECUC_SUBSET_SCHEMA` 46-entry hard-coded fixture fallback is retired.

### Quality bar

- **1692 tests pass + 1 skipped, 0 fail** (135 new since v1.5.0)
- **96.31% stmts / 87.96% branches coverage** (target ≥95.5% / ≥87%)
- **0 type errors, 0 lint errors, 0 format warnings**
- `pnpm verify` passes all 7 stages: `format` / `lint` / `type-check` / 1692 tests / `coverage` / `build` / `import-regression`
- **T9 acceptance gate**: 5 ARXML fixtures (Com_Com, EcuC_EcuC, PduR_PduR, WdgIf_WdgIf, comments-rich) round-trip clean under the explicit tolerance whitelist across both DOM and SAX paths.

## What did NOT ship (still in v1.6.0+ backlog)

- **W** — First-Run Onboarding
- **A + C** — Headless Config Engine CLI (will consume the new `NormalizedDocument` abstraction + `deriveCacheKey` wire-up deferred from PR(6))
- **G** — SWS Validator framework (5 starter rules for Com/ComM/PduR/EcuC)
- **U** — Keyboard-First Power User
- **I** — DBC↔ECUC Bridge (Cluster 3, v1.7.0)
- **K** — BSWMD-Free Stencil (v1.7.0)
- **N** — ASPICE Traceability (v1.7.0) — dropped from v1.5+ brainstorm (legal / death-march risk)
- **B** — Post-Build Variants (v1.8.0+)
- **J** — UDS/DoIP (parked as a research branch)

## Known limitations (called out)

- **`arxml-stream` memory bounded-ness is NOT achieved.** The `streaming` flag currently yields a post-parse event surface for renderer progressive rendering, not parse-time memory savings. `streamParse` is a thin wrapper around `parseArxml` + `fromArxmlDocument` because `fast-xml-parser` 4.4.1 has no native SAX mode, and the v1.5.1 plan's "no new top-level deps" constraint ruled out adding `sax` / `node-expat` / `htmlparser2`. The `emitSaxEvents` `AsyncIterable` API is preserved for v1.6.0+ renderer work; the v1.7.0 plan is to swap in a true SAX parser. Documented in `src/main/arxml-stream/streaming/sax-reader.ts:1-11` and `streaming/index.ts:13-16`.
- **`deriveCacheKey` (filePath + mtime + contentHash) has no router consumer yet.** The router currently uses an inline-content hash for cache keys. File-path invalidation machinery is built and tested but unused — wire-up deferred to the headless CLI in v1.6.0.

## Installation

```bash
# Stable channel
npm install -g claude-autosarcfg@1.5.1
```

Or build from source:

```bash
git clone https://github.com/jasontaotao/claude-autosarcfg.git
cd claude-autosarcfg
git checkout v1.5.1
pnpm install
pnpm build
pnpm package
```

## Verification

Reproduce the verification locally:

```bash
git checkout v1.5.1
pnpm install
pnpm verify
```

Expected: all 7 stages pass — `format` / `lint` / `type-check` / 1692 tests / `coverage` / `build` / `import-regression`.

## Related

- [[claude-autosarcfg-overview]] — v1.5.0 state (baseline for this release)
- [[claude-autosarcfg-v1-6-brainstorm]] — locked v1.6.0+ roadmap
- [[claude-AutosarCfg-sprint-14-v1-3-0-shipped]] — Sprint 14 #2 follow-up closed by PR(4) in this release
- [[sprint-14-bswmd-to-ecuc-shipped]] — v1.2.0 sibling release for the ECUC ARXML Import feature
