# v1.36.0 MINOR — xlsxImportHistory Persistence + Generate New Confirmation + ops polish

**Author**: claude-AutosarCfg planning
**Date**: 2026-07-08
**Status**: design
**Target**: v1.36.0 MINOR (post-v1.35.0 baseline `6008efe` / origin `6ea74b40`)
**Baseline**: 3015 + 7 SKIP / 0 fail
**Test delta target**: +17 → 3032 + 7 SKIP / 0 fail

## Goal

Close 2 deferred promises from v1.30.0-v1.34.0 chain + 1 ops polish:

1. **v1.34.0 promise**: "xlsxImportHistory persistence to electron-store / localStorage (session-scope only for v1.34.0)"
2. **v1.33.1 promise**: "Generate New 二次确认 modal (destructive re-write explicit, no confirm needed)" — deferred since v1.33.1 spec §4
3. **Ops polish**: Tier 3 push orphan-recovery workflow docs (D13) + local SHA ≠ remote SHA recovery docs (D14) + vault落 4 lessons from v1.35.0 (D15)

## Background — what's actually left

From `src/renderer/store/slices/xlsxImportSlice.ts` (v1.34.0 final state):

```ts
export interface XlsxImportRecord {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
  readonly importedAt: number;
}

export interface XlsxImportSlice {
  readonly xlsxLastImport: XlsxImportRecord | null;
  readonly xlsxImportHistory: readonly XlsxImportRecord[];
  setXlsxLastImport: (record: XlsxImportRecord | null) => void;
  reuseFromHistory: (importedAt: number) => void;
}
```

`xlsxImportHistory` is in-memory only (cap-5 + prepend-first, but lost on app restart). v1.34.0 surface + v1.34.0 README's "Known follow-ups (deferred to v1.35.0+)" both call out persistence as next-step.

From `src/renderer/hooks/useDcmConfigLauncher.ts:570-598` (v1.33.1 PATCH `handleGenerateNew`):

```ts
const handleGenerateNew = useCallback(async (): Promise<void> => {
  if (inFlightRef.current) return;
  const r = await window.autosarApi.bswmdPick();
  if (r.kind !== 'opened') return; // canceled or read-failed
  // ... no confirm modal — directly re-fires dcm:config
  await open({ odxPath, xlsxRows, bswmdPath: r.path });
}, [...]);
```

v1.33.1 spec §4 deferred: "Generate New operation 二次确认 modal (destructive re-write explicit, no confirm needed)". Reading the comment "no confirm needed" — the deferred item is *adding* the confirm modal (the spec author changed their mind between v1.33.0 and v1.33.1).

