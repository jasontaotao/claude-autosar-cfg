# v1.20.0 (2026-07-01) — MINOR · Release Notes

GUI `applyMutation` parity with CLI + Handlebars template helper reshape. Internal refactor release — closes the 2 remaining deferred items from the v1.18.0 §11.1 carry-over list (C2.4 GUI `applyMutation` rewrite + B-3 second half Handlebars template reshape). Zero user-visible feature changes; full test + architectural cleanup of the script-engine + generator boundaries.

---

## Highlights

### T1 C2.4 — GUI `applyMutation` parity with CLI (`useScriptStore.applyMutation` routes through `applyPatchSteps`)

The script engine's mutation replay now uses the same `applyPatchSteps` engine the CLI uses for headless mutate. This eliminates ~71 lines of duplicated GUI helpers (`scriptParamValueToCore` + `findParamInDoc`) and aligns the script-run contract with the headless one.

**New surface:**
- `src/renderer/store/helpers/scriptMutationToPatchStep.ts` — pure mapper: `ScriptMutation` → `PatchStep`
- `src/renderer/store/helpers/resolveModuleDefForActiveDoc.ts` — BSWMD context resolver
- `ScriptStepWarning` type + `ScriptRunResult.warnings?` field (backwards-compatible)

**Behavioral change:** `remove-child` now auto-resolves inbound references via `remove-with-cascade { cascade: true }` (no UI cascade confirmation dialog). The script engine cannot present a dialog mid-script, so auto-cascade is the correct contract. The H2 test was rewritten to assert the new auto-cascade behavior.

**Canonical doc-set path:** the rewrite uses `useArxmlStore.setDoc(applyResult.doc, filePath)` (not `setState({ doc })`) — triggers `displayDoc` recompute + `validationErrors` refresh + dirty flag in one call.

### T2 B-3 second half — Handlebars templates call emit helpers directly

The 3 .hbs templates (`cfg.h.hbs` / `cfg.c.hbs` / `pbcfg.c.hbs`) now call the registered helpers directly via `{{externDecl this}}` / `{{constDecl this}}` / `{{loaderEntry this}}`. The helpers accept object inputs (`ExternDeclInput` / `ConstDeclInput` / `LoaderEntryInput`) and wrap output in `Handlebars.SafeString` so the standard `{{...}}` (escaped) form doesn't HTML-escape the C code.

`ecuc.ts` and `mcu.ts` (both share `templates/ecuc/`) push structured input objects instead of pre-stringified decls. **Snapshot byte-identity preserved** — `git diff testdata/generator/` = empty. The 7 EcuC_Cfg.h/c + EcuC_PBcfg.c files across PreCompile-1 / Mixed-1 / Refs-1 variants regenerate to the same bytes.

---

## Stats

| Metric | Value |
|---|---|
| Commits on main | 4 (T1 + T2 + T3 housekeeping + T4 release) |
| Test count | **2614 + 6 SKIP / 0 fail** (+17 net from v1.19.1 2597) |
| pnpm verify | 8-stage GREEN |
| Snapshot drift | 0 (zero diff on `testdata/generator/`) |
| Files touched | 15 (3 mod + 2 new helper + 2 new test + 1 user-manual + 1 release-notes + ...) |
| Behavioral changes | 1 (T1 auto-cascade) |

---

## Migration notes

No data migration required. All changes are internal refactors.

- Renderer-side `applyMutation` callers that relied on `useArxmlStore.pendingDelete` for cascade UX should migrate to the new `runResult.errorMessage` + in-memory doc update flow. Cascade auto-applies; no dialog state.
- The 7 generator snapshot files remain byte-identical; no test data updates needed.

---

## Cycle-end lessons (NEW process lessons captured in PKM)

