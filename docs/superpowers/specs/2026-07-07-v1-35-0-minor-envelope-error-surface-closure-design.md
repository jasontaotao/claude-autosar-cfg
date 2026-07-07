# v1.35.0 MINOR — Dcm Config Error Surface Closure + tier3_push commit

**Author**: claude-AutosarCfg planning
**Date**: 2026-07-07
**Status**: design
**Target**: v1.35.0 MINOR (post-v1.34.0 baseline `c62e346`)
**Baseline**: 3008 + 7 SKIP / 0 fail
**Test delta target**: +8 → 3016 + 7 SKIP / 0 fail

## Goal

Close the 3-version deferred promise from v1.31.0 D5 + v1.32.0 spec §5: the
9-value `DcmConfigErrorKind` discriminator is typed in the IPC envelope but
is **lossily collapsed** through `NEW_CLASS_TO_OLD_KEY`
(`src/renderer/hooks/useDcmConfigLauncher.ts:180-190`) to the 6-value toast
union, hiding 4 distinct error classes under one shared i18n message
(`bswmdMapMissing`). v1.35.0 removes the collapse layer so every
`DcmConfigErrorKind` has a 1:1 mapping to a dedicated toast class + dedicated
i18n key.

Bonus: commit `scripts/tier3_push.py` (424 LoC, used in v1.33.1 T5 + v1.34.0
T5 but never committed) with README + 1 unit test, making the Tier 3 fallback
ship pathway a first-class repo asset.

## Background — what's actually left

From `src/shared/types.ts:1218-1230`:

```ts
export type DcmConfigErrorKind =
  | 'odx-unreadable'
  | 'odx-parse-failed'
  | 'bswmd-unreadable'
  | 'odx-dcm-linkage'
  | 'dcm-module-missing'
  | 'container-not-found'
  | 'patch-failed'
  | 'atomic-write-failed'
  | 'unknown';
```

9 values, all typed, all returned by `dcmConfigHandler.ts` (5+1+1+1+1 sites).
The IPC envelope is `DcmConfigResponse` (`src/shared/types.ts:1203-1211`),
discriminated union, `error: DcmConfigError` where `DcmConfigError.kind:
DcmConfigErrorKind` (line 1229-1233).

**The debt** is in the renderer side:

- `useDcmConfigLauncher.ts:180-190` defines `NEW_CLASS_TO_OLD_KEY` that
  collapses 4 of the 9 values to existing 6-value keys:
  - `ODX_DCM_LINKAGE` → `bswmdMapMissing` (misleading)
  - `DCM_MODULE_MISSING` → `bswmdMapMissing` (misleading)
  - `CONTAINER_NOT_FOUND` → `bswmdMapMissing` (misleading)
  - `PATCH_FAILED` → `unexpected` (no dedicated i18n key)
- `DcmConfigErrorToast.tsx:20-26` defines `DcmConfigErrorClass` as 6-value
  camelCase union.
- `i18n/odx.ts:32-37` has 6 i18n keys (`bswmdUnreadable`, `odxUnreadable`,
  `odxParseFailed`, `bswmdMapMissing`, `atomicWriteFailed`, `unexpected`).

