# v1.25.0 MINOR — Excel → Com-Stack ECUC 批量创建

> **Ship date:** 2026-07-05
> **Commit:** {{ship-hash}}
> **Tag:** v1.25.0
> **Tests:** 2831 + 6 SKIP / 0 fail (+18 net from v1.24.1's 2813)

## Summary

Closes the v1.24.1 release notes "Next Steps" item that was carried over from v1.23.0's research finding: customers can now batch-create Com-stack value-side instances (ComIPdu / ComSignal / CanIfTxPdu / CanIfRxPdu / PduRRoutingPath) from a single `.xlsx` file. The wizard walks through DownloadTemplate → UploadAndPreview → Commit with per-row collision control.

## What's New

### Wizard (3 steps)

**Step 1 — Download starter template**: click once, get a per-project `.xlsx` whose headers are derived from the project's BSWMD definitions. Never mis-name columns again.

**Step 2 — Upload + preview**: drop in your filled-in `.xlsx`. The wizard parses it, surfaces per-row collisions (rows whose shortName already exists in the project's 3 ECUC files), and lets you pick `overwrite` or `skip` per row. Default = `skip`.

**Step 3 — Commit**: one click applies the patches across all 3 ECUC files atomically. Success dialog shows per-file counts.

### New IPC surface

- `xlsx:writeBatchTemplate` — BSWMD → `.xlsx` bytes.
- `xlsx:parseBatch` — `.xlsx` → `EcucInstanceRow[]` + collision map.
- `xlsx:commitBatch` — apply patches + atomic 3-file write with snapshot rollback.

### New devDep

- `xlsx@^0.18.5` (SheetJS community edition, dynamic-imported in handlers).

## Migration Notes

**No breaking changes.** v1.25.0 is purely additive. Existing `.arxml` files are not modified unless the user explicitly runs the new wizard.

## Out of Scope (deferred)

- `.csv` format (planned for v1.25.x PATCH if confirmed demand).
- Dem/Dcm/Dcm DID/DTC kinds (independent MINOR, e.g. v1.26.0).
- Batch delete (not in scope).
- Generic any-container batch (Excel is wired to Com-stack's 5 kinds only).

## Known Issues

- **Integer-default cosmetic** — When a `.xlsx` cell encodes an integer value that exactly matches the BSWMD `<DEFAULT-VALUE>` for that parameter, the ARXML serializer omits the redundant `<VALUE>` element on write-back. This is the conventional AUTOSAR behaviour (don't emit defaults) and is not a data-mutation bug — diffing the resulting ARXML against the pre-import version will show zero changes for that parameter. Customers who need to force-write defaults can move the cell to a value one off, then back.

## Test Results

- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm lint: 0 errors, 0 warnings
- pnpm format: clean
- pnpm vitest: **2831 + 6 SKIP / 0 fail** (+18 net from v1.24.1's 2813)
  - T1 mapper: 4 new cases PASS
  - T2 IPC handlers: 4 new unit + 1 e2e PASS
  - T3 template: 3 new cases PASS
  - T4 real-OEM fixture: 2 ship-blocking cases PASS (75-row Vector DBC-derived fixture)
  - T5 wizard RTL: 4 new cases PASS
  - All 101 existing v1.23.x / v1.24.x tests continue to pass (backward-compat)
- pnpm verify: 7-stage GREEN

## Next Steps

- v1.25.x PATCH: optional `.csv` support
- v1.26.0 MINOR: Dcm services (0x14/0x19/0x22/0x2E/0x31) generator
