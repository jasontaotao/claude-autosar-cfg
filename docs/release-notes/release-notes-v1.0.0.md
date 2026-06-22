## v1.0.0 — Release Ready

First release-ready major for **claude-AutosarCfg**, the standalone desktop GUI
for AUTOSAR BSW configuration. All Wave 1–4 work is shipped and verified.

### Highlights

- **Branch coverage ≥ 90% ship gate met**: 85.45% → **90.72%** (+5.27 pp)
- **876 tests** passing across 71 test files (1 skipped)
- **100% function coverage** across the core + shared layers
- **5/5 baseline green**: format, lint, type-check, test, build
- **830 cross-ref baseline** preserved (signed-guard [700, 850])

### Cumulative work since v0.1.0

| Stage               | Highlights                                                               |
| ------------------- | ------------------------------------------------------------------------ |
| Sprint 0-9          | Core parser, validator, BSWMD, 5-fixture cross-ref baseline (782 signed) |
| Sprint 10-11        | Renderer store, NewProjectDialog, save/load, IPC handlers                |
| Sprint 12 #1        | Namespace-aware path normalize (Sprint 9 #12)                            |
| Sprint 12 #2        | Runtime BSWMD schema layer + schema-unknown disambiguator                |
| Sprint 12 #3        | NewProjectDialog unification, dirty-switch confirm, ipc contract         |
| Sprint 13 #1        | Templates backend (`templates:list` / `templates:copy` IPC, 25 tests)    |
| Sprint 13 Stage 3   | Left-panel + FileListTab refactor                                        |
| Sprint 13 Stage 3.3 | TemplateCard picker (Empty/Classic/Clone)                                |
| Sprint 13 Stage 3.4 | BSWMD chip multi-select (Classic template)                               |
| Sprint 13 Stage 3.5 | Combined Tree View across multiple loaded documents                      |
| Sprint 13 Stage 4   | i18n polish M6/M7/M8                                                     |
| Sprint 13 Stage 5.D | Validators: size cap + default-value + CHOICES depth                     |
| Wave 4.B            | Coverage ≥90% (this release)                                             |

### Wave 4.B (this release) details

- `src/shared/__tests__/path.test.ts` (new) — 7 tests for basename() across
  Unix/Windows separators, trailing separators, and edge cases.
- `src/core/arxml/__tests__/path.test.ts` (+11 tests) — coverage for
  findByPath / findByPathMultiDoc / paramsEqual: too-short paths,
  missing root packages, descending into references (leaf), final cursor
  is a package, value mismatch, index out of range, Windows filePaths.
- `src/core/arxml/__tests__/parser.test.ts` (+7 tests) — defensive
  structure validation: missing AUTOSAR root, missing AR-PACKAGES,
  unsupported version, r-form namespace, SHORT-NAME/LONG-NAME in object
  form, missing DEFINITION-REF body, missing SHORT-NAME on container.
- `src/core/arxml/__tests__/serializer.test.ts` (+5 tests) — option flags
  (xmlDeclaration, version override), longName emission, module
  references with/without DEST.
- `src/core/validation/__tests__/validate.test.ts` (+11 tests) — string
  maxLength oversize/boundary, reference DEST mismatch, schema-unknown
  layer-aware disambiguator (in known module / outside known module /
  catalogued path).
- `src/core/validation/__tests__/runtimeSchema.test.ts` (+3 tests) —
  choices indexing recursion, maxLength mapping, enumerationLiterals mapping.
- `src/core/project/__tests__/manifest.test.ts` (+1 test) — non-string
  path entry defensive coercion.
- `src/core/project/__tests__/bswmd.test.ts` (+1 test) — missing
  AR-PACKAGES branch.

### Verification

```
=== Stage: format ===      PASS
=== Stage: lint ===        PASS
=== Stage: type-check ===  PASS
=== Stage: test ===        PASS (876 passed | 1 skipped)
=== Stage: coverage ===    PASS (90.72% branches, 97.52% stmts)
=== Stage: build ===       PASS
```

### Files

- `package.json`: version `0.16.1` → `1.0.0`
- `CHANGELOG.md`: full v1.0.0 release notes section prepended
- New test file: `src/shared/__tests__/path.test.ts`
- 7 test files extended with focused coverage cases

### Upgrading from v0.16.1

No breaking changes. v1.0.0 is a **MAJOR version bump** by SemVer convention
to signal release-readiness; the API surface is identical to v0.16.1.

---

Released by Wave 4.B (coverage ≥90% + release-ready ship gate).