The 3-button `ConfirmDialog` is at `src/renderer/components/ConfirmDialog.tsx`. It serves unsaved-changes (continue/discard/saveAndProceed) — not a 2-button destructive-confirm.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ main process: xlsxHistoryStorage.ts (NEW v1.36.0)              │
│   - File: <userData>/xlsx-import-history.json                  │
│   - Read/write JSON with cap-5 + prepend-first invariant       │
│   - Corrupted file → reset to [] + console.warn                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ IPC channels (NEW)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ xlsxHistory:load (NEW) — renderer bootstrap                    │
│   Returns: { ok, value: readonly XlsxImportRecord[] }          │
│   Called once on App mount                                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ xlsxHistory:save (NEW) — main-side persistence                  │
│   Triggered by xlsxEcucBatchImportHandler after broadcast      │
│   Writes to JSON file (cap-5 + prepend-first)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ xlsx:import-complete (v1.33.0) — broadcast payload             │
│   v1.36.0: handler also writes to history file (additive)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ renderer: useDcmConfigLauncher.ts                               │
│   v1.36.0: handleGenerateNew wraps bswmd:pick result in       │
│   confirmDestructive() (NEW ConfirmDialog2 modal)              │
└─────────────────────────────────────────────────────────────────┘
```

## Components & Files Touched

| Layer | File | Change |
|---|---|---|
| shared | `src/shared/ipc-contract.ts` | +2 channels: `XLSX_HISTORY_LOAD`, `XLSX_HISTORY_SAVE` |
| main | `src/main/xlsxHistoryStorage.ts` (NEW) | Read/write JSON to userData; corrupted file handling |
| main | `src/main/ipc/xlsxHistoryLoadHandler.ts` (NEW) | Returns persisted history |
| main | `src/main/ipc/xlsxHistorySaveHandler.ts` (NEW) | Writes cap-5 + prepend-first to JSON |
| main | `src/main/ipc/register.ts` | Register new IPC handlers |
| main | `src/main/ipc/xlsxEcucBatchImportHandler.ts` | After broadcast, call `xlsxHistorySaveHandler` (additive) |
| preload | `src/preload/index.ts` | Expose `xlsxHistoryLoad` only (no `xlsxHistorySave` — main-internal) |
| renderer | `src/renderer/components/ConfirmDialog2.tsx` (NEW) | 2-button (confirm/cancel) modal; promise-based `confirmDestructive(options)` |
| renderer | `src/renderer/hooks/useDcmConfigLauncher.ts` | `handleGenerateNew` wraps bswmd:pick result in `confirmDestructive` |
| renderer | `src/renderer/store/slices/xlsxImportSlice.ts` | New `hydrateXlsxHistory(records)` action |
| renderer | `src/renderer/store/xlsxImportHistoryBootstrap.ts` (NEW) | `attachXlsxHistoryBootstrap()` — call `xlsxHistoryLoad` on mount, write to slice |
| renderer | `src/renderer/App.tsx` | Call `attachXlsxHistoryBootstrap()` + mount `<ConfirmRoot2 />` |
| renderer i18n | `src/shared/i18n/odx.ts` + en + zh-CN | +4 keys: `dcmConfig.generateNew.confirm.title`, `.message`, `.confirm`, `.cancel` |
| docs | `docs/release-notes/v1.35.0/README.md` | C2 polish: remove "Wait — recompute" duplication |
| docs | `scripts/tier3_push.README.md` | +orphan-recovery section (D13 + D14) |
| vault | `01-Projects/claude-AutosarCfg/development/lessons/` | +4 lesson files (D15) — parent controller dispatch |

## Data Flow (concrete examples)

**History persistence (load on mount)**:

```
App.tsx onMount
   ↓
attachXlsxHistoryBootstrap()
   ↓
window.autosarApi.xlsxHistoryLoad()  → IPC xlsxHistory:load
   ↓
xlsxHistoryLoadHandler()
   ↓
xlsxHistoryStorage.read()
   ↓
JSON.parse(<userData>/xlsx-import-history.json)
   ↓
Readonly<XlsxImportRecord[]>  (cap-5 enforced; corrupt file → [] + warn)
   ↓
useArxmlStore.getState().hydrateXlsxHistory(records)
   ↓
xlsxImportHistory: records (replaces empty [])
```

**History persistence (write on import)**:

```
xlsxEcucBatchImportHandler
   ↓ (success)
   ├── webContents.send('xlsx:import-complete', payload)  // existing
   └── xlsxHistorySaveHandler.write({ rows, source, importedAt: Date.now() })  // NEW
        ↓
        JSON.stringify([record, ...existing].slice(0, 5))
        ↓
        fs.writeFileSync(<userData>/xlsx-import-history.json)
```

**Generate New confirmation (D2)**:

```
User clicks "Generate New" in SuccessDialog
   ↓
useDcmConfigLauncher.handleGenerateNew()
   ↓
window.autosarApi.bswmdPick()  → existing bswmd:pick IPC
   ↓
{ kind: 'opened', path, content }  (or 'canceled' or 'read-failed')
   ↓
NEW: confirmDestructive({
  title: t(locale, 'dcmConfig.generateNew.confirm.title'),
  message: t(locale, 'dcmConfig.generateNew.confirm.message', { path }),
  confirmLabel: t(locale, 'dcmConfig.generateNew.confirm.confirm'),
  cancelLabel: t(locale, 'dcmConfig.generateNew.confirm.cancel'),
})
   ↓
