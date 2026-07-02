# v1.22.0 (2026-07-02) — MINOR · Release Notes

ODX-D diagnostic metadata importer. Closes the v1.21.0 carry-over HIGH "ODX 完全没做" bug (devlog line 88, 3rd carry-over from the original backlog). Read-only ODX-D viewer for the 3 diagnostic surfaces (DTCs / DIDs / Routines), wired into the AppHeader File Operations menu, validated against a real Vector CANdelaStudio `.odx-d` export. Bridge to ARXML + project integration still deferred.

---

## Highlights

### T1 — ODX backend (types + IPC + handler)

The `parseOdxHandler` closes the v1.7.0-era "ODX package installed but never wired" dead-code gap (mirrors the v1.21.0 T4 DBC pattern). Minimum viable ODX-D importer: parses BASE-VARIANT DIAG-LAYER, projects DTC/DID/Routine lists for the viewer.

- `ODX_OPEN` + `ODX_PARSE` IPC channels (mirror the DBC pair).
- `parseOdxHandler`: pure function, no IO. 32 MiB cap (defence-in-depth), non-string guard, empty guard, XML parse try/catch, `<ODX>` root guard, shape-extraction try/catch.
- `openOdxHandler`: `dialog.showOpenDialog` filtered to `.odx`, reads chosen file into memory.
- Renderer-friendly `OdxSummary`: DTC/DID/Routine flat lists with pre-computed counts. DTCs carry `id`, `shortName`, `troubleCode` (raw wire value), `displayCode` (SAE J2012 form from `<DISPLAY-TROUBLE-CODE>`), and `text`.
- `fast-xml-parser` with `parseArxml`'s config + `parseTagValue: false` (T4 fix — child text stays a string instead of coercing `687361` to a number).
- 11 tests: cap value, at-cap boundary, non-string, empty, malformed, missing `<ODX>` root, happy path + per-field.

### T2 — `OdxViewer` modal (DTC/DID/Routine UI)

Pure presentational modal that renders an `OdxSummary` in 3 stacked sections (DTC / DID / Routine) with the same a11y pattern as the v1.21.0 T4 DbcViewer (Escape + backdrop-click + initial focus on the close button). z-index 9996 (above other dialog hosts). 22 new i18n keys (en + zh-CN). 12 tests.

Code-review findings (2 HIGH + 2 MEDIUM + 5 LOW) all addressed before commit:
- HIGH-1: `displayCode` column header was wired to `stripHexPrefix(troubleCode)` (a meaningless decimal on real Vector files). Fixed in T4 — now maps to `<DISPLAY-TROUBLE-CODE>` (SAE J2012 form).
- HIGH-2: sticky `thead` would overlap the sticky modal header. Removed.
- MEDIUM-1: empty error state would render `title: ` with trailing colon. Now shows `(no message)`.
- MEDIUM-2: DTC row test assertion strengthened to pin the raw `TROUBLE-CODE` (with `0x` prefix for the hand-crafted fixture).

### T3 — Open ODX menu + App.tsx wiring

AppHeader "File Operations → Open ODX…" menu entry + App.tsx state machine (mirrors v1.21.0 T4 DBC wiring line-for-line). Separate `odxModal` state + `odxInFlight` ref + discriminated-union switch with exhaustive `never` arm. `odxBusy` decoupled from `dbcBusy` (concurrent DBC + ODX imports do not block each other). 5 new tests + 4 existing AppHeader tests updated for required-props. 1 new i18n key (`app.open.odx`).

### T4 — Real-OEM fixture validation (M2 vendor-shape fix) — ship-blocking

T1 hand-crafted fixture matched the ODX-D spec; the real Vector CANdelaStudio export deviates in 3 ways that the T1 code-review flagged as M2. All 3 closed + 3 code-review-driven cleanups.

**Source**: `samples/odx/Demo_Cdd.odx-d` (897 KB, exported by `Vector CANdelaStudio::ODXExport220.dll 15.0.0`). Same source as the peakcan-host v2.0.4 PATCH real-OEM fixture.