1. **Cascade-dialog behavior contract**: no UI in script engine; auto-cascade is the correct contract. The previous GUI used `useArxmlStore.deleteContainer` which sets `pendingDelete`. But the script engine cannot present a dialog mid-script. Auto-cascade via `remove-with-cascade { cascade: true }` is the deterministic, idempotent contract.
2. **Single-engine dispatch eliminates GUI/CLI duplication**. GUI's `scriptParamValueToCore` + `findParamInDoc` were parallel to the CLI's `applyPatchSteps` + `findContainerByPath`. Routing GUI through `applyPatchSteps` deleted ~71 lines + aligned behavior.
3. **`setDoc` is the canonical doc-set path, NOT `setState({ doc })`**. `setDoc` triggers `displayDoc` recompute + `validationErrors` refresh + dirty flag in one call. `setState({ doc })` skips all three.
4. **Pure mapper pattern for cross-engine data shape translation**. `scriptMutationToPatchStep` is a pure function. Mappers at shape boundaries decouple the two shape evolution rates.
5. **Optional field shape discipline**: `ReadonlyArray<T>?` for warnings. `undefined` = old caller / no warnings; `[]` = new caller ran cleanly; never `null`.
6. **Test rewrite > test update when contract changes**. The H2 test was rewritten because the contract change IS the work.
7. **SafeString pattern for Handlebars helpers emitting raw C**. `{{...}}` (escaped) is the standard form; `SafeString` keeps the contract explicit without requiring `{{{...}}}` (triple braces) in templates.
8. **Structured-input pattern decouples shape evolution**. Pushing `ConstDeclInput` objects (not pre-stringified `CONST(...) ... = ...;` strings) lets the template own the rendering contract.
9. **Lockstep migration when templates are shared**. Mcu uses the same `templates/ecuc/` files as EcuC; changing the templates required updating both generators in the same commit.

---

## v1.18.0 spec §11.1 carry-over closure

- CLOSED in v1.19.1: T1 B-3 emit-strategy migration + T2 `isPathInsideReal` symlink defense + T3 feature-flag async migration (3 items).
- CLOSED in v1.20.0: T4 C2.4 GUI `applyMutation` parity + B-3 second half template reshape (2 items).
- **Section 11.1 carry-over list: FULLY CLOSED (5 of 5 items).**

---

## Closest cousins

- [[claude-autosarcfg-v1-19-1-shipped]] (v1.19.1 PATCH — prior release; T1-T3 of v1.20.0 shipped here)
- [[claude-autosarcfg-v1-19-0-shipped]] (v1.19.0 MINOR — GUI Bridge Dispatcher)
- [[claude-autosarcfg-v1-18-5-shipped]] + [[claude-autosarcfg-v1-18-6-shipped]] (C13 split Option B — same split-a-batch pattern)
- [[claude-autosarcfg-v1-15-5-shipped]] (origin of the path-containment hardening that v1.19.1 T2 + v1.19.1 PATCH T2 extend)
- [[phase-2.5-brief-drift-correction]] (Shape 10 promoted from v1.20.0 brief-drift — target-source-canonical-state verification)

---

## Devlog

### 2026-07-01 — v1.20.0 MINOR ship + 2 carry-overs closed

**Session summary**
- Shipped v1.20.0 MINOR on main: 4 commits (T1 + T2 + T3 housekeeping + T4 release). Tag v1.20.0.
- Closes 2 of 2 remaining v1.18.0 §11.1 carry-overs (C2.4 GUI `applyMutation` parity + B-3 second half template reshape).
- Section 11.1 carry-over list: FULLY CLOSED (5 of 5 items).
- Test count: 2614 + 6 SKIP / 0 fail (+17 net from v1.19.1 2597).
- pnpm verify 8-stage GREEN.
- Zero snapshot drift (`git diff testdata/generator/` = empty).
- User-manual baseline updated from v1.15.2 to v1.20.0; 4 new changelog bullets documenting v1.16.0–v1.20.0 capabilities.

**Key decisions**
- **Release granularity = MINOR** for 2 items with zero user-visible changes (T1 C2.4 highest-risk rewrite + T2 B-3 template reshape).
- T1 routes through CLI's `applyPatchSteps` (single-engine dispatch); deletes ~71 lines of GUI duplicate helpers.
- T1 cascade-dialog behavior change: auto-cascade via `remove-with-cascade { cascade: true }` (no UI dialog; script engine cannot present one mid-script).
- T2 templates call `{{externDecl this}}` / `{{constDecl this}}` / `{{loaderEntry this}}` with `SafeString` wrap; helpers accept `ConstDeclInput` / `ExternDeclInput` / `LoaderEntryInput` shape.
- T2 lockstep migration of Mcu (shares `templates/ecuc/`) with EcuC.
- New `ScriptRunResult.warnings?` field (backwards compatible) for non-fatal step diagnostics.

**Blockers / issues**
- (None at ship time; 5 type errors in T1 helper files caught by `tsconfig.web.json` strict mode — all fixed via type predicate + BswmdDocument unwrap + `as const` version literals.)

**Next steps**
- v1.20.x PATCH (if any small follow-up emerges) or v1.21.0 MINOR (Mcu template reshape / B-3 third half).