User chooses confirm → proceed with open({odxPath, xlsxRows, bswmdPath: path})
User chooses cancel / Esc / × / backdrop → no-op (no IPC refire)
```

## Key Design Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Custom JSON file via main IPC, NOT electron-store, NOT localStorage** | No new dep; matches existing `xlsx:import-complete` pattern; main-process owned = cross-window coherent. Avoid localStorage (renderer-only, 5MB cap). Avoid electron-store (new 24kb dep + transitive). |
| D2 | **`<ConfirmDialog2>` 2-button modal, separate from existing 3-button `<ConfirmDialog>`** | The existing ConfirmDialog is optimized for unsaved-changes (continue/discard/saveAndProceed). Generate New needs a simpler yes/no modal. Separate components avoid API confusion. |
| D3 | **`hydrateXlsxHistory(records)` action on XlsxImportSlice replaces `xlsxImportHistory`** | The cap-5 + prepend-first invariant is enforced at write time (xlsxHistorySaveHandler) + read time (defensive slice in hydrate); renderer just stores what main gives. |
| D4 | **xlsxHistorySaveHandler called AFTER `xlsx:import-complete` broadcast** | Order: broadcast first (so renderer updates `xlsxLastImport` immediately), persist second (async but file-bound). If persistence fails, `xlsxLastImport` still updated (in-memory state is the source of truth for next `dcm:config` call). |
| D5 | **Corrupted JSON file → reset to `[]` + `console.warn`** | Same pattern as v1.35.0 T1's tier3_push defensive handling. Don't crash on corrupted file. |
| D6 | **Tier 3 push orphan-recovery docs ADDED to existing tier3_push.README.md, not new file** | Append section to existing README; no new doc to maintain. |
| D7 | **4 lessons vault落 = 1 vault dispatch (parent controller, not implementer)** | All 4 are 1-of-1; single pkm-capture dispatch after ship. |
| D8 | **`confirmDestructive` API mirrors `confirm()`** (module-level singleton + promise resolve). | Same pattern as existing ConfirmDialog; minimal new API surface. Safe fallback if root not mounted (resolve with 'cancel' — do not destroy user data). |

## Testing Strategy

| Test surface | Coverage | Δ tests |
|---|---|---|
| `xlsxHistoryStorage.test.ts` (NEW) | Read/write/corrupt/round-trip | +4 |
| `xlsxHistoryLoadHandler.test.ts` (NEW) | IPC handler returns `XlsxImportRecord[]` from storage | +3 |
| `xlsxImportSlice.test.ts` (UPDATED) | New `hydrateXlsxHistory` action (3 cases: empty, normal, defensive cap-5) | +3 |
| `useDcmConfigLauncher.test.ts` (UPDATED) | `handleGenerateNew` calls `confirmDestructive`; on confirm → open(); on cancel → no-op | +2 |
| `ConfirmDialog2.test.tsx` (NEW) | Confirm resolves 'confirm'; cancel/Esc/×/backdrop → 'cancel' | +4 |
| `scripts/tier3_push.test.py` (UPDATED) | 1 new test: auto mode with orphan local commit (simulate via `git reset` to pre-push state) | +1 |
| **Total** | | **+17 net** |

Baseline 3015 + 7 → **3032 + 7 SKIP / 0 fail**.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Corrupted JSON file | Defensive try/catch in `xlsxHistoryStorage.read()`; on error, return `[]` + `console.warn`. Tested. |
| `userData` directory not writable | `xlsxHistorySaveHandler` returns `{ ok: false, error: { kind: 'write-failed', message } }`; renderer surfaces via existing `bswmd-unreadable`-style toast. |
| Confirmation modal races | `confirmDestructive` is a singleton (mirrors `confirm()`); modal stack of 1. Re-entrancy guard on `handleGenerateNew` (existing `inFlightRef`). |
| `userData` path differs by platform (Win/macOS/Linux) | Use `app.getPath('userData')` (Electron standard). |
| `confirmDestructive` added before `ConfirmDialog2` mounts | Same safe fallback as existing `confirm()` (resolve with 'cancel'). |
| `importedAt: Date.now()` in different timezones | UTC milliseconds since epoch — timezone-agnostic by design. |

## Tasks (6 + 1 ship)

```
T1: xlsxHistoryStorage (main) + corrupted-file handling
T2: xlsxHistoryLoadHandler + xlsxHistorySaveHandler (main IPC) + register + preload exposure
T3: hydrateXlsxHistory slice action + attachXlsxHistoryBootstrap (renderer) + App.tsx wiring + xlsx:import-complete save-side hook
T4: <ConfirmDialog2 /> component + confirmDestructive() API + i18n keys (4)
T5: useDcmConfigLauncher.handleGenerateNew wraps bswmd:pick in confirmDestructive + tests
T6: tier3_push orphan-recovery docs + 4 lessons vault dispatch + v1.35.0 release-notes C2 polish
T7: ship
```

(6 implementation tasks + 1 ship task = 7 total. Subagent-Driven execution.)

## Global Constraints

(Verbatim — applies to every task.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` allowed for defensive warnings.
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- `pnpm verify` (7-stage) must pass at T7 ship gate.
- 40-char SHA for `gh release create`.
- TWO separate pushes (no `--follow-tags`) per the
  `follow-tags-unreliable-separate-push-tag` lesson.