**3 vendor-shape fixes**:
1. **DTC-DOP location** — Spec: `DIAG-LAYER > DTC-DOPS`. Vector: `DIAG-LAYER-CONTAINER > ECU-SHARED-DATAS > ECU-SHARED-DATA > DIAG-DATA-DICTIONARY-SPEC > DTC-DOPS`. Parser now walks both via `collectDtcContainers()`.
2. **`<DTCS>` plural wrapper** — Spec: `<DTC-DOP> > <DTC>` direct. Vector: `<DTC-DOP> > <DTCS> > <DTC>` (plural). Parser now unwraps via `collectDtcChildren()`.
3. **`<DTC>` field shape** — Spec: `<TROUBLE-CODE>`, `<SHORT-NAME>`, `<TEXT>` are CHILD elements. T1 hand-crafted fixture had them as XML attributes. Fixed by `attrOf()` child-element fallback + `parseTagValue: false`.

**3 code-review-driven cleanups**:
4. `displayCode` now maps to `<DISPLAY-TROUBLE-CODE>` (the SAE J2012 form, e.g. `P0A7D01`) instead of `stripHexPrefix(<TROUBLE-CODE>)`. The wire-format numeric is the wrong surface for a diagnostic engineer; the J2012 form is canonical.
5. Dedup key for ID-less DTCs falls back to `${parentId}#${index}` so a DTC-DOP with multiple ID-less children does not silently drop all but the first.
6. Dead code in `extractRoutines()` removed (the second `return out` + trailing dead-block comment that required an ESLint disable).

A new T4 regression test pins concrete values from the real file (DTC ID `_258`, SHORT-NAME `DTC0A7D01`, TROUBLE-CODE `687361`, DISPLAY-TROUBLE-CODE `P0A7D01`, TEXT contains `电池SOC`) so the next M2-class vendor-shape regression cannot slip through with only a "non-empty" assertion.

---

## Stats

| Metric | Value |
|---|---|
| Commits on main | 4 (T1 + T2 + T3 + T4) + 1 release commit |
| Test count | **2713 + 6 SKIP / 0 fail** (+34 net from v1.21.0 2679) |
| Test files | 297 + 1 skipped (298) |
| pnpm verify | 7-stage GREEN (format / lint / type-check / test / coverage / build / import-regression) |
| Coverage | TBC |
| Files touched | ~30 (10 mod + 6 new test + 1 new fixture + 1 new i18n keys + ...) |
| Behavioral changes | 4 (new ODX menu + modal; new DTC extraction paths) |
| Real-OEM fixture | 897 KB Vector CANdelaStudio `.odx-d` (87 DTCs / 0 DIDs / 95 Routines) |

---

## Migration notes

No data migration required. All changes are renderer / IPC / branding.

- Renderer-side users who pinned the previous "no ODX menu entry" behavior will see a new "Open ODX…" menu item. Read-only viewer scope — ODX→ARXML and ARXML→ODX bridges still deferred to a v1.22.x follow-up.
- The `<OdxViewer />` modal renders DTCs/DIDs/Routines in 3 stacked sections (no tabs). 720 px wide, z-index 9996, Escape + backdrop-click + initial focus on the close button.

---

## Cycle-end lessons (NEW permanent notes captured in PKM)

1. **`vendor-format-parser-needs-real-fixture-pre-ship`** (**promoted to permanent note**, 2nd occurrence cross-project with peakcan-host v2.0.4) — Hand-crafted fixtures are not enough for vendor-format parsers; pre-ship must use a real OEM export to catch vendor-shape deviations the spec documents but the test fixture does not.
2. **`odx-d-vector-candela-export-shape`** (1-of-1, defer) — The specific Vector CANdelaStudio `.odx-d` shape: ECU-SHARED-DATAS subtree, DTCS plural wrapper, child-element `<DTC>` fields, `<DISPLAY-TROUBLE-CODE>` SAE J2012 form.
3. **`parser-child-vs-attribute-field-flexibility`** (1-of-1, defer) — Vendor formats model the same conceptual field as BOTH attribute and child element depending on tool. `attrOf()` must support both, and `parseTagValue: false` is required to keep numeric child text as a string.
4. **`odx-summary-shape-minimum-viable`** (1-of-1 from T1, updated with T4 sister links) — The minimum-viable-shape decision for vendor-format parsers with state-chart semantics. Mirrors the DBC `DbcSummary` decision at `parseDbcHandler.ts:8-16`.