User-visible impact: when `dcm:config` returns `kind: 'odx-dcm-linkage'`, the
toast shows the misleading "BSWMD map missing" message — different cause,
same UX, harder to debug.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ main process: dcmConfigHandler.ts                                │
│   Each error branch returns { ok: false, error: { kind, ... } } │
│   kind: DcmConfigErrorKind (9-value union, already typed)        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ IPC envelope (unchanged from v1.32.0)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ renderer: useDcmConfigLauncher.ts                                │
│                                                                  │
│   v1.35.0: classifyError returns RendererDcmConfigErrorClass    │
│            directly (9-value union, 1:1 with kind).             │
│   DELETED: NEW_CLASS_TO_OLD_KEY lossy collapse map.            │
│                                                                  │
│   state.error.classKey: RendererDcmConfigErrorClass (9 values) │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ DcmConfigErrorToast.tsx                                          │
│                                                                  │
│   v1.35.0: type DcmConfigErrorClass = RendererDcmConfigError-   │
│            Class (9 values, kebab-case union string literals).  │
│            CLASS_KEY_TO_I18N map covers all 9 values.           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ i18n bundle (en + zh-CN + types in src/shared/i18n/odx.ts)      │
│                                                                  │
│   v1.35.0: 9 typed keys, 1 per kind.                            │
│     error.bswmdUnreadable, error.odxUnreadable,                  │
│     error.odxParseFailed, error.odxDcmLinkage (NEW),            │
│     error.dcmModuleMissing (NEW),                                │
│     error.containerNotFound (NEW),                               │
│     error.patchFailed (NEW),                                     │
│     error.atomicWriteFailed, error.unexpected,                   │
│     error.dismiss (kept).                                        │
└─────────────────────────────────────────────────────────────────┘
```

## Components & Files Touched

| Layer | File | Change |
|---|---|---|
| types | `src/shared/types.ts` | No change (`DcmConfigErrorKind` 9-value already typed) |
| types | `src/shared/i18n/odx.ts` (+ en + zh-CN bundles) | Add 4 i18n keys: `odxDcmLinkage`, `dcmModuleMissing`, `containerNotFound`, `patchFailed` |
| renderer hook | `src/renderer/hooks/useDcmConfigLauncher.ts` | DELETE `NEW_CLASS_TO_OLD_KEY`; rename internal union `RendererDcmConfigErrorClass` (kebab-case → camelCase); `state.error.classKey` now typed against 9-value union |
| renderer toast | `src/renderer/components/dcmConfig/DcmConfigErrorToast.tsx` | Expand `DcmConfigErrorClass` to 9-value; add 4 missing entries to `CLASS_KEY_TO_I18N` map; kebab-case → camelCase |
| renderer toast | `src/renderer/components/dcmConfig/DcmConfigErrorToast.css` | Add 4 color/severity variants (use existing palette tokens; severity tier drives color) |
| ops scripts | `scripts/tier3_push.py` | First-time commit + `scripts/tier3_push.README.md` + `scripts/__tests__/tier3_push.test.py` (1 unit test) |

## Key Design Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Toast union values: kebab-case IPC kind (`'odx-dcm-linkage'`) → camelCase toast class (`'odxDcmLinkage'`) | Wire-protocol-friendly vs UI-friendly naming; preserves existing IPC contract (no breaking change to other IPC consumers); i18n keys are camelCase |
| D2 | Single mapping `KIND_TO_TOAST_CLASS` 9-row map in launcher; DELETED `NEW_CLASS_TO_OLD_KEY` | Total function, easy to audit; 1:1 mapping eliminates lossy semantics |
| D3 | Toast severity tiers: `error` (red), `warning` (amber). All 9 classes default to `error`. | All 4 NEW classes are user-actionable (file/ODX/BSWMD mismatch); consistent UX; existing 6 classes already use red |
| D4 | CSS additions use existing tokens (`--color-surface-error`, `--color-surface-warning`) | No new design tokens; audit-safe |
| D5 | `tier3_push.py` commit goes T1 (before envelope migration) so T5 ship can run Tier 3 fallback with the committed script | Tier 3 already proven (v1.33.1 T5 + v1.34.0 T5); commit-as-step warms the path |
| D6 | i18n key format: `odx.export.dcmConfig.error.{kindCamelCase}` | Matches existing 6 keys; flat namespace |
| D7 | No removal of any existing i18n key | 6 existing keys are subset of 9 new total; additive; `bswmdMapMissing` key kept for `dcm-module-missing` + `container-not-found` + `odx-dcm-linkage` (now in addition to dedicated keys via kind-first path) |

Wait — D7 contradicts itself. **Revising**: existing `bswmdMapMissing` key
remains but is ONLY used for the `dcm-module-missing` kind path now (it
was the merged key for 3 distinct kinds). The 4 NEW kinds get 4 NEW keys.
Net: 6 → 9 keys, no removals.

| # | Decision (revised) | Rationale |
|---|---|---|
| D7 (revised) | 6 existing keys kept. 4 NEW keys added (`odxDcmLinkage`, `dcmModuleMissing`, `containerNotFound`, `patchFailed`). The existing `bswmdMapMissing` key continues to back the `dcm-module-missing` kind (matches v1.32.0 semantics). The 2 other formerly-merged kinds (`odx-dcm-linkage`, `container-not-found`) now have dedicated keys. | Preserves existing i18n coverage; expands for the 4 NEW kinds; no removal |

## Data Flow (concrete examples)

**Before v1.35.0** (lossy collapse):
```
handler returns { ok: false, error: { kind: 'odx-dcm-linkage', message: 'ODX-Dcm linkage broken' } }
   ↓