- Tier 3 fallback (`scripts/tier3_push.py`) — used in T7 if direct `git push` fails.
- Implementer MUST NOT dispatch `pkm-capture` (parent controller's job — same rule from v1.32.0 T3 finding).
- Implementer MUST NOT make destructive git operations (`reset --hard`,
  `push --force`) on `origin/main`.
- All test additions must include the covering test command and pass
  locally before commit.
- Exact values (i18n key names, kind strings, file paths) MUST match the spec verbatim.

## Out of Scope (deferred to v1.37.0+)

- Multi-BSWMD project override (architectural; deferred since v1.33.0)
- Cross-IPC envelope kind standardization (separate MINOR per envelope)
- Wizard / cross-window sync (far-term)
- History filter / search / export (UX; deferred since v1.34.0; needs different design — re-confirm if still wanted)
- Per-entry delete / clear-all history button (UX; needs destructive-confirm, can ship once `confirmDestructive` infra exists in v1.36.0)
- `parseArxmlLite` canonicalization (YAGNI)

## Reverse-Closes

- v1.34.0 promise "history persistence to electron-store / localStorage"
- v1.33.1 promise "Generate New 二次确认 modal"

## Lessons (NEW from this MINOR, candidates)

1. `custom-json-file-storage-avoids-new-dep` — when persisting small structured state, custom JSON file in userData is often simpler than electron-store. Trade-off: no schema migration vs new dep.
2. `confirm-dialogs-serve-different-scenarios` — 3-button (unsaved-changes) and 2-button (destructive yes/no) are different UI patterns; don't force one API.
3. `tier3-orphan-recovery-needs-explicit-documentation` — when Tier 3 rewrites commit objects (different local vs server SHAs for the same tree), the recovery workflow (`git fetch origin main && git reset --hard origin/main`) needs to be documented in `tier3_push.README.md` so the next maintainer doesn't waste a 30-minute debugging session on the SHA mismatch. (Capture as in-line note in tier3_push.README.md, not a vault lesson — too process-specific.)
4. `history-persistence-without-schema-migration-is-yagni-acceptable` — for a 5-entry cap with a stable shape, JSON.stringify on each save is sufficient. Schema migration is only worth it for >100-entry histories or shared-shape data. (Capture if becomes a 1-of-1.)

## Cross-references

- [v1.35.0 design spec](./2026-07-07-v1-35-0-minor-envelope-error-surface-closure-design.md) (parent MINOR)
- [v1.34.0 design spec](./2026-07-07-v1-34-0-minor-xlsx-import-history-ui-surface-design.md) (introduced `XlsxImportSlice.xlsxImportHistory` session-scope)
- [v1.33.1 PATCH design spec](./2026-07-07-v1-33-1-patch-override-ui-debt-cleanup-design.md) (introduced `handleGenerateNew` without 二次确认)
- [v1.33.0 MINOR design spec](./2026-07-07-v1-33-0-minor-dcm-config-cleanup-design.md) (introduced `xlsx:import-complete` IPC push)
- [v1.35.0 release notes](../release-notes/v1.35.0/README.md) (parent MINOR — C2 polish target)
- `src/renderer/store/slices/xlsxImportSlice.ts` (existing slice to extend with `hydrateXlsxHistory`)
- `src/renderer/hooks/useDcmConfigLauncher.ts:570-598` (existing `handleGenerateNew` to wrap with `confirmDestructive`)
- `src/renderer/components/ConfirmDialog.tsx` (existing 3-button modal — pattern source for ConfirmDialog2)
- `scripts/tier3_push.README.md` (existing README — D13/D14 add orphan-recovery section)