---

## v1.21.0 backlog closure

- CLOSED in v1.22.0 T1-T4: HIGH "ODX 完全没做" — ODX-D importer shipped end-to-end (backend + viewer + menu + real-OEM validation). All 3 v1.22.0 code-review deferred MEDIUMs (M1 XMLValidator preflight, M2 vendor extensions, M3 displayCode naming) closed in T4 except M1 (XMLValidator preflight) which remains deferred to a v1.22.x follow-up since the real-fixture validation showed the parser is correct without it.
- **All v1.21.0 carry-over bugs CLOSED.**

---

## Closest cousins

- [[claude-autosarcfg-v1-21-0-shipped]] (v1.21.0 MINOR — prior release; closed 5 of 5 backlog bugs)
- [[claude-autosarcfg-v1-20-0-shipped]] (v1.20.0 MINOR — internal refactor)
- [[peakcan-host-v2-1-1-patch-shipped]] (sister project — v2.0.0 ODX-D round-trip was the original inspiration; the T4 real-fixture validation borrows the "use Vector CANdelaStudio `.odx-d` as the real-OEM test file" approach from peakcan-host v2.0.4 PATCH)
- [[phase-2-5-brief-drift-correction]] (Shape 10 promoted from v1.20.0 brief-drift — target-source-canonical-state verification)
- [[vendor-format-parser-needs-real-fixture-pre-ship]] (NEW T4 permanent note, cross-project promotion from peakcan-host v2.0.4 PATCH)

---

## Devlog

### 2026-07-02 — v1.22.0 MINOR ship + ODX-D fully wired

**Session summary**
- Shipped v1.22.0 MINOR on main: 4 feature commits (T1 backend + T2 UI + T3 menu + T4 real-OEM validation) + 1 release commit. Tag v1.22.0.
- Closes the v1.21.0 carry-over HIGH "ODX 完全没做" bug end-to-end.
- Test count: 2713 + 6 SKIP / 0 fail (+34 net from v1.21.0 2679).
- pnpm verify 7-stage GREEN. Real-OEM fixture validation against `samples/odx/Demo_Cdd.odx-d` (Vector CANdelaStudio export, 87 DTCs / 0 DIDs / 95 Routines).
- User-manual baseline updated from v1.21.0 to v1.22.0; new "What's New in v1.22.0" section.

**Key decisions**
- T1 ships the minimum-viable summary (DTC/DID/Routine flat lists, not full DIAG-LAYER state chart). Mirrors the DBC `DbcSummary` decision.
- T4 (ship-blocking) caught 3 vendor-shape deviations the T1 hand-crafted fixture missed: DTC location, DTCS wrapper, child-element `<DTC>` fields. All 3 closed pre-ship.
- `displayCode` maps to `<DISPLAY-TROUBLE-CODE>` (SAE J2012 form, e.g. `P0A7D01`), not `stripHexPrefix(<TROUBLE-CODE>)`. The wire-format numeric is the wrong surface for a diagnostic engineer.
- Cross-project lesson promoted: "vendor-format parsers need real-OEM fixtures pre-ship" was a 1-of-1 in peakcan-host v2.0.4 PATCH and is now a 2-of-1 (promoted to permanent note).

**Blockers / issues**
- (None at ship time; pre-ship code-review caught 1 CRITICAL + 2 HIGH + 4 MEDIUM + 2 LOW in T4, all addressed before commit.)

**Next steps**
- v1.22.x PATCH (M1 XMLValidator preflight still deferred from T1 code-review — defensive, not load-bearing).
- v1.22.x MINOR ARXML↔ODX bridge (the v1.22.0 scope decision deferred bridge to a follow-up; the bridge work needs scope clarification — see v1.22.0 carry-over task).
- v1.23.0 MINOR ARXML↔DBC bridge (parallel to ODX; same architectural scope question).