classifyError(error) → 'ODX_DCM_LINKAGE'
   ↓
NEW_CLASS_TO_OLD_KEY collapses → 'bswmdMapMissing'
   ↓
DcmConfigErrorToast renders i18n key 'odx.export.dcmConfig.error.bswmdMapMissing'
   ↓
User sees: "BSWMD map missing: ODX-Dcm linkage broken"
   ↓
MISLEADING: actual error is ODX-Dcm linkage, not BSWMD map.
```

**After v1.35.0** (1:1 mapping):
```
handler returns { ok: false, error: { kind: 'odx-dcm-linkage', message: 'ODX-Dcm linkage broken: ...' } }
   ↓
classifyError(error) → 'odxDcmLinkage'  (camelCase at toast layer)
   ↓
DcmConfigErrorToast renders i18n key 'odx.export.dcmConfig.error.odxDcmLinkage'
   ↓
User sees: "ODX-Dcm linkage broken: ..." (correct, specific, actionable)
```

## Testing Strategy

| Test surface | Coverage | Δ tests |
|---|---|---|
| `DcmConfigErrorToast.test.tsx` (UPDATED) | +4 test cases for new 4 classes (one per kind); existing 6 cases still pass | +4 |
| `useDcmConfigLauncher.test.ts` (UPDATED) | `it.each` row count: 6 → 9 (kind → class direct mapping); `classifyError` returns 9-value union directly (no `NEW_CLASS_TO_OLD_KEY` collapse) | +3 |
| `dcmConfigHandler.test.ts` (unchanged) | 5+1+1+1 kind sites already tested | 0 |
| `ipcContract.test.ts` (unchanged) | Envelope already verified | 0 |
| `tier3_push.test.py` (NEW) | 1 unit test: `parent-tree-sha-thread-prev-server-sha` regression-guard (the v1.34.0 process lesson) | +1 |
| **Total** | | **+8** |

Baseline 3008 + 7 SKIP / 0 fail (from v1.34.0 MINOR `c62e346`) → target **3016 + 7 SKIP / 0 fail**.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `KIND_TO_TOAST_CLASS` map out of sync with `DcmConfigErrorKind` union (compile-time drift) | Use `Record<DcmConfigErrorKind, ...>` TS constraint — compile fails if a kind is added without a map row |
| i18n key format drift (e.g., `bswmdMapMissing` vs `bswmd-unreadable`) | Keys are kebab-cased kind → camelCased suffix; format documented in spec §5 + D7 |
| Toast color saturation: 9 variants look noisy | Use existing palette tokens; severity tier drives color (no new tokens); 4 NEW variants inherit error-tier red (consistent with 6 existing) |
| tier3_push.py test fragility (network-dependent) | Unit test mocks `urllib.request`; does NOT hit github.com |
| New i18n keys not localized in zh-CN | Atomically commit en + zh-CN + types bundle, identical 3-step pattern from v1.34.0 T2 |

## Tasks (5 + 1 ship)

```
T1: scripts/tier3_push.py commit + README + 1 unit test
T2: i18n bundle atomically add 4 NEW keys (en + zh-CN + types)
T3: useDcmConfigLauncher.ts — delete NEW_CLASS_TO_OLD_KEY collapse
T4: DcmConfigErrorToast.tsx + CSS — expand to 9-value union + 4 new variants
T5: useDcmConfigLauncher + DcmConfigErrorToast tests — 8 new test cases
T6: Whole-branch review + ship (v1.35.0 tag + GH release)
```

(5 implementation tasks + 1 ship task = 6 total. Subagent-Driven execution.)

## Global Constraints

(Verbatim — applies to every task.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` allowed for defensive warnings (e.g., `reuseFromHistory` no-op).
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- `pnpm verify` (7-stage) must pass at T6 ship gate.
- 40-char SHA for `gh release create`.
- TWO separate pushes (no `--follow-tags`) per the
  `follow-tags-unreliable-separate-push-tag` lesson.
- Tier 3 fallback (`scripts/tier3_push.py`) — committed in T1; used in T6
  if direct `git push` fails.
- Implementer MUST NOT dispatch `pkm-capture` (parent controller's job — same rule from v1.32.0 T3 finding).
- Implementer MUST NOT make destructive git operations (`reset --hard`,
  `push --force`) on `origin/main`.
- All test additions must include the covering test command and pass
  locally before commit (RED + GREEN 2-commit split per task).

## Out of Scope (deferred to v1.36.0+)

- Multi-BSWMD project override (A7) — architectural
- xlsxImportHistory persistence to electron-store / localStorage (A1) — separate UX surface
- Cross-IPC envelope kind standardization (B option) — separate MINOR per envelope
- Generate New 二次确认 modal (deferred since v1.33.1)
- Wizard / cross-window sync — far-term
- `parseArxmlLite` canonicalization (YAGNI)

## Reverse-Closes

This MINOR **reverse-closes** the v1.31.0 lesson
`error-classification-via-regex-prefix-vs-envelope-kind-trade-off` — the
"later" promise to migrate from regex prefix to envelope kind is now fully
realized for `dcm:config`. The lesson can be retired with a "closed in
v1.35.0" annotation in the vault.

This MINOR also **reverse-closes** the v1.32.0 spec §5 promise: "renderer
classifyError reads kind discriminator exclusively." The renderer now
EXPOSES the full 9-value discriminator through to the UI, not just reads it.

## Lessons (NEW from this MINOR, candidates)

1. **`1-release-compat-windows-need-an-explicit-removal-task`** — When deferring with "removed in v.N+1", the removal task must be scheduled at v.N+1 ship, not left to drift. v1.32.0 spec §5 said "regex removed in v1.33.0" but only the regex was removed in v1.33.0; the lossy collapse layer survived to v1.35.0. Pattern: deferred-removal tasks deserve their own todo + release-notes entry, not just prose.

2. **`lossy-collapse-maps-are-tech-debt-not-shipping-safety`** — A
   `Record<X, Y>` map where `|X| > |Y|` and several `X` collapse onto the
   same `Y` value is a code smell. Either expand `Y` or document why the
   collapse is correct. In v1.32.0 the collapse was a 1-release safety net;
   in v1.33.0 it became dead-code-with-history; in v1.35.0 it's deleted.

3. **`process-scripts-need-commit-discipline`** — A 424-line production-ship
   helper script left untracked for 2 ship cycles (v1.33.1 + v1.34.0) is
   operational debt. Ship-time scripts should be committed in the same
   MINOR/PATCH that uses them, not in a follow-up "next time" deferral.

## Cross-references

- [v1.34.0 design spec](./2026-07-07-v1-34-0-minor-xlsx-import-history-ui-surface-design.md) — parent MINOR
- [v1.33.0 MINOR design spec](./2026-07-07-v1-33-0-minor-dcm-config-cleanup-design.md) — first introduced the 9-value kind union
- [v1.32.0 MINOR design spec](./2026-07-07-v1-32-0-minor-dcm-config-hardening-and-ux-design.md) — original `classifyErrorByRegex` removal plan (§5)
- [v1.31.0 PATCH design spec](./2026-07-06-v1-31-0-patch-dcm-config-renderer-ux-design.md) — original D5 (regex prefix error class)
- `src/shared/types.ts:1218-1230` — `DcmConfigErrorKind` 9-value union
- `src/shared/types.ts:1203-1211` — `DcmConfigResponse` discriminated envelope
- `src/renderer/hooks/useDcmConfigLauncher.ts:180-190` — `NEW_CLASS_TO_OLD_KEY` collapse (target for T3 deletion)
- `src/renderer/components/dcmConfig/DcmConfigErrorToast.tsx:20-26` — 6-value `DcmConfigErrorClass` (target for T4 expansion)
- `src/shared/i18n/odx.ts:32-37` — 6 existing i18n keys (target for T2 expansion)
- `scripts/tier3_push.py` — untracked Tier 3 fallback script (target for T1 commit